/// <reference path="../pb_data/types.d.ts" />
// Module PMR : déductions à l'enregistrement (période, zone), transitions des prestations, historique
// (`pmr_events`, via lib/pmr.js : les callbacks sont isolés) et conservation des données de santé (anonymisation à 12 mois, archivage des fiches à 24 mois).

// Période et zone déduites si absentes (création comme modification, import compris).
onRecordValidate((e) => {
	const pmr = require(`${__hooks}/lib/pmr.js`);
	if (!e.record.getString('period')) e.record.set('period', pmr.periodOf(e.record.getString('time')));
	if (!e.record.getString('zone') && e.record.getString('station')) {
		const z = pmr.zoneFor(e.app, e.record.getString('station'));
		if (z) e.record.set('zone', z);
	}
	e.next();
}, 'pmr_assists');

onRecordCreateRequest((e) => {
	e.next();
	require(`${__hooks}/lib/pmr.js`).event(e.app, 'assist', e.record.id, 'status', '', e.record.getString('status'), e.auth, '');
}, 'pmr_assists');

onRecordUpdateRequest((e) => {
	const pmr = require(`${__hooks}/lib/pmr.js`);
	const before = e.record.original();
	const from = before.getString('status');
	const to = e.record.getString('status');
	if (before.getBool('anonymized')) throw new BadRequestError('Prestation anonymisée : elle ne se modifie plus.');
	if (from !== to) {
		if ((pmr.TRANSITIONS[from] || []).indexOf(to) === -1) throw new BadRequestError(`Transition impossible : ${from} → ${to}.`);
		if ((to === 'annulee' || to === 'absent') && !e.record.getString('cancel_reason').trim()) {
			throw new BadRequestError('Le motif est obligatoire.');
		}
		if (to === 'prevue') e.record.set('cancel_reason', '');
	}
	const watched = ['time', 'station', 'train', 'day', 'client'];
	const changes = watched.filter((f) => before.getString(f) !== e.record.getString(f)).map((f) => [f, before.getString(f), e.record.getString(f)]);
	e.next();
	if (from !== to) require(`${__hooks}/lib/pmr.js`).event(e.app, 'assist', e.record.id, 'status', from, to, e.auth, e.record.getString('cancel_reason'));
	// Client lié : on trace le lien, jamais le nom (l'historique est lisible avec deplacements:read seul).
	for (const c of changes) {
		const masked = c[0] === 'client' ? [c[1] ? 'lié' : '', c[2] ? 'lié' : ''] : [c[1], c[2]];
		require(`${__hooks}/lib/pmr.js`).event(e.app, 'assist', e.record.id, c[0], masked[0], masked[1], e.auth, '');
	}
}, 'pmr_assists');

onRecordUpdateRequest((e) => {
	const before = e.record.original();
	const fromState = before.getString('state');
	const toState = e.record.getString('state');
	const repairBefore = before.getBool('repair_requested');
	const repairAfter = e.record.getBool('repair_requested');
	e.next();
	if (fromState !== toState) require(`${__hooks}/lib/pmr.js`).event(e.app, 'equipment', e.record.id, 'state', fromState, toState, e.auth, e.record.getString('state_note'));
	if (repairBefore !== repairAfter) require(`${__hooks}/lib/pmr.js`).event(e.app, 'equipment', e.record.id, 'repair_requested', String(repairBefore), String(repairAfter), e.auth, '');
}, 'pmr_equipment');

onRecordCreateRequest((e) => {
	e.next();
	require(`${__hooks}/lib/pmr.js`).event(e.app, 'equipment', e.record.id, 'state', '', e.record.getString('state'), e.auth, 'création');
}, 'pmr_equipment');

onRecordAfterDeleteSuccess((e) => {
	const kind = e.record.collection().name === 'pmr_assists' ? 'assist' : 'equipment';
	e.app.db().newQuery('DELETE FROM pmr_events WHERE kind = {:k} AND record = {:id}').bind({ k: kind, id: e.record.id }).execute();
	e.next();
}, 'pmr_assists', 'pmr_equipment');

// Conservation (décision du 8 octobre 2026, à valider avec le DPO) : chaque nuit à 3 h 15 UTC.
cronAdd('pmr-retention', '15 3 * * *', () => {
	const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
	// Prestations de plus de 12 mois : plus de lien client, de remarque ni de texte d'origine (compteurs gardés).
	$app.db()
		.newQuery(
			"UPDATE pmr_assists SET client = '', note = '', legacy_text = '', cancel_reason = '', anonymized = 1 WHERE anonymized = 0 AND day < {:limit}"
		)
		.bind({ limit: day(365) })
		.execute();
	// Fiches créées il y a plus de 24 mois et sans prestation depuis 24 mois : archivées (pas supprimées).
	$app.db()
		.newQuery(
			'UPDATE pmr_clients SET archived = 1 WHERE archived = 0 AND created < {:limit} AND id NOT IN (SELECT client FROM pmr_assists WHERE client != \'\' AND day >= {:limitDay})'
		)
		.bind({ limit: `${day(730)} 00:00:00.000Z`, limitDay: day(730) })
		.execute();
});
