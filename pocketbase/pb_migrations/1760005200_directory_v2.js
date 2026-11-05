/// <reference path="../pb_data/types.d.ts" />
// Annuaire v2 (5 nov. 2026, décisions de l'utilisateur) : les champs texte libres `category`, `group`, `zone` de
// `directory_contacts` mélangeaient service, fonction et zone (« MIA » + « SPI FMS », « RCC-OCC » + « PACO » + « FCR »…).
//   - `directory_services` : services de l'annuaire (clé figée, libellé, ordre, fonctions proposées, `updated_by` posé par
//     hook). Lecture = celle des contacts (Écran exclu) ; écriture `referentiels:manage` ; suppression refusée par hook tant
//     qu'un contact l'utilise. Six services amorcés (`lib/directory.js` → SEED).
//   - `directory_contacts.service` (clé d'un service, validée par hook ; vide = « à classer ») et `function` (≤ 60) ;
//     `zone` gardée, normalisée en majuscules. `category` et `group` sont GARDÉS (archive, import BACO, retour arrière) mais
//     ne sont plus affichés.
//   - Reprise des fiches par `mapLegacy` (lib/directory.js, partagée avec l'import différentiel) **par SQL** : `updated`
//     inchangé (l'import différentiel compare `updated` à la date de l'import initial) et aucune ligne d'audit.
// Retour arrière : champs et collection retirés ; la zone reste en majuscules et la plage « 9 h – 17 h » ajoutée en tête
// de la remarque des fiches B-Clean UP reste (sans effet sur les anciens écrans).

migrate(
	(app) => {
		const dir = require(`${__hooks}/lib/directory.js`);
		const users = app.findCollectionByNameOrId('users');
		const contacts = app.findCollectionByNameOrId('directory_contacts');

		const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
		const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
		const NS = '@request.auth.role != "screen"';
		const manage = `(${ACTIVE} && (${ADMIN} || @request.auth.perms ~ '"referentiels:manage"'))`;
		// Lecture : exactement celle des contacts (repertoire:read, Écran exclu).
		const read = contacts.listRule || `(${ACTIVE} && (${ADMIN} || @request.auth.perms ~ '"repertoire:read"')) && ${NS}`;

		const services = new Collection({
			type: 'base',
			name: 'directory_services',
			listRule: read,
			viewRule: read,
			createRule: `${manage} && ${NS}`,
			updateRule: `${manage} && @request.body.key:changed = false && ${NS}`,
			deleteRule: `${manage} && ${NS}`,
			fields: [
				{ name: 'key', type: 'text', required: true, max: 30, pattern: '^[a-z][a-z0-9_-]{1,29}$' },
				{ name: 'label', type: 'text', required: true, max: 60 },
				{ name: 'sort', type: 'number', onlyInt: true, min: 0, max: 9999 },
				{ name: 'functions', type: 'json', maxSize: 8000 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_directory_services_key ON directory_services (`key`)']
		});
		app.save(services);
		for (const [key, label, sort, functions] of dir.SEED) {
			const r = new Record(services);
			r.set('key', key);
			r.set('label', label);
			r.set('sort', sort);
			r.set('functions', functions);
			app.save(r);
		}

		contacts.fields.add(new TextField({ name: 'service', max: 30 }));
		contacts.fields.add(new TextField({ name: 'function', max: dir.FUNCTION_MAX }));
		contacts.addIndex('idx_directory_service', false, 'service', '');
		app.save(contacts);

		// Reprise : SQL direct (ni `updated`, ni audit, ni hook).
		const rows = arrayOf(new DynamicModel({ id: '', category: '', group: '', zone: '', note: '' }));
		app.db()
			.newQuery('SELECT id, category, [[group]] AS [[group]], zone, note FROM directory_contacts')
			.all(rows);
		for (const row of rows) {
			const m = dir.mapLegacy(row.category, row.group, row.zone);
			app.db()
				.newQuery(
					'UPDATE directory_contacts SET service = {:s}, [[function]] = {:f}, zone = {:z}, note = {:n} WHERE id = {:id}'
				)
				.bind({ s: m.service, f: m.function, z: m.zone, n: dir.legacyNote(row.note, m), id: row.id })
				.execute();
		}
	},
	(app) => {
		const contacts = app.findCollectionByNameOrId('directory_contacts');
		contacts.removeIndex('idx_directory_service');
		contacts.fields.removeByName('service');
		contacts.fields.removeByName('function');
		app.save(contacts);
		try {
			app.delete(app.findCollectionByNameOrId('directory_services'));
		} catch (_) {}
	}
);
