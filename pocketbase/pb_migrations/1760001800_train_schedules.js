/// <reference path="../pb_data/types.d.ts" />
// Horaires ATMS (demande du 9 oct. 2026) : temps d'arrêt prévus des trains des missions PMR / groupes, lus par
// l'extension dans un onglet ATMS connecté (même principe que DICOS) et poussés à CSM. Une fiche par train et par jour ;
// `stops` = arrêts planifiés (abréviation PtCar, nom, arrivée, départ, temps d'arrêt, position). Données
// d'exploitation, rien de nominatif. Lues pour l'export ALEA (« Obligatoire »), écrites par le compte connecteur.

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
				name: 'train_schedules',
				listRule: `(${can('pmr:read', READERS)}) || (${DICOS})`,
				viewRule: `(${can('pmr:read', READERS)}) || (${DICOS})`,
				createRule: DICOS,
				updateRule: `(${DICOS}) && @request.body.day:isset = false && @request.body.train:isset = false`,
				deleteRule: ADMIN,
				fields: [
					{ name: 'day', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'train', type: 'text', required: true, max: 10, pattern: '^\\d{1,6}$' },
					{ name: 'label', type: 'text', max: 20 },
					{ name: 'stops', type: 'json', maxSize: 100000 },
					{ name: 'source', type: 'select', maxSelect: 1, values: ['atms'] },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_train_schedules_day_train ON train_schedules (day, train)']
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('train_schedules'));
		} catch (_) {}
	}
);
