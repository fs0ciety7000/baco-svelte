/// <reference path="../pb_data/types.d.ts" />
// Module Opérations : main courante (valeurs par défaut, mentions, retrait, historique `ops_log_events`,
// notifications), trains suivis (limite, cron iRail) et purge des notifications. Logique partagée : lib/operations.js.

onRecordCreateRequest((e) => {
	const ops = require(`${__hooks}/lib/operations.js`);
	const r = e.record;
	if (!r.getString('status')) r.set('status', 'active');
	if (!r.getString('occurred_at')) r.set('occurred_at', ops.now());
	if (!r.getString('district') && e.auth && !e.auth.isSuperuser()) r.set('district', e.auth.getString('district'));
	const mentions = ops.mentionsFrom(e.app, r.getString('body'), r.getString('author'));
	r.set('mentions', mentions);
	e.next();
	ops.event(e.app, r.id, 'create', '', '', '', e.auth, '');
	ops.notifyEntry(e.app, r, e.auth, mentions, r.getBool('urgent'));
}, 'ops_log');

onRecordUpdateRequest((e) => {
	const ops = require(`${__hooks}/lib/operations.js`);
	const r = e.record;
	const before = r.original();
	const coord = ops.isCoord(e.auth);
	const from = before.getString('status');
	const to = r.getString('status');
	if (from !== to) {
		if (to === 'retiree') {
			if (!r.getString('retired_reason').trim()) throw new BadRequestError('Le motif du retrait est obligatoire.');
			// Auteur : pendant 15 minutes après la publication ; ensuite, coordinateurs.
			const age = Date.now() - new Date(before.getString('created').replace(' ', 'T')).getTime();
			if (!coord && age > 15 * 60000) throw new ForbiddenError("Passé 15 minutes, seul un coordinateur peut retirer l'entrée.");
		} else {
			if (!coord) throw new ForbiddenError('Seul un coordinateur peut rétablir une entrée retirée.');
			r.set('retired_reason', '');
		}
	} else if (from === 'retiree' && !coord) {
		throw new ForbiddenError('Entrée retirée : elle ne se modifie plus.');
	} else if (r.getString('retired_reason') !== before.getString('retired_reason')) {
		r.set('retired_reason', before.getString('retired_reason'));
	}
	const watched = ['body', 'category', 'occurred_at', 'urgent', 'pinned_until', 'train', 'bus_order', 'taxi_order', 'pmr_assist', 'level_crossing', 'district'];
	const changes = watched.filter((f) => before.getString(f) !== r.getString(f)).map((f) => [f, before.getString(f), r.getString(f)]);
	const filesBefore = ops.ids(before, 'attachments').join(',');
	const filesAfter = ops.ids(r, 'attachments').join(',');
	if (filesBefore !== filesAfter) changes.push(['attachments', String(ops.ids(before, 'attachments').length), String(ops.ids(r, 'attachments').length)]);
	let added = [];
	if (before.getString('body') !== r.getString('body')) {
		const was = ops.ids(before, 'mentions');
		const now = ops.mentionsFrom(e.app, r.getString('body'), r.getString('author'));
		r.set('mentions', now);
		added = now.filter((u) => was.indexOf(u) === -1);
	}
	if (changes.length) r.set('edited_at', ops.now());
	const urgentNow = !before.getBool('urgent') && r.getBool('urgent');
	e.next();
	if (from !== to) ops.event(e.app, r.id, to === 'retiree' ? 'retire' : 'restore', 'status', from, to, e.auth, r.getString('retired_reason'));
	for (const c of changes) ops.event(e.app, r.id, 'edit', c[0], c[1], c[2], e.auth, '');
	if (to === 'active') ops.notifyEntry(e.app, r, e.auth, added, urgentNow);
}, 'ops_log');

onRecordAfterDeleteSuccess((e) => {
	e.app.db().newQuery("DELETE FROM notifications WHERE source = 'ops_log' AND source_id = {:id}").bind({ id: e.record.id }).execute();
	e.next();
}, 'ops_log');

