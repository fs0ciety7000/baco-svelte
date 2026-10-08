/// <reference path="../pb_data/types.d.ts" />
// Module PMR : déductions à l'enregistrement (période, zone), transitions des prestations, historique
// (`pmr_events`, via lib/pmr.js : les callbacks sont isolés) et conservation des données de santé (anonymisation à 12 mois, archivage des fiches à 24 mois).

// Période toujours déduite de l'heure ; zone déduite de la gare seulement si elle est vide (création, import).
onRecordValidate((e) => {
	const pmr = require(`${__hooks}/lib/pmr.js`);
	const time = e.record.getString('time');
	if (time) e.record.set('period', pmr.periodOf(time));
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
	// Gare changée sans zone dans la requête : zone recalculée (vide si la gare n'est pas au référentiel). Une zone
	// envoyée avec la gare (formulaire web) est respectée, même si elle diffère du référentiel.
	const body = e.requestInfo().body || {};
	if (body.station !== undefined && body.zone === undefined && before.getString('station') !== e.record.getString('station')) {
		e.record.set('zone', pmr.zoneFor(e.app, e.record.getString('station')));
	}
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
	const watched = ['time', 'station', 'train', 'day', 'client', 'cancel_reason'];
	// Le motif est déjà dans l'événement de transition : tracé à part seulement s'il change sans transition.
	const changes = watched.filter((f) => before.getString(f) !== e.record.getString(f) && !(f === 'cancel_reason' && from !== to)).map((f) => [f, before.getString(f), e.record.getString(f)]);
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

// Dernière activité d'une fiche client (prestation ou taxi lié) : base de l'archivage à 24 mois.
onRecordAfterCreateSuccess((e) => {
	const field = e.record.collection().name === 'taxi_orders' ? 'pmr_client' : 'client';
	const id = e.record.getString(field);
	if (id) {
		e.app.db()
			.newQuery('UPDATE pmr_clients SET last_activity = {:at} WHERE id = {:id}')
			.bind({ at: new Date().toISOString().replace('T', ' '), id: id })
			.execute();
	}
	e.next();
}, 'pmr_assists', 'taxi_orders');

onRecordAfterUpdateSuccess((e) => {
	const field = e.record.collection().name === 'taxi_orders' ? 'pmr_client' : 'client';
	const id = e.record.getString(field);
	if (id && id !== e.record.original().getString(field)) {
		e.app.db()
			.newQuery('UPDATE pmr_clients SET last_activity = {:at} WHERE id = {:id}')
			.bind({ at: new Date().toISOString().replace('T', ' '), id: id })
			.execute();
	}
	e.next();
}, 'pmr_assists', 'taxi_orders');

// Conservation (décision du 8 octobre 2026, à valider avec le DPO) : chaque nuit à 3 h 15 UTC.
// Après 12 mois, plus rien ne relie une prestation ou un taxi PMR à une personne : lien client, référence DICOS,
// remarque, motif, texte BACO, notes d'historique, journal d'audit ; copies PMR des commandes taxi. Les compteurs
// (date, gare, type, nombre, statut) restent. Fiches sans activité depuis 24 mois : archivées.
cronAdd('pmr-retention', '15 3 * * *', () => {
	const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
	const q = (sql, params) => $app.db().newQuery(sql).bind(params || {}).execute();
	const limit = day(365);
	q(
		"UPDATE pmr_assists SET client = '', dicos_ref = '', note = '', cancel_reason = '', anonymized = 1 WHERE anonymized = 0 AND day < {:limit}",
		{ limit: limit }
	);
	q("DELETE FROM pmr_assist_legacy WHERE assist IN (SELECT id FROM pmr_assists WHERE anonymized = 1)");
	q("UPDATE pmr_events SET note = '', \"from\" = CASE WHEN field IN ('status') THEN \"from\" ELSE '' END, \"to\" = CASE WHEN field IN ('status') THEN \"to\" ELSE '' END WHERE kind = 'assist' AND record IN (SELECT id FROM pmr_assists WHERE anonymized = 1)");
	q("DELETE FROM audit_log WHERE collection = 'pmr_assists' AND record IN (SELECT id FROM pmr_assists WHERE anonymized = 1)");
	// Taxis PMR de plus de 12 mois : copie nominative et lien vers la fiche effacés.
	q(
		"UPDATE taxi_orders SET pmr_client = '', pmr_last_name = '', pmr_first_name = '', pmr_phone = '', pmr_file = '', pmr_reason = '', passenger_name = '' WHERE is_pmr = 1 AND trip_at != '' AND trip_at < {:at} AND (pmr_client != '' OR pmr_last_name != '' OR pmr_phone != '')",
		{ at: `${limit} 00:00:00.000Z` }
	);
	q("DELETE FROM audit_log WHERE collection = 'taxi_orders' AND at < {:at} AND record IN (SELECT id FROM taxi_orders WHERE is_pmr = 1)", { at: `${limit} 00:00:00.000Z` });
	// Fiches sans activité (prestation ou taxi) depuis 24 mois : archivées ; leur journal d'audit de plus de 24 mois purgé.
	const old = `${day(730)} 00:00:00.000Z`;
	q(
		"UPDATE pmr_clients SET archived = 1 WHERE archived = 0 AND ((last_activity != '' AND last_activity < {:old}) OR (last_activity = '' AND created < {:old}))",
		{ old: old }
	);
	q("DELETE FROM audit_log WHERE collection = 'pmr_clients' AND at < {:old} AND record IN (SELECT id FROM pmr_clients WHERE archived = 1)", { old: old });
});
