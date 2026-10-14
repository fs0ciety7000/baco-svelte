/// <reference path="../pb_data/types.d.ts" />
// Rôles v3, lot L3 (14 oct. 2026, docs/design/CADRAGE-ROLES-V3.md §2.4) : collection `roles` (rôles éditables) et
// `users.role` / `users.disabled_role` en texte validé par hook contre `roles.key` (aucune valeur ne change : les règles
// `@request.auth.role = "admin" / "screen" / "connector" / "disabled"` restent justes).
//
// Rôles système insérés avec des permissions EXACTEMENT équivalentes aux rôles par défaut du catalogue (lib/catalog.js) :
// admin / sysop verrouillés « tout » (le calcul de `users.perms` les traite en dur), moderator et paco système modifiables,
// guest système modifiable, screen / connector / disabled verrouillés sans droit. Le calcul de `users.perms`
// (lib/perms.js) lit désormais les permissions du rôle dans cette collection.
//
// `users.role` SelectField → TextField : PocketBase refuse de changer le type d'un champ (« Field type cannot be
// changed ») ; la colonne SQLite est TEXT dans les deux cas, seule la définition JSON du champ change (même id, même nom,
// donc aucune donnée touchée), puis le cache des collections est rechargé.
//
// `app_settings.roles_catalog` : clés du catalogue connues des rôles ; au démarrage, une clé nouvelle du catalogue est
// ajoutée aux rôles système qui la portent par défaut (roles.pb.js), sans toucher aux réglages des admins.

const SYSTEM = [
	{ key: 'admin', label: 'Administrateur', description: 'Tous les droits, administration comprise.', color: 'accent', locked: true, sort: 10 },
	{ key: 'sysop', label: 'Sysop', description: 'Tous les droits, administration comprise (exploitation technique).', color: 'accent', locked: true, sort: 20 },
	{ key: 'moderator', label: 'Modérateur', description: 'PACO/RCCA, plus la suppression, la modération du Journal et les annonces.', color: 'neutral', locked: false, sort: 30 },
	{ key: 'paco', label: 'PACO/RCCA', description: 'Lecture partout, création et modification, sans suppression.', color: 'neutral', locked: false, sort: 40 },
	{ key: 'guest', label: 'Invité', description: 'Lecture des bons bus et taxi.', color: 'neutral', locked: false, sort: 50 },
	{ key: 'screen', label: 'Écran', description: "Poste partagé : l'écran commun /tv seulement.", color: 'neutral', locked: true, sort: 60 },
	{ key: 'connector', label: 'Connecteur', description: 'Compte de service (extension DICOS, Quinyx).', color: 'neutral', locked: true, sort: 70 },
	{ key: 'disabled', label: 'Désactivé', description: 'Compte désactivé : aucune connexion.', color: 'neutral', locked: true, sort: 80 }
];
const COLORS = ['accent', 'info', 'ok', 'warn', 'progress', 'neutral'];

function roleField(name, required, id) {
	return {
		autogeneratePattern: '',
		help: '',
		hidden: false,
		id: id,
		max: 40,
		min: 0,
		name: name,
		pattern: '^[a-z][a-z0-9_-]{1,39}$',
		presentable: false,
		primaryKey: false,
		required: required,
		system: false,
		type: 'text'
	};
}

function selectField(name, required, id, values) {
	return { help: '', hidden: false, id: id, maxSelect: 1, name: name, presentable: false, required: required, system: false, type: 'select', values: values };
}

// Remplace la définition JSON d'un champ de `users` (même id, même nom) puis recharge le cache des collections.
function swapUserField(app, name, make) {
	const row = new DynamicModel({ fields: '' });
	app.db().newQuery("SELECT fields FROM _collections WHERE name = 'users'").one(row);
	const fields = JSON.parse(row.fields);
	const i = fields.findIndex((f) => f.name === name);
	if (i === -1) throw new Error(`users.${name} introuvable`);
	fields[i] = make(fields[i]);
	app.db().newQuery("UPDATE _collections SET fields = {:f} WHERE name = 'users'").bind({ f: JSON.stringify(fields) }).execute();
	app.reloadCachedCollections();
}

migrate(
	(app) => {
		const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
		const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
		const users = app.findCollectionByNameOrId('users');
		const roles = new Collection({
			type: 'base',
			name: 'roles',
			// Libellés et couleurs : affichés à tout agent (menus, annuaire, Journal). Écriture : admin / sysop, garde-fous
			// dans roles.pb.js (verrouillé, système, utilisé, clé figée, permissions du catalogue seulement).
			listRule: ACTIVE,
			viewRule: ACTIVE,
			createRule: `${ACTIVE} && ${ADMIN}`,
			updateRule: `${ACTIVE} && ${ADMIN}`,
			deleteRule: `${ACTIVE} && ${ADMIN}`,
			fields: [
				{ name: 'key', type: 'text', required: true, max: 40, pattern: '^[a-z][a-z0-9_-]{1,39}$' },
				{ name: 'label', type: 'text', required: true, max: 60 },
				{ name: 'description', type: 'text', max: 300 },
				{ name: 'color', type: 'select', values: COLORS, maxSelect: 1 },
				{ name: 'perms', type: 'json', maxSize: 20000 },
				{ name: 'system', type: 'bool' },
				{ name: 'locked', type: 'bool' },
				{ name: 'sort', type: 'number', onlyInt: true },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_roles_key ON roles (key)']
		});
		app.save(roles);
		roles.fields.add(new RelationField({ name: 'based_on', collectionId: roles.id, maxSelect: 1 }));
		app.save(roles);

		const cat = require(`${__hooks}/lib/catalog.js`);
		const keys = cat.CATALOG.map((e) => e.key);
		for (const s of SYSTEM) {
			const r = new Record(roles);
			r.set('key', s.key);
			r.set('label', s.label);
			r.set('description', s.description);
			r.set('color', s.color);
			r.set('system', true);
			r.set('locked', s.locked);
			r.set('sort', s.sort);
			const perms =
				cat.FULL_ROLES.indexOf(s.key) !== -1
					? keys
					: cat.NO_MODULE_ROLES.indexOf(s.key) !== -1
						? []
						: cat.CATALOG.filter((e) => e.roles.indexOf(s.key) !== -1).map((e) => e.key);
			r.set('perms', perms);
			app.save(r);
		}

		swapUserField(app, 'role', (f) => roleField('role', true, f.id));
		swapUserField(app, 'disabled_role', (f) => roleField('disabled_role', false, f.id));

		const settings = app.findCollectionByNameOrId('app_settings');
		let reg;
		try {
			reg = app.findFirstRecordByData('app_settings', 'key', 'roles_catalog');
		} catch (_) {
			reg = new Record(settings);
			reg.set('key', 'roles_catalog');
		}
		reg.set('value', { keys: keys });
		app.save(reg);
	},
	(app) => {
		const ROLES = ['admin', 'sysop', 'moderator', 'paco', 'guest', 'disabled', 'connector', 'screen'];
		swapUserField(app, 'role', (f) => selectField('role', true, f.id, ROLES));
		swapUserField(app, 'disabled_role', (f) => selectField('disabled_role', false, f.id, ['admin', 'sysop', 'moderator', 'paco', 'guest', 'screen']));
		try {
			app.delete(app.findFirstRecordByData('app_settings', 'key', 'roles_catalog'));
		} catch (_) {
			// Absent.
		}
		app.delete(app.findCollectionByNameOrId('roles'));
	}
);