// --- Trains suivis : 10 par agent, pour aujourd'hui ou demain (Europe/Brussels) ---
onRecordCreateRequest((e) => {
	const ops = require(`${__hooks}/lib/operations.js`);
	const r = e.record;
	const today = ops.brusselsDay();
	const tomorrow = ops.brusselsDay(new Date(Date.now() + 86400000));
	if (r.getString('day') !== today && r.getString('day') !== tomorrow) throw new BadRequestError("Un train se suit pour aujourd'hui ou demain.");
	const n = e.app.countRecords('train_watches', $dbx.exp('user = {:u} AND day >= {:d}', { u: r.getString('user'), d: today }));
	if (n >= ops.MAX_WATCHES) throw new BadRequestError(`${ops.MAX_WATCHES} trains suivis au maximum.`);
	if (!r.getInt('threshold_min')) r.set('threshold_min', 5);
	r.set('last_state', {});
	e.next();
}, 'train_watches');

// Toutes les 2 minutes : état iRail des trains suivis du jour → notification au passage du seuil de retard
// (puis par paliers de 10 min) et à la suppression. Une requête par train distinct, délai 5 s.
cronAdd('train-watches', '*/2 * * * *', () => {
	const ops = require(`${__hooks}/lib/operations.js`);
	const today = ops.brusselsDay();
	$app.db().newQuery('DELETE FROM train_watches WHERE day < {:d}').bind({ d: today }).execute();
	const watches = $app.findRecordsByFilter('train_watches', 'day = {:d}', '', 500, 0, { d: today });
	if (!watches.length) return;
	const byTrain = {};
	for (const w of watches) (byTrain[w.getString('train')] = byTrain[w.getString('train')] || []).push(w);
	const ddmmyy = `${today.slice(8, 10)}${today.slice(5, 7)}${today.slice(2, 4)}`;
	for (const train of Object.keys(byTrain)) {
		let state;
		try {
			const res = $http.send({
				url: `https://api.irail.be/v1/vehicle/?id=BE.NMBS.${encodeURIComponent(train)}&date=${ddmmyy}&format=json&lang=fr`,
				method: 'GET',
				headers: { 'User-Agent': 'CSM/1.0 (Client Solutions Management Tool; contact: exploitation)' },
				timeout: 5
			});
			if (res.statusCode !== 200 || !res.json || !res.json.stops) continue;
			const stops = res.json.stops.stop || [];
			let delay = 0;
			let cancelled = false;
			for (const s of stops) if (s.canceled === '1' || s.canceled === 1) cancelled = true;
			// Retard du prochain arrêt pas encore quitté (sinon du dernier).
			const next = stops.filter((s) => s.left !== '1' && s.left !== 1)[0] || stops[stops.length - 1];
			if (next) delay = Math.round(parseInt(next.delay || '0', 10) / 60);
			state = { delay: delay, cancelled: cancelled };
		} catch (_) {
			continue;
		}
		for (const w of byTrain[train]) {
			const last = (() => {
				try {
					return JSON.parse(w.getString('last_state') || '{}') || {};
				} catch (_) {
					return {};
				}
			})();
			const threshold = w.getInt('threshold_min') || 5;
			const notified = last.notifiedDelay || 0;
			const label = w.getString('label') || train;
			const link = `/operations?train=${encodeURIComponent(train)}`;
			let msg = '';
			if (state.cancelled && !last.cancelled) msg = `${label} : suppression signalée`;
			else if (state.delay >= threshold && state.delay >= notified + (notified ? 10 : 0)) msg = `${label} : +${state.delay} min`;
			if (msg) ops.notify($app, w.getString('user'), 'train', msg, 'Train suivi (iRail)', link, 'train_watches', w.id);
			w.set('last_state', { delay: state.delay, cancelled: state.cancelled, notifiedDelay: msg && !state.cancelled ? state.delay : notified, at: ops.now() });
			$app.save(w);
		}
	}
});

// Notifications : lues depuis 30 jours ou créées depuis 90 jours, supprimées (chaque nuit à 3 h 30 UTC).
cronAdd('notifications-purge', '30 3 * * *', () => {
	const day = (n) => `${new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)} 00:00:00.000Z`;
	$app.db().newQuery("DELETE FROM notifications WHERE (read_at != '' AND read_at < {:r}) OR created < {:c}").bind({ r: day(30), c: day(90) }).execute();
});
