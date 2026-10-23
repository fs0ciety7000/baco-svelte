/// <reference path="../pb_data/types.d.ts" />
// Services Quinyx non pourvus (demande du 23 oct. 2026) : prestations PACO / RCCA (AM, PM, Nuit) publiées dans Quinyx sans
// agent affecté, pour OCC Mons et OCC Namur. L'extension (1.11.0) les lit avec le planning publié et les envoie dans le même
// lot (`open`) ; CSM les garde ici, sans aucune donnée personnelle (pas d'agent).
//   - `quinyx_open_shifts` : une fiche par prestation Quinyx non pourvue (jour, début, fin, code, section, type, fonction
//     PACO / RCCA, district). Une prestation pourvue ou supprimée dans Quinyx disparaît à la synchro complète suivante.
// Lecture : clé `quinyx_open:read` (admin / sysop par défaut, accordable à un rôle). Écriture : compte de service seul ;
// suppression aussi par un admin.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = `${ACTIVE} && (@request.auth.role = "admin" || @request.auth.role = "sysop")`;
const CONNECTOR = `${ACTIVE} && @request.auth.role = "connector" && @request.auth.grants ~ '"dicos:write"'`;
const NS = '@request.auth.role != "screen"';
const READ = `((${ADMIN}) || (${ACTIVE} && @request.auth.perms ~ '"quinyx_open:read"' && ${NS}) || (${CONNECTOR}))`;
const DISTRICTS = ['DSO', 'DSE', 'DCE', 'DNO', 'DNE'];
const unset = (...names) => names.map((n) => `@request.body.${n}:isset = false`).join(' && ');

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'quinyx_open_shifts',
				listRule: READ,
				viewRule: READ,
				createRule: CONNECTOR,
				updateRule: `(${CONNECTOR}) && ${unset('quinyx_id')}`,
				deleteRule: `(${CONNECTOR}) || (${ADMIN})`,
				fields: [
					{ name: 'quinyx_id', type: 'text', required: true, max: 20, pattern: '^\\d{1,20}$' },
					{ name: 'group_id', type: 'text', required: true, max: 15, pattern: '^\\d{1,15}$' },
					{ name: 'day', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'start', type: 'date', required: true },
					{ name: 'end', type: 'date', required: true },
					{ name: 'code', type: 'text', required: true, max: 80 },
					{ name: 'section', type: 'text', max: 80 },
					{ name: 'kind', type: 'select', required: true, values: ['am', 'pm', 'nuit', 'autre'], maxSelect: 1 },
					{ name: 'function', type: 'select', required: true, values: ['paco', 'rcca'], maxSelect: 1 },
					{ name: 'district', type: 'select', values: DISTRICTS, maxSelect: 1 },
					{ name: 'status', type: 'text', max: 20 },
					{ name: 'last_seen', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_quinyx_open_qid ON quinyx_open_shifts (quinyx_id)',
					'CREATE INDEX idx_quinyx_open_group_day ON quinyx_open_shifts (group_id, day)',
					'CREATE INDEX idx_quinyx_open_day ON quinyx_open_shifts (day)'
				]
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('quinyx_open_shifts'));
		} catch (_) {}
	}
);
