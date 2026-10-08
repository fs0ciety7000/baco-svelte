/// <reference path="../pb_data/types.d.ts" />
// Missions de GROUPE DICOS (écoles, mouvements de jeunesse… : réservation « Group », sans PMR), demande du 9 oct. 2026.
// Une ligne par TRAJET (`dicos_id` = « j<journeyId> », comme les missions PMR), écrite par le compte de service DICOS
// (`dicos:write`), lue avec `pmr:read` (même équipe, même écran). Le contact du groupe (nom, téléphone, e-mail) est une
// donnée personnelle : même lecture que le nominatif PMR, purgé par la rétention comme les missions PMR (12 mois).

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
const DISTRICT_CODES = ['DCE', 'DSE', 'DSO'];

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'group_missions',
				listRule: `(${can('pmr:read', READERS)}) || (${DICOS})`,
				viewRule: `(${can('pmr:read', READERS)}) || (${DICOS})`,
				createRule: `(${DICOS}) && @request.body.dicos_id != ""`,
				updateRule: `(${DICOS}) && @request.body.dicos_id:isset = false`,
				deleteRule: ADMIN,
				fields: [
					{ name: 'dicos_id', type: 'text', required: true, max: 100 },
					{ name: 'day', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'time', type: 'text', max: 5 },
					{ name: 'station', type: 'text', max: 200 },
					{ name: 'district', type: 'select', maxSelect: 1, values: DISTRICT_CODES },
					{ name: 'other_station', type: 'text', max: 200 },
					{ name: 'arr_time', type: 'text', max: 5 },
					{ name: 'arr_district', type: 'select', maxSelect: 1, values: DISTRICT_CODES },
					{ name: 'in_assist', type: 'bool' },
					{ name: 'out_assist', type: 'bool' },
					{ name: 'transport', type: 'select', maxSelect: 1, values: ['train', 'taxi'] },
					{ name: 'train', type: 'text', max: 20 },
					{ name: 'dicos_ref', type: 'text', max: 40 },
					{ name: 'group_name', type: 'text', max: 300 },
					{ name: 'adults', type: 'number', onlyInt: true, min: 0, max: 2000 },
					{ name: 'children', type: 'number', onlyInt: true, min: 0, max: 2000 },
					{ name: 'seniors', type: 'number', onlyInt: true, min: 0, max: 2000 },
					{ name: 'status', type: 'select', required: true, maxSelect: 1, values: ['prevue', 'realisee', 'annulee'] },
					{ name: 'coach', type: 'text', max: 20 },
					{ name: 'meeting_point', type: 'text', max: 300 },
					{ name: 'contact_first', type: 'text', max: 200 },
					{ name: 'contact_last', type: 'text', max: 200 },
					{ name: 'contact_phone', type: 'text', max: 100 },
					{ name: 'contact_email', type: 'text', max: 200 },
					{ name: 'updated_by', type: 'relation', collectionId: app.findCollectionByNameOrId('users').id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_group_missions_dicos ON group_missions (dicos_id)',
					'CREATE INDEX idx_group_missions_day ON group_missions (day, time)'
				]
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('group_missions'));
		} catch (_) {}
	}
);
