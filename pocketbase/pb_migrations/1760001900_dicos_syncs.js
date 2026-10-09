/// <reference path="../pb_data/types.d.ts" />
// Journal des synchros DICOS (audit UX du 9 oct. 2026) : les écrans Missions PMR et Groupes affichent « synchronisé il
// y a X min » et distinguent « aucune mission » de « pas encore synchronisé ». Une fiche par envoi de l'extension
// (jour concerné, type, compteurs). Rien de nominatif. Écrit par le compte connecteur, lu avec pmr:read.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const DICOS = `${ACTIVE} && @request.auth.grants ~ '"dicos:write"'`;
function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	const denied = `@request.auth.denies !~ '"${perm}"'`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && ${denied}) || ${granted})`;
}
const READERS = ['moderator', 'user', 'reader'];

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'dicos_syncs',
				listRule: `(${can('pmr:read', READERS)}) || (${DICOS})`,
				viewRule: `(${can('pmr:read', READERS)}) || (${DICOS})`,
				createRule: DICOS,
				updateRule: null,
				deleteRule: ADMIN,
				fields: [
					{ name: 'day', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['missions', 'groups', 'schedules'] },
					{ name: 'received', type: 'number', min: 0, max: 100000, onlyInt: true },
					{ name: 'created_count', type: 'number', min: 0, max: 100000, onlyInt: true },
					{ name: 'updated_count', type: 'number', min: 0, max: 100000, onlyInt: true },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE INDEX idx_dicos_syncs_day ON dicos_syncs (day, kind)',
					'CREATE INDEX idx_dicos_syncs_created ON dicos_syncs (created)'
				]
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('dicos_syncs'));
		} catch (_) {}
	}
);
