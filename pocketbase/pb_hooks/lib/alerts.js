// Alertes et fiabilité DICOS (demande du 11 oct. 2026), chargées par require() depuis orders.pb.js et pmr.pb.js :
// - changements DICOS de dernière minute (mission nouvelle, annulée ou déplacée dans les 3 h) ;
// - missions vues par une synchro DICOS (`last_seen_sync`, base de « Absente de DICOS » côté web).
// La fonction pure dicosChanges a son miroir testé côté web : `web/src/lib/pmr/dicos-changes.ts`. Toute modification se fait des deux côtés.

const HHMM = /^(\d{2}):(\d{2})$/;
const DICOS_HORIZON = 180; // minutes : changement DICOS « de dernière minute »

function minutesOf(hhmm) {
	const m = HHMM.exec(String(hhmm || ''));
	return m ? +m[1] * 60 + +m[2] : -1;
}


// --- Changements DICOS de dernière minute ---

// Bouts assistés d'une mission : IN à la gare de départ (aussi quand aucun sens n'est connu), OUT à l'arrivée.
function legsOf(r) {
	const out = [];
	if (!r) return out;
	const inA = !!r.in_assist || (!r.in_assist && !r.out_assist);
	if (inA) out.push({ io: 'IN', station: r.station || '', time: r.time || '', district: r.district || '' });
	if (r.out_assist) out.push({ io: 'OUT', station: r.other_station || '', time: r.arr_time || '', district: r.arr_district || '' });
	return out;
}

function soon(day, time, today, nowMin) {
	if (day !== today) return false;
	const m = minutesOf(time);
	return m >= 0 && m - nowMin >= 0 && m - nowMin <= DICOS_HORIZON;
}

// Changements entre l'état avant (null = nouvelle fiche) et après une ingestion DICOS : [{ change: new | cancelled |
// time, io, station, time, from, district }], seulement pour aujourd'hui et dans les 3 heures. `allowNew` : une synchro
// complète du jour a déjà eu lieu (sinon la première synchro du matin signalerait toutes les missions).
function dicosChanges(before, after, today, nowMin, allowNew) {
	const out = [];
	if (!after) return out;
	const push = (change, leg, day, from) => {
		if (soon(day, leg.time, today, nowMin)) out.push({ change: change, io: leg.io, station: leg.station, time: leg.time, from: from || '', district: leg.district });
	};
	if (!before) {
		if (allowNew && after.status === 'prevue') for (const l of legsOf(after)) push('new', l, after.day);
		return out;
	}
	const wasCancelled = before.status === 'annulee';
	const isCancelled = after.status === 'annulee';
	if (!wasCancelled && isCancelled) {
		if (before.status === 'prevue') for (const l of legsOf(before)) push('cancelled', l, before.day);
		return out;
	}
	if (after.status !== 'prevue') return out;
	if (wasCancelled) {
		for (const l of legsOf(after)) push('new', l, after.day);
		return out;
	}
	if (before.status !== 'prevue') return out;
	const prev = legsOf(before);
	const next = legsOf(after);
	for (const a of next) {
		const b = prev.filter((x) => x.io === a.io)[0];
		if (!b) push('new', a, after.day);
		else if (a.time !== b.time || after.day !== before.day) {
			if (soon(after.day, a.time, today, nowMin) || soon(before.day, b.time, today, nowMin)) {
				out.push({ change: 'time', io: a.io, station: a.station, time: a.time, from: b.time, district: a.district || b.district });
			}
		}
	}
	for (const b of prev) if (!next.some((x) => x.io === b.io)) push('cancelled', b, before.day);
	return out;
}

const SNAP_TEXT = ['day', 'status', 'time', 'arr_time', 'station', 'other_station', 'district', 'arr_district', 'train', 'pmr_type'];
function snap(record) {
	if (!record) return null;
	const o = {};
	for (const f of SNAP_TEXT) o[f] = record.getString(f);
	o.in_assist = record.getBool('in_assist');
	o.out_assist = record.getBool('out_assist');
	o.pax = record.getInt('pax');
	o.adults = record.getInt('adults');
	o.children = record.getInt('children');
	o.seniors = record.getInt('seniors');
	return o;
}

// Écriture DICOS (compte de service `dicos:write`, source dicos) : alerte les agents des districts de la gare concernée.
function isDicosIngest(record, auth, kind) {
	if (!auth || auth.isSuperuser()) return false;
	if (auth.getString('grants').indexOf('"dicos:write"') === -1) return false;
	return kind === 'groupe' || record.getString('source') === 'dicos';
}

