/// <reference path="../pb_data/types.d.ts" />
// Module PMR (session 3). Décisions du 8 octobre 2026 (docs/CSM-V2.md, docs/design/AUDIT-UX-PMR.md) :
// - saisie de la « journée » abandonnée (inutilisée depuis le 3 mai 2026) : plus de pmr_days ni de diffusion ;
// - prestation STRUCTURÉE par assistance (liste simple), collée depuis DICOS, réf. DICOS + client facultatif,
//   aucun nom en texte libre (le texte v1 est gardé à part dans `pmr_assist_legacy`, lisible avec pmr:read, effacé à l'anonymisation) ;
// - données de santé anonymisées après 12 mois, fiches sans prestation depuis 24 mois archivées (hook cron) ;
// - matériel : tout agent `pmr:write` change l'état et demande une réparation ; création / suppression par les
//   coordinateurs ; zones modifiables par les coordinateurs, rattachées à un district.
// Historique (`pmr_events`) écrit par les hooks seulement (`pb_hooks/pmr.pb.js`).

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const COORD = `${ACTIVE} && (${ADMIN} || @request.auth.role = "moderator")`;

function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	if (roles.length === 0) return `${ACTIVE} && (${ADMIN} || ${granted})`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}

const READERS = ['moderator', 'user', 'reader'];
const WRITERS = ['moderator', 'user'];
const DISTRICTS = ['Sud-Ouest', 'Sud-Est', 'Centre'];
const PMR_TYPES = ['NV', 'CRF', 'CRE', 'CRP', 'MR', 'AUTRE'];

