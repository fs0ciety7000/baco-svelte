/// <reference path="../pb_data/types.d.ts" />
// Cycle de vie des commandes : transitions contrôlées, horodatages et historique (`order_events`).
// La logique est dans lib/orders.js (hooks isolés : require() dans chaque callback).

// Numéro de bon attribué à la création (y compris à l'import, qui peut le fixer lui-même). Calculé dans
// « Execute », c.-à-d. dans la transaction d'écriture (SQLite sérialise les écritures) : pas de doublon quand
// deux agents créent en même temps.
onRecordCreateExecute((e) => {
	if (!e.record.getInt('number')) {
		const orders = require(`${__hooks}/lib/orders.js`);
		e.record.set('number', orders.nextNumber(e.app, e.record.collection().name));
	}
	e.next();
}, 'bus_orders', 'taxi_orders');

onRecordCreateRequest((e) => {
	e.next();
	const orders = require(`${__hooks}/lib/orders.js`);
	orders.writeEvent(e.app, e.record, '', e.record.getString('status'), e.auth, '');
}, 'bus_orders', 'taxi_orders');

onRecordUpdateRequest((e) => {
	const orders = require(`${__hooks}/lib/orders.js`);
	const from = e.record.original().getString('status');
	const to = e.record.getString('status');
	const changed = orders.checkTransition(e.app, e.record, from, to, e.auth);
	if (changed) orders.stamp(e.record, from, to, e.auth);
	e.next();
	if (changed) orders.writeEvent(e.app, e.record, from, to, e.auth, to === 'annule' ? e.record.getString('cancel_reason') : '');
}, 'bus_orders', 'taxi_orders');

// Suppression d'une commande : son historique part avec elle.
onRecordAfterDeleteSuccess((e) => {
	const kind = e.record.collection().name === 'bus_orders' ? 'bus' : 'taxi';
	e.app.db().newQuery('DELETE FROM order_events WHERE kind = {:kind} AND "order" = {:id}').bind({ kind: kind, id: e.record.id }).execute();
	e.next();
}, 'bus_orders', 'taxi_orders');

// Société citée par un bon : suppression refusée (le bon et son PDF garderaient un fournisseur vide). Fournisseurs gérés
// dans CSM depuis le 11 oct. 2026 (Commandes › Fournisseurs).
onRecordDeleteRequest((e) => {
	const orders = require(`${__hooks}/lib/orders.js`);
	const n = orders.companyUses(e.app, e.record.collection().name, e.record.id);
	if (n > 0) throw new BadRequestError(`Société citée par ${n} bon${n > 1 ? 's' : ''} : suppression impossible.`);
	e.next();
}, 'bus_companies', 'taxi_companies');

// Relance d'un fournisseur pour un bon envoyé non confirmé : note l'événement dans l'historique (aucun e-mail envoyé
// par CSM : l'agent télécharge le brouillon .eml). Droits : ceux de la modification du bon (règles de la collection).
routerAdd('POST', '/api/csm/orders/{kind}/{id}/reminder', (e) => {
	const kind = e.request.pathValue('kind');
	const id = e.request.pathValue('id');
	if ((kind !== 'bus' && kind !== 'taxi') || !/^[a-z0-9-]{15,36}$/.test(id)) return e.json(404, { message: 'Not found.' });
	const orders = require(`${__hooks}/lib/orders.js`);
	const count = orders.remind(e.app, kind, id, e.auth, e.requestInfo());
	return e.json(200, { count: count });
}, $apis.requireAuth('users'));
