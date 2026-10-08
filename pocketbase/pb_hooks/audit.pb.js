/// <reference path="../pb_data/types.d.ts" />
// Journal d'audit : remplace les triggers Supabase log_audit_action / log_audit_diff.
// Chaque création, modification ou suppression faite par l'API (donc par un agent, via le serveur Next)
// écrit une ligne dans `audit_log` : auteur, action, différentiel avant/après.
// Les imports en ligne de commande ne passent pas par ces hooks (pas d'audit pour la reprise de données).
// Les hooks JSVM sont isolés : la logique partagée est chargée par require() dans chaque callback.

onRecordCreateRequest((e) => {
	e.next();
	const audit = require(`${__hooks}/lib/audit.js`);
	audit.write(e.app, 'create', e.record, {}, audit.snapshot(e.record), e.auth);
}, 'users', 'bus_companies', 'bus_orders', 'taxi_orders');

onRecordUpdateRequest((e) => {
	const audit = require(`${__hooks}/lib/audit.js`);
	const before = audit.snapshot(e.record.original());
	e.next();
	audit.write(e.app, 'update', e.record, before, audit.snapshot(e.record), e.auth);
}, 'users', 'bus_companies', 'bus_orders', 'taxi_orders');

onRecordDeleteRequest((e) => {
	const audit = require(`${__hooks}/lib/audit.js`);
	const before = audit.snapshot(e.record);
	e.next();
	audit.write(e.app, 'delete', e.record, before, {}, e.auth);
}, 'users', 'bus_companies', 'bus_orders', 'taxi_orders');
