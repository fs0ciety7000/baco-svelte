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
	// N° de commande aléatoire (`order_ref`), toujours posé par le serveur : création par l'API, import complet et
	// import différentiel (app.save passe par ce hook). Une valeur reçue d'un client est vidée par le hook de requête.
	if (!e.record.getString('order_ref')) {
		e.record.set('order_ref', require(`${__hooks}/lib/orders.js`).newOrderRef(e.app));
	}
	e.next();
}, 'bus_orders', 'taxi_orders');

onRecordCreateRequest((e) => {
	// `order_ref` n'est jamais choisi par le client (duplication, modèle, corps forgé) : un n° neuf est tiré ci-dessus.
	e.record.set('order_ref', '');
	e.next();
	const orders = require(`${__hooks}/lib/orders.js`);
	orders.writeEvent(e.app, e.record, '', e.record.getString('status'), e.auth, '');
}, 'bus_orders', 'taxi_orders');

onRecordUpdateRequest((e) => {
	const orders = require(`${__hooks}/lib/orders.js`);
	// N° de commande figé : toute valeur envoyée est ignorée (on remet celle d'origine).
	e.record.set('order_ref', e.record.original().getString('order_ref'));
	const from = e.record.original().getString('status');
	const to = e.record.getString('status');
	const changed = orders.checkTransition(e.app, e.record, from, to, e.auth);
	if (changed) orders.stamp(e.record, from, to, e.auth);
	e.next();
	if (changed) orders.writeEvent(e.app, e.record, from, to, e.auth, to === 'annule' ? e.record.getString('cancel_reason') : '');
}, 'bus_orders', 'taxi_orders');

// Suppression d'un bon : droit de suppression du module, ou son créateur pendant 8 h (lib/orders.js `checkDelete`).
onRecordDeleteRequest((e) => {
	require(`${__hooks}/lib/orders.js`).checkDelete(e.record, e.auth);
	e.next();
}, 'bus_orders', 'taxi_orders');

// Suppression d'une commande : son historique part avec elle (les liens du Journal sont vidés par PocketBase, relation
// facultative ; le PDF archivé `order_pdfs` est gardé, référencé par identifiant texte).
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
