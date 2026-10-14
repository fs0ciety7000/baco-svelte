/// <reference path="../pb_data/types.d.ts" />
// Rôles v3, lot L1 (14 oct. 2026, docs/design/CADRAGE-ROLES-V3.md) : `users.perms` = permissions effectives de l'agent,
// calculées par le hook de users.pb.js (lib/perms.js + lib/catalog.js) à chaque création / modification, à partir de
// role / grants / denies. Ici : ajout du champ et calcul pour tous les comptes existants. Les règles d'accès ne changent
// pas encore (lot L2). Écrit en SQL : ni `updated`, ni audit, ni événement temps réel pour un champ dérivé.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		if (!users.fields.getByName('perms')) {
			users.fields.add(new JSONField({ name: 'perms', maxSize: 20000 }));
			app.save(users);
		}
		const perms = require(`${__hooks}/lib/perms.js`);
		const records = app.findAllRecords('users');
		for (const r of records) {
			app
				.db()
				.newQuery('UPDATE users SET perms = {:p} WHERE id = {:id}')
				.bind({ p: JSON.stringify(perms.permsOf(r)), id: r.id })
				.execute();
		}
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.fields.removeByName('perms');
		app.save(users);
	}
);
