/// <reference path="../pb_data/types.d.ts" />
// N° de commande (4 nov. 2026, demande de l'utilisateur) : « le numéro de commande est totalement indépendant et c'est lui
// qui doit être généré ; peu importe si un numéro TC est indiqué ou non ; en aucun cas il ne remplace le numéro TC ».
//   - `order_ref` (texte) sur `bus_orders` et `taxi_orders` : `CMD-` + 6 caractères (alphabet de Crockford sans 0 / 1),
//     unique sur les deux collections, tiré par le hook `orders.pb.js` à la création (API, import, import différentiel),
//     jamais modifiable (valeur du client vidée à la création, remise à l'originale à la modification).
//   - `relation` (n° TC saisi par l'agent) et `number` (n° de bon séquentiel, repris de BACO) restent inchangés.
//   - Bons existants : un n° neuf chacun, par SQL (sans toucher `updated` ni l'audit).
// Index unique partiel (`WHERE order_ref != ''`) : un texte vide vaut '' (pas NULL).

migrate(
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			const col = app.findCollectionByNameOrId(name);
			col.fields.add(new TextField({ name: 'order_ref', max: 20, pattern: '^(CMD-[0-9A-Z]{6})?$' }));
			col.addIndex(`idx_${name}_order_ref`, true, 'order_ref', "order_ref != ''");
			app.save(col);
		}
		const orders = require(`${__hooks}/lib/orders.js`);
		for (const name of ['bus_orders', 'taxi_orders']) {
			const rows = arrayOf(new DynamicModel({ id: '' }));
			app.db().newQuery(`SELECT id FROM ${name} WHERE order_ref IS NULL OR order_ref = ''`).all(rows);
			for (const row of rows) {
				app.db()
					.newQuery(`UPDATE ${name} SET order_ref = {:r} WHERE id = {:id}`)
					.bind({ r: orders.newOrderRef(app), id: row.id })
					.execute();
			}
		}
	},
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			const col = app.findCollectionByNameOrId(name);
			col.removeIndex(`idx_${name}_order_ref`);
			col.fields.removeByName('order_ref');
			app.save(col);
		}
	}
);
