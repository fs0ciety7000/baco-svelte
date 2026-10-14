/// <reference path="../pb_data/types.d.ts" />
// Horaires Quinyx (demande du 14 oct. 2026, docs/design/CADRAGE-QUINYX.md) : l'extension lit le planning PUBLIÉ des
// groupes Quinyx configurés dans un onglet Quinyx connecté et l'envoie à CSM (`POST /api/equipe/quinyx/ingest`, même
// jeton de connecteur que DICOS). Seules les prestations PACO / RCCA / EXTRA affectées à un agent sont gardées.
//   - `quinyx_groups` : groupes Quinyx à lire (identifiant saisi par un admin, jamais dans Git), district par défaut,
//     état de la dernière synchro (écrit par le connecteur) ;
//   - `quinyx_places` : table « lieu → district » (« MONS » → DSO, « OCC SE » → DSE…), modifiable par un admin ;
//   - `quinyx_agents` : agent Quinyx (identifiant + nom) et compte CSM rattaché (proposé par le nom, validé par un admin) ;
//   - `quinyx_shifts` : une fiche par prestation Quinyx (jour, début, fin, code, section, type, district).
// Lecture du planning : tout agent actif sauf Invité et Écran. Écriture : connecteur seulement (et admin pour la
// correspondance). Prestations gardées 90 jours après leur date (cron `quinyx-retention`, à valider DPO).

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = `${ACTIVE} && (@request.auth.role = "admin" || @request.auth.role = "sysop")`;
const CONNECTOR = `${ACTIVE} && @request.auth.role = "connector" && @request.auth.grants ~ '"dicos:write"'`;
const READ = `${ACTIVE} && @request.auth.role != "guest" && @request.auth.role != "screen"`;
const DISTRICTS = ['DSO', 'DSE', 'DCE', 'DNO', 'DNE'];
const unset = (...names) => names.map((n) => `@request.body.${n}:isset = false`).join(' && ');

// Table de départ fournie par l'utilisateur le 14 oct. 2026 (lieux, pas de donnée personnelle).
const PLACES = [
	['MONS', 'DSO'],
	['OCC SO', 'DSO'],
	['NAMUR', 'DSE'],
	['OCC SE', 'DSE']
];

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		app.save(
			new Collection({
				type: 'base',
				name: 'quinyx_groups',
				// Lu par les agents pour la fraîcheur du planning (« synchronisé il y a… ») ; le serveur ne leur renvoie
				// que le libellé et la date.
				listRule: READ,
				viewRule: READ,
				createRule: ADMIN,
				updateRule: `(${ADMIN}) || ((${CONNECTOR}) && ${unset('group_id', 'label', 'district', 'enabled')})`,
				deleteRule: ADMIN,
				fields: [
					{ name: 'group_id', type: 'text', required: true, max: 15, pattern: '^\\d{1,15}$' },
					{ name: 'label', type: 'text', required: true, max: 80 },
					{ name: 'district', type: 'select', values: DISTRICTS, maxSelect: 1 },
					{ name: 'enabled', type: 'bool' },
					{ name: 'last_sync', type: 'date' },
					{ name: 'last_from', type: 'text', max: 10 },
					{ name: 'last_to', type: 'text', max: 10 },
					{ name: 'last_count', type: 'number', onlyInt: true, min: 0 },
					{ name: 'last_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'last_version', type: 'text', max: 12 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_quinyx_groups_gid ON quinyx_groups (group_id)']
			})
		);

		const places = new Collection({
			type: 'base',
			name: 'quinyx_places',
			listRule: `(${ADMIN}) || (${CONNECTOR})`,
			viewRule: `(${ADMIN}) || (${CONNECTOR})`,
			createRule: ADMIN,
			updateRule: ADMIN,
			deleteRule: ADMIN,
			fields: [
				{ name: 'pattern', type: 'text', required: true, max: 40 },
				{ name: 'district', type: 'select', required: true, values: DISTRICTS, maxSelect: 1 },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_quinyx_places_pattern ON quinyx_places (pattern)']
		});
		app.save(places);
		for (const [pattern, district] of PLACES) {
			const r = new Record(places);
			r.set('pattern', pattern);
			r.set('district', district);
			app.save(r);
		}

		const agents = new Collection({
			type: 'base',
			name: 'quinyx_agents',
			listRule: READ,
			viewRule: READ,
			createRule: `(${CONNECTOR}) && ${unset('user', 'confirmed')}`,
			// Le connecteur met à jour le nom et la proposition ; seul un admin rattache (ou détache) un compte.
			updateRule: `((${CONNECTOR}) && ${unset('quinyx_id', 'user', 'confirmed')}) || ((${ADMIN}) && ${unset('quinyx_id')})`,
			deleteRule: ADMIN,
			fields: [
				{ name: 'quinyx_id', type: 'text', required: true, max: 15, pattern: '^\\d{1,15}$' },
				{ name: 'first_name', type: 'text', max: 80 },
				{ name: 'last_name', type: 'text', max: 80 },
				{ name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'user_suggested', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'confirmed', type: 'bool' },
				{ name: 'groups', type: 'json', maxSize: 2000 },
				{ name: 'last_seen', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_quinyx_agents_qid ON quinyx_agents (quinyx_id)',
				'CREATE INDEX idx_quinyx_agents_user ON quinyx_agents (user)'
			]
		});
		app.save(agents);

		app.save(
			new Collection({
				type: 'base',
				name: 'quinyx_shifts',
				listRule: READ,
				viewRule: READ,
				createRule: CONNECTOR,
				updateRule: `(${CONNECTOR}) && ${unset('quinyx_id')}`,
				deleteRule: `(${CONNECTOR}) || (${ADMIN})`,
				fields: [
					{ name: 'quinyx_id', type: 'text', required: true, max: 20, pattern: '^\\d{1,20}$' },
					{ name: 'group_id', type: 'text', required: true, max: 15, pattern: '^\\d{1,15}$' },
					{ name: 'agent', type: 'relation', required: true, collectionId: agents.id, maxSelect: 1, cascadeDelete: true },
					{ name: 'day', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'start', type: 'date', required: true },
					{ name: 'end', type: 'date', required: true },
					{ name: 'code', type: 'text', required: true, max: 80 },
					{ name: 'section', type: 'text', max: 80 },
					{ name: 'kind', type: 'select', required: true, values: ['am', 'pm', 'nuit', 'extra', 'autre'], maxSelect: 1 },
					{ name: 'district', type: 'select', values: DISTRICTS, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_quinyx_shifts_qid ON quinyx_shifts (quinyx_id)',
					'CREATE INDEX idx_quinyx_shifts_day ON quinyx_shifts (day)',
					'CREATE INDEX idx_quinyx_shifts_agent_day ON quinyx_shifts (agent, day)',
					'CREATE INDEX idx_quinyx_shifts_group_day ON quinyx_shifts (group_id, day)'
				]
			})
		);
	},
	(app) => {
		for (const name of ['quinyx_shifts', 'quinyx_agents', 'quinyx_places', 'quinyx_groups']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
	}
);
