/// <reference path="../pb_data/types.d.ts" />
// Services non alignés (23 oct. 2026, suite de `1760005000`) : sur Quinyx, un commentaire « +SE » sur une prestation d'OCC Mons
// (ou « +SO » sur OCC Namur) signifie que l'agent a fait les deux postes : celui de l'autre OCC n'a pas eu son propre agent.
//   - `quinyx_covers` : une fiche par prestation PACO / RCCA portant un tel marqueur (jour, début, fin, code, section, type,
//     fonction, district de la prestation, `cover` = district de l'autre poste couvert : DSO / DSE / DCE). Ni agent ni texte
//     du commentaire (l'extension n'envoie que le code du marqueur) : aucune donnée personnelle.
// Mêmes règles que `quinyx_open_shifts` : lecture `quinyx_open:read` (admin / sysop par défaut), écriture compte de service.

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
				name: 'quinyx_covers',
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
					{ name: 'cover', type: 'select', required: true, values: DISTRICTS, maxSelect: 1 },
					{ name: 'last_seen', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_quinyx_covers_qid ON quinyx_covers (quinyx_id)',
					'CREATE INDEX idx_quinyx_covers_group_day ON quinyx_covers (group_id, day)',
					'CREATE INDEX idx_quinyx_covers_day ON quinyx_covers (day)'
				]
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('quinyx_covers'));
		} catch (_) {}
	}
);