function addFields(col, fields) {
	const ctors = { text: TextField, number: NumberField, select: SelectField, relation: RelationField, date: DateField, json: JSONField, bool: BoolField };
	for (const f of fields) if (!col.fields.getByName(f.name)) col.fields.add(new ctors[f.type](f));
}

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		// --- Zones (référentiel modifiable par les coordinateurs) ---
		const zones = new Collection({
			type: 'base',
			name: 'pmr_zones',
			listRule: ACTIVE,
			viewRule: ACTIVE,
			createRule: COORD,
			updateRule: COORD,
			deleteRule: ADMIN,
			fields: [
				{ name: 'code', type: 'text', required: true, max: 10, pattern: '^[A-Z0-9]{2,10}$' },
				{ name: 'label', type: 'text', max: 100 },
				{ name: 'district', type: 'select', maxSelect: 1, values: DISTRICTS },
				// Codes PtCar (ou noms) des gares de la zone : déduction de la zone à la saisie.
				{ name: 'stations', type: 'json', maxSize: 20000 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_pmr_zones_code ON pmr_zones (code)']
		});
		app.save(zones);

		// --- Fiches clients : type normalisé, archivage, auteur ---
		const clients = app.findCollectionByNameOrId('pmr_clients');
		addFields(clients, [
			{ name: 'type_detail', type: 'text', max: 200 },
			{ name: 'archived', type: 'bool' },
			{ name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
			// Dernière prestation ou commande taxi liée (posée par hook) : base de l'archivage à 24 mois, qui ne
			// dépend pas des liens effacés par l'anonymisation à 12 mois.
			{ name: 'last_activity', type: 'date' }
		]);
		clients.addIndex('idx_pmr_clients_phone', false, 'phone', '');
		const clientBase = `(${can('pmr:write', WRITERS)}) && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.last_activity:isset = false`;
		clients.createRule = `${clientBase} && @request.body.created_by = @request.auth.id`;
		clients.updateRule = `${clientBase} && @request.body.created_by:changed = false`;
		app.save(clients);

		// --- Prestations (une par assistance) ---
		const assists = new Collection({
			type: 'base',
			name: 'pmr_assists',
			listRule: can('deplacements:read', READERS),
			viewRule: can('deplacements:read', READERS),
			// Lien client (données de santé) : seulement avec pmr:read ; champs de reprise BACO jamais écrits par l'API.
			createRule:
				`(${can('deplacements:write', WRITERS)}) && @request.body.created_by = @request.auth.id && ` +
				'@request.body.updated_by = @request.auth.id && @request.body.status = "prevue" && @request.body.anonymized:isset = false && ' +
				`@request.body.legacy_id:isset = false && (@request.body.client:isset = false || @request.body.client = "" || (${can('pmr:read', READERS)}))`,
			updateRule:
				`(${can('deplacements:write', WRITERS)}) && @request.body.created_by:changed = false && ` +
				'@request.body.updated_by = @request.auth.id && @request.body.anonymized:isset = false && @request.body.legacy_id:isset = false && ' +
				`(@request.body.client:isset = false || (${can('pmr:read', READERS)}))`,
			deleteRule: COORD,
			fields: [
				{ name: 'day', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
				{ name: 'time', type: 'text', max: 5, pattern: '^$|^\\d{2}:\\d{2}$' },
				{ name: 'period', type: 'select', maxSelect: 1, values: ['matin', 'apres_midi', 'nuit'] },
				{ name: 'direction', type: 'select', maxSelect: 1, values: ['arrivee', 'depart'] },
				{ name: 'train', type: 'text', max: 20 },
				{ name: 'station', type: 'text', max: 100 },
				{ name: 'zone', type: 'relation', collectionId: zones.id, maxSelect: 1 },
				{ name: 'dicos_ref', type: 'text', max: 20, pattern: '^$|^\\d{4}-\\d{2}-\\d{2}-\\d{4}$' },
				{ name: 'pax', type: 'number', onlyInt: true, min: 0, max: 50 },
				{ name: 'pmr_type', type: 'select', maxSelect: 1, values: PMR_TYPES },
				{ name: 'client', type: 'relation', collectionId: clients.id, maxSelect: 1 },
				{ name: 'note', type: 'text', max: 1000 },
				{ name: 'status', type: 'select', required: true, maxSelect: 1, values: ['prevue', 'realisee', 'annulee', 'absent'] },
				{ name: 'cancel_reason', type: 'text', max: 500 },
				{ name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'legacy_id', type: 'text', max: 40 },
				{ name: 'anonymized', type: 'bool' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_pmr_assists_day ON pmr_assists (day, time)',
				'CREATE INDEX idx_pmr_assists_ref ON pmr_assists (dicos_ref)',
				'CREATE INDEX idx_pmr_assists_client ON pmr_assists (client)'
			]
		});
		app.save(assists);

		// Texte d'origine de BACO (peut contenir un nom) : à part, lisible seulement avec pmr:read, jamais écrit par
		// l'API, effacé à l'anonymisation (une règle PocketBase ne masque pas un champ, d'où la collection séparée).
		app.save(
			new Collection({
				type: 'base',
				name: 'pmr_assist_legacy',
				listRule: can('pmr:read', READERS),
				viewRule: can('pmr:read', READERS),
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'assist', type: 'relation', collectionId: assists.id, maxSelect: 1, required: true, cascadeDelete: true },
					{ name: 'text', type: 'text', max: 2000 }
				],
				indexes: ['CREATE UNIQUE INDEX idx_pmr_assist_legacy ON pmr_assist_legacy (assist)']
			})
		);

		// --- Matériel (rampes) : état par tout agent pmr:write, création par les coordinateurs ---
		const equipment = new Collection({
			type: 'base',
			name: 'pmr_equipment',
			listRule: can('pmr:read', READERS),
			viewRule: can('pmr:read', READERS),
			createRule: `(${COORD}) && @request.body.updated_by = @request.auth.id`,
			// Hors coordinateurs : seulement l'état, sa précision et la demande de réparation.
			updateRule:
				`(${can('pmr:write', WRITERS)}) && @request.body.updated_by = @request.auth.id && ((${COORD}) || (` +
				['station', 'platform', 'zone', 'assistance', 'ramp_type', 'ramp_id', 'padlock', 'valid_until', 'ramp_note', 'station_restrictions', 'station_info', 'legacy_id']
					.map((f) => `@request.body.${f}:isset = false`)
					.join(' && ') +
				'))',
			deleteRule: COORD,
			fields: [
				{ name: 'station', type: 'text', required: true, max: 100 },
				{ name: 'platform', type: 'text', max: 50 },
				{ name: 'zone', type: 'relation', collectionId: zones.id, maxSelect: 1 },
				{ name: 'assistance', type: 'select', maxSelect: 1, values: ['3h', 'full', 'light', 'taxi'] },
				{ name: 'ramp_type', type: 'text', max: 100 },
				{ name: 'ramp_id', type: 'text', max: 50 },
				{ name: 'state', type: 'select', required: true, maxSelect: 1, values: ['ok', 'hs', 'en_attente'] },
				{ name: 'state_note', type: 'text', max: 500 },
				{ name: 'repair_requested', type: 'bool' },
				{ name: 'padlock', type: 'text', max: 100 },
				// Dernier jour du mois de validité (« oct-25 » en v1) ; vide si inconnue.
				{ name: 'valid_until', type: 'text', max: 10, pattern: '^$|^\\d{4}-\\d{2}-\\d{2}$' },
				{ name: 'ramp_note', type: 'text', max: 2000 },
				{ name: 'station_restrictions', type: 'text', max: 2000 },
				{ name: 'station_info', type: 'text', max: 2000 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'legacy_id', type: 'number', onlyInt: true },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_pmr_equipment_station ON pmr_equipment (station, platform)',
				'CREATE UNIQUE INDEX idx_pmr_equipment_legacy ON pmr_equipment (legacy_id) WHERE legacy_id > 0'
			]
		});
		app.save(equipment);

		// --- Historique (prestations, matériel) : hooks seulement ---
		const readEvents =
			`(kind = "assist" && ${can('deplacements:read', READERS)}) || ` +
			`((kind = "equipment" || kind = "client") && ${can('pmr:read', READERS)})`;
		app.save(
			new Collection({
				type: 'base',
				name: 'pmr_events',
				listRule: readEvents,
				viewRule: readEvents,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['assist', 'equipment', 'client'] },
					{ name: 'record', type: 'text', required: true, max: 36 },
					{ name: 'field', type: 'text', max: 50 },
					{ name: 'from', type: 'text', max: 200 },
					{ name: 'to', type: 'text', max: 200 },
					{ name: 'by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'note', type: 'text', max: 500 },
					{ name: 'at', type: 'date', required: true }
				],
				indexes: ['CREATE INDEX idx_pmr_events_record ON pmr_events (kind, record, at)']
			})
		);
	},
	(app) => {
		for (const name of ['pmr_events', 'pmr_equipment', 'pmr_assist_legacy', 'pmr_assists']) app.delete(app.findCollectionByNameOrId(name));
		const clients = app.findCollectionByNameOrId('pmr_clients');
		clients.removeIndex('idx_pmr_clients_phone');
		const old = `(${can('pmr:write', WRITERS)}) && @request.body.updated_by = @request.auth.id`;
		clients.createRule = old;
		clients.updateRule = old;
		for (const f of ['type_detail', 'archived', 'created_by', 'last_activity']) clients.fields.removeByName(f);
		app.save(clients);
		app.delete(app.findCollectionByNameOrId('pmr_zones'));
	}
);
