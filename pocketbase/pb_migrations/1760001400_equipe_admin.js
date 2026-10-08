/// <reference path="../pb_data/types.d.ts" />
// Modules Équipe et Admin (décisions du 9 oct. 2026 : comptes gérés par admin/sysop seuls ; pas de planning, de
// congés, de « présents », ni de partie sociale).
// - users : création et gestion (mot de passe sans l'ancien) par admin/sysop ; connexion refusée aux comptes
//   désactivés (`authRule`) ; `disabled_role` garde le rôle d'avant la désactivation pour la réactivation.
// - changelog : « Nouveautés », lues par tous, écrites par admin/sysop/moderator (la v1 oubliait sysop).
// - app_settings : réglages globaux (mode maintenance), lus par tout agent actif, écrits par admin/sysop.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const COORD = `(${ADMIN} || @request.auth.role = "moderator")`;
const ROLES = ['admin', 'sysop', 'moderator', 'otto_agent', 'user', 'reader'];

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.createRule = `${ACTIVE} && ${ADMIN}`;
		users.manageRule = `${ACTIVE} && ${ADMIN}`;
		users.authRule = 'role != "disabled"';
		if (!users.fields.getByName('disabled_role'))
			users.fields.add(new SelectField({ name: 'disabled_role', maxSelect: 1, values: ROLES }));
		// L'agent ne modifie ni `disabled_role` ni son identifiant de connexion (`username`, usurpation d'un collègue :
		// audit du 9 oct.) ; un compte désactivé ne modifie plus rien avec un ancien jeton.
		users.updateRule = users.updateRule
			.replace(
				'@request.body.email:isset = false',
				'@request.body.email:isset = false && @request.body.disabled_role:isset = false && @request.body.username:isset = false'
			)
			.replace('(id = @request.auth.id', '(@request.auth.role != "disabled" && id = @request.auth.id');
		app.save(users);

		app.save(
			new Collection({
				type: 'base',
				name: 'changelog',
				listRule: ACTIVE,
				viewRule: ACTIVE,
				createRule: `${ACTIVE} && ${COORD} && @request.body.author = @request.auth.id`,
				updateRule: `${ACTIVE} && ${COORD} && @request.body.author:isset = false`,
				deleteRule: `${ACTIVE} && ${COORD}`,
				fields: [
					{ name: 'legacy_id', type: 'number', onlyInt: true },
					{ name: 'title', type: 'text', required: true, max: 200 },
					{ name: 'type', type: 'select', required: true, maxSelect: 1, values: ['nouveau', 'ameliore', 'corrige'] },
					{ name: 'content', type: 'text', max: 20000 },
					{ name: 'author', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE INDEX idx_changelog_created ON changelog (created)']
			})
		);

		app.save(
			new Collection({
				type: 'base',
				name: 'app_settings',
				listRule: ACTIVE,
				viewRule: ACTIVE,
				createRule: `${ACTIVE} && ${ADMIN} && @request.body.updated_by = @request.auth.id`,
				updateRule: `${ACTIVE} && ${ADMIN} && @request.body.updated_by = @request.auth.id && @request.body.key:isset = false`,
				deleteRule: null,
				fields: [
					{ name: 'key', type: 'text', required: true, max: 100, pattern: '^[a-z0-9_]+$' },
					{ name: 'value', type: 'json', maxSize: 20000 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key)']
			})
		);
	},
	(app) => {
		for (const name of ['app_settings', 'changelog']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
		const users = app.findCollectionByNameOrId('users');
		users.createRule = null;
		users.manageRule = null;
		users.authRule = '';
		users.updateRule = users.updateRule
			.replace(' && @request.body.disabled_role:isset = false && @request.body.username:isset = false', '')
			.replace('(@request.auth.role != "disabled" && id = @request.auth.id', '(id = @request.auth.id');
		users.fields.removeByName('disabled_role');
		app.save(users);
	}
);