function dicosChangeAlert(app, before, record, kind, auth) {
	if (!isDicosIngest(record, auth, kind)) return 0;
	const ops = require(`${__hooks}/lib/operations.js`);
	const today = ops.brusselsDay();
	const nowMin = Math.floor(ops.brusselsHour() * 60);
	const after = snap(record);
	if (after.day !== today && (!before || before.day !== today)) return 0;
	let allowNew = false;
	if (!before) {
		allowNew =
			app.countRecords('dicos_syncs', $dbx.exp('day = {:d} AND kind = {:k} AND complete = 1', { d: today, k: kind === 'groupe' ? 'groups' : 'missions' })) > 0;
	}
	const changes = dicosChanges(before, after, today, nowMin, allowNew);
	if (!changes.length) return 0;
	const perm = kind === 'groupe' ? 'pmr:read' : 'deplacements:read';
	const users = app
		.findRecordsByFilter('users', 'role != "disabled" && role != "connector" && role != "screen"', '', 500, 0)
		.filter((u) => ops.hasPerm(u, perm, ['moderator', 'paco']));
	const what = kind === 'groupe' ? 'groupe' : 'mission';
	const train = after.train ? `train ${after.train}` : 'train ?';
	const people =
		kind === 'groupe'
			? `groupe de ${after.adults + after.children + after.seniors} pers.`
			: `${after.pax || 1} × ${after.pmr_type || 'PMR'}`;
	const link = `${kind === 'groupe' ? '/groupes' : '/pmr'}?du=${after.day}&au=${after.day}`;
	let sent = 0;
	for (const c of changes) {
		const name = ops.DISTRICT_NAME[c.district];
		if (!name) continue;
		const title =
			c.change === 'new'
				? `DICOS : ${kind === 'groupe' ? 'nouveau groupe' : 'nouvelle mission'} à ${c.station} ${c.time}`
				: c.change === 'cancelled'
					? `DICOS : ${what} annulé${kind === 'groupe' ? '' : 'e'} à ${c.station} ${c.time}`
					: `DICOS : ${what} déplacé${kind === 'groupe' ? '' : 'e'} à ${c.station} (${c.from || '--:--'} → ${c.time || '--:--'})`;
		const body = `${c.io === 'IN' ? 'Embarquement' : 'Débarquement'} · ${train} · ${people}`;
		const sourceId = `${record.id}:${c.change.slice(0, 3)}:${c.io}:${c.time}`.slice(0, 40);
		for (const u of users) {
			if (ops.dutyDistricts(u, today).indexOf(name) === -1) continue;
			const dup = app.countRecords('notifications', $dbx.exp("user = {:u} AND source = 'dicos' AND source_id = {:s}", { u: u.id, s: sourceId }));
			if (dup) continue;
			ops.notify(app, u.id, 'dicos', title, body, link, 'dicos', sourceId, [name]);
			sent++;
		}
	}
	return sent;
}

// --- Missions vues par une synchro DICOS ---

function seenIds(record) {
	try {
		const v = JSON.parse(record.getString('seen') || '[]');
		if (!Array.isArray(v)) return [];
		const out = [];
		for (const x of v) if (typeof x === 'string' && /^j?[A-Za-z0-9_-]{1,99}$/.test(x) && out.length < 5000) out.push(x);
		return out;
	} catch (_) {
		return [];
	}
}

// Début de la synchro dont ce dernier lot (`complete`) fait partie : premier lot du même jour, type et agent après sa
// synchro complète précédente ; lot unique : maintenant.
function sessionStart(app, record) {
	const now = new Date().toISOString().replace('T', ' ');
	const by = record.getString('synced_by');
	const params = { d: record.getString('day'), k: record.getString('kind'), u: by };
	const prev = app.findRecordsByFilter('dicos_syncs', 'day = {:d} && kind = {:k} && synced_by = {:u} && complete = true', '-created', 1, 0, params);
	const after = prev.length ? prev[0].getString('created') : '';
	const first = app.findRecordsByFilter(
		'dicos_syncs',
		`day = {:d} && kind = {:k} && synced_by = {:u}${after ? ' && created > {:a}' : ''}`,
		'created',
		1,
		0,
		Object.assign({ a: after }, params)
	);
	return first.length ? first[0].getString('created') : now;
}

// Pose `last_seen_sync` / `last_seen_by` en SQL (pas d'audit, pas d'événement temps réel, `updated` inchangé : les lignes
// ne « clignotent » pas à chaque synchro).
function markSeen(app, kind, ids, at, by) {
	if (!ids.length || !at) return 0;
	const table = kind === 'groups' ? 'group_missions' : kind === 'missions' ? 'pmr_assists' : '';
	if (!table) return 0;
	app.db()
		.newQuery(`UPDATE ${table} SET last_seen_sync = {:at}, last_seen_by = {:by} WHERE dicos_id IN (SELECT value FROM json_each({:ids}))`)
		.bind({ at: at, by: by || '', ids: JSON.stringify(ids) })
		.execute();
	return ids.length;
}

module.exports = {
	minutesOf,
	legsOf,
	dicosChanges,
	snap,
	dicosChangeAlert,
	seenIds,
	sessionStart,
	markSeen
};
