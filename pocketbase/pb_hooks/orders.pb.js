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
