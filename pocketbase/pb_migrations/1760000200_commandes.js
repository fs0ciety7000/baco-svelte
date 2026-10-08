/// <reference path="../pb_data/types.d.ts" />
// Module Commandes (étape 5, session 3) : cycle de vie unifié bus + taxi avec historique, référentiels
// fournisseurs (sociétés, chauffeurs, contacts, lignes desservies, taxis), clients PMR (fiche minimale,
// complétée par le module PMR), lignes / gares pour les arrêts, modèles partagés, remise B201.
//
// Décisions du 8 octobre 2026 (docs/CSM-V2.md §1) :
// - tout agent qui écrit des commandes peut confirmer ; l'heure confirmée est facultative ;
// - une seule B201 par jour (filtre district à l'écran) ; un bus annulé n'apparaît pas dans la B201 ;
// - les modèles sont tous partagés, modifiables par tout agent qui écrit des commandes.
//
// Les horodatages de cycle de vie (`*_at`, `*_by`) et `order_events` sont écrits par les hooks
// (`pb_hooks/orders.pb.js`), jamais par le client : les règles refusent qu'ils figurent dans la requête.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';

function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	if (roles.length === 0) return `${ACTIVE} && (${ADMIN} || ${granted})`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}

const READERS = ['moderator', 'user', 'otto_agent', 'reader'];
const WRITERS = ['moderator', 'user', 'otto_agent'];
const TAXI_READERS = ['moderator', 'user', 'reader'];
const TAXI_WRITERS = ['moderator', 'user'];
const DISTRICTS = ['Sud-Ouest', 'Sud-Est', 'Centre'];

// Champs gérés par les hooks : interdits dans le corps des requêtes.
const LIFECYCLE = [
	'number',
	'sent_at',
	'sent_by',
	'confirmed_at',
	'confirmed_by',
	'started_at',
	'started_by',
	'ended_at',
	'ended_by',
	'cancelled_at',
	'cancelled_by',
	'status_before_cancel'
];
const noLifecycle = LIFECYCLE.map((f) => `@request.body.${f}:isset = false`).join(' && ');

function lifecycleFields(usersId) {
	return [
		{ name: 'number', type: 'number', onlyInt: true, min: 0 },
		{ name: 'district', type: 'select', maxSelect: 1, values: DISTRICTS },
		{ name: 'sent_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
		{ name: 'confirmed_at', type: 'date' },
		{ name: 'confirmed_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
		{ name: 'started_at', type: 'date' },
		{ name: 'started_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
		{ name: 'ended_at', type: 'date' },
		{ name: 'ended_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
		{ name: 'cancelled_at', type: 'date' },
		{ name: 'cancelled_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
		{ name: 'cancel_reason', type: 'text', max: 1000 },
		{ name: 'status_before_cancel', type: 'text', max: 20 },
		{ name: 'notes', type: 'text', max: 4000 }
	];
}

function addFields(col, fields) {
	for (const f of fields) {
		if (col.fields.getByName(f.name)) continue;
		const Ctor = { text: TextField, number: NumberField, select: SelectField, relation: RelationField, date: DateField, json: JSONField, bool: BoolField }[f.type];
		col.fields.add(new Ctor(f));
	}
}

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const companies = app.findCollectionByNameOrId('bus_companies');

		// Un champ nombre vide vaut 0 (pas NULL) : l'index « legacy_id IS NOT NULL » interdisait une 2e fiche
		// créée dans CSM. L'unicité ne porte plus que sur les anciens identifiants (> 0).
		companies.removeIndex('idx_bus_companies_legacy');
		companies.addIndex('idx_bus_companies_legacy', true, 'legacy_id', 'legacy_id > 0');
		app.save(companies);

		// --- Référentiel bus : chauffeurs, contacts, lignes desservies (ajout à la volée par les agents) ---
		const child = (name, extra) =>
			new Collection({
				type: 'base',
				name,
				listRule: can('otto:read', READERS),
				viewRule: can('otto:read', READERS),
				createRule: can('otto:write', WRITERS),
				updateRule: can('otto:write', WRITERS),
				deleteRule: can('otto:write', ['moderator']),
				fields: [
					{ name: 'legacy_id', type: 'number', onlyInt: true },
					{ name: 'company', type: 'relation', collectionId: companies.id, maxSelect: 1, required: true, cascadeDelete: true },
					...extra,
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					`CREATE UNIQUE INDEX idx_${name}_legacy ON ${name} (legacy_id) WHERE legacy_id > 0`,
					`CREATE INDEX idx_${name}_company ON ${name} (company)`
				]
			});
		app.save(
			child('bus_drivers', [
				{ name: 'name', type: 'text', required: true, max: 200 },
				{ name: 'phone', type: 'text', max: 100 }
			])
		);
		app.save(
			child('bus_contacts', [
				{ name: 'name', type: 'text', required: true, max: 200 },
				{ name: 'phone', type: 'text', max: 100 }
			])
		);
		app.save(child('bus_company_lines', [{ name: 'line', type: 'text', required: true, max: 50 }]));

		// --- Lignes et gares (ex-ligne_data) : arrêts intermédiaires et suggestions. Référentiel en lecture. ---
		app.save(
			new Collection({
				type: 'base',
				name: 'line_stations',
				listRule: ACTIVE,
				viewRule: ACTIVE,
				createRule: can('lignes:write', ['moderator']),
				updateRule: can('lignes:write', ['moderator']),
				deleteRule: can('lignes:write', ['moderator']),
				fields: [
					{ name: 'legacy_id', type: 'number', onlyInt: true },
					{ name: 'line', type: 'text', required: true, max: 50 },
					{ name: 'station', type: 'text', required: true, max: 200 },
					{ name: 'position', type: 'number', onlyInt: true },
					{ name: 'district', type: 'select', maxSelect: 1, values: DISTRICTS }
				],
				indexes: ['CREATE INDEX idx_line_stations_line ON line_stations (line, position)']
			})
		);

		// --- Sociétés de taxi (ex-taxis : la colonne s'appelle « mail », d'où le bug B3 de BACO) ---
		const taxiCompanies = new Collection({
			type: 'base',
			name: 'taxi_companies',
			listRule: can('generate_taxi:read', TAXI_READERS),
			viewRule: can('generate_taxi:read', TAXI_READERS),
			createRule: can('generate_taxi:write', ['moderator']),
			updateRule: can('generate_taxi:write', ['moderator']),
			deleteRule: ADMIN,
			fields: [
				{ name: 'legacy_id', type: 'number', onlyInt: true },
				{ name: 'name', type: 'text', required: true, max: 200 },
				{ name: 'places', type: 'json', maxSize: 20000 },
				{ name: 'phones', type: 'json', maxSize: 20000 },
				{ name: 'emails', type: 'json', maxSize: 20000 },
				{ name: 'addresses', type: 'json', maxSize: 20000 },
				{ name: 'notes', type: 'json', maxSize: 20000 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_taxi_companies_legacy ON taxi_companies (legacy_id) WHERE legacy_id > 0']
		});
		app.save(taxiCompanies);

		// --- Clients PMR : fiche minimale (données de santé), étendue par le module PMR ---
		const pmrClients = new Collection({
			type: 'base',
			name: 'pmr_clients',
			listRule: can('pmr:read', READERS.filter((r) => r !== 'otto_agent')),
			viewRule: can('pmr:read', READERS.filter((r) => r !== 'otto_agent')),
			createRule: can('pmr:write', ['moderator', 'user']),
			updateRule: can('pmr:write', ['moderator', 'user']),
			deleteRule: ADMIN,
			fields: [
				{ name: 'legacy_id', type: 'number', onlyInt: true },
				{ name: 'last_name', type: 'text', max: 200 },
				{ name: 'first_name', type: 'text', max: 200 },
				{ name: 'phone', type: 'text', max: 100 },
				{ name: 'type', type: 'text', max: 50 },
				{ name: 'notes', type: 'text', max: 4000 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_pmr_clients_legacy ON pmr_clients (legacy_id) WHERE legacy_id > 0',
				'CREATE INDEX idx_pmr_clients_name ON pmr_clients (last_name, first_name)'
			]
		});
		app.save(pmrClients);

		// --- Commandes bus : cycle de vie ---
		const bus = app.findCollectionByNameOrId('bus_orders');
		addFields(bus, lifecycleFields(users.id));
		bus.createRule = `(${can('otto:write', WRITERS)}) && @request.body.created_by = @request.auth.id && @request.body.status = "brouillon" && ${noLifecycle}`;
		bus.updateRule = `(${can('otto:write', WRITERS)}) && @request.body.created_by:changed = false && ${noLifecycle}`;
		bus.addIndex('idx_bus_orders_number', true, 'number', 'number > 0');
		bus.removeIndex('idx_bus_orders_legacy');
		bus.addIndex('idx_bus_orders_legacy', true, 'legacy_id', 'legacy_id > 0');
		app.save(bus);

		// --- Commandes taxi : liens vers la société, le client PMR et l'auteur ---
		const taxi = app.findCollectionByNameOrId('taxi_orders');
		addFields(taxi, [
			{ name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
			{ name: 'taxi_company', type: 'relation', collectionId: taxiCompanies.id, maxSelect: 1 },
			{ name: 'pmr_client', type: 'relation', collectionId: pmrClients.id, maxSelect: 1 },
			{ name: 'confirmed_time', type: 'text', max: 8, pattern: '^$|^\\d{2}:\\d{2}$' },
			{ name: 'sent_at', type: 'date' },
			...lifecycleFields(users.id)
		]);
		taxi.listRule = can('generate_taxi:read', TAXI_READERS);
		taxi.viewRule = can('generate_taxi:read', TAXI_READERS);
		taxi.createRule = `(${can('generate_taxi:write', TAXI_WRITERS)}) && @request.body.created_by = @request.auth.id && @request.body.status = "brouillon" && ${noLifecycle}`;
		taxi.updateRule = `(${can('generate_taxi:write', TAXI_WRITERS)}) && @request.body.created_by:changed = false && ${noLifecycle}`;
		taxi.addIndex('idx_taxi_orders_number', true, 'number', 'number > 0');
		taxi.addIndex('idx_taxi_orders_status', false, 'status', '');
		app.save(taxi);

		// --- Historique des statuts (bus et taxi) : écrit par les hooks uniquement ---
		app.save(
			new Collection({
				type: 'base',
				name: 'order_events',
				listRule: `(kind = "bus" && ${can('otto:read', READERS)}) || (kind = "taxi" && ${can('generate_taxi:read', TAXI_READERS)})`,
				viewRule: `(kind = "bus" && ${can('otto:read', READERS)}) || (kind = "taxi" && ${can('generate_taxi:read', TAXI_READERS)})`,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['bus', 'taxi'] },
					{ name: 'order', type: 'text', required: true, max: 36 },
					{ name: 'from', type: 'text', max: 20 },
					{ name: 'to', type: 'text', required: true, max: 20 },
					{ name: 'by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'note', type: 'text', max: 1000 },
					{ name: 'legacy', type: 'bool' },
					{ name: 'at', type: 'date', required: true }
				],
				indexes: ['CREATE INDEX idx_order_events_order ON order_events (kind, "order", at)']
			})
		);

		// --- Modèles de commande : tous partagés (décision du 8 octobre 2026) ---
		const tplRead = `(kind = "bus" && ${can('otto:read', READERS)}) || (kind = "taxi" && ${can('generate_taxi:read', TAXI_READERS)})`;
		const tplWrite = `(kind = "bus" && ${can('otto:write', WRITERS)}) || (kind = "taxi" && ${can('generate_taxi:write', TAXI_WRITERS)})`;
		const tplBodyWrite = `((@request.body.kind = "bus" && ${can('otto:write', WRITERS)}) || (@request.body.kind = "taxi" && ${can('generate_taxi:write', TAXI_WRITERS)}))`;
		app.save(
			new Collection({
				type: 'base',
				name: 'order_templates',
				listRule: tplRead,
				viewRule: tplRead,
				createRule: `${tplBodyWrite} && @request.body.created_by = @request.auth.id`,
				updateRule: `(${tplWrite}) && @request.body.kind:changed = false && @request.body.created_by:changed = false`,
				deleteRule: tplWrite,
				fields: [
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['bus', 'taxi'] },
					{ name: 'name', type: 'text', required: true, max: 120 },
					{ name: 'data', type: 'json', maxSize: 200000 },
					{ name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE INDEX idx_order_templates_kind ON order_templates (kind, name)']
			})
		);

		// --- Remise de service B201 : une par jour (Europe/Brussels), transports lus depuis les commandes ---
		app.save(
			new Collection({
				type: 'base',
				name: 'b201_reports',
				listRule: can('b201:read', READERS),
				viewRule: can('b201:read', READERS),
				createRule: can('b201:write', ['moderator']),
				updateRule: `(${can('b201:write', ['moderator'])}) && @request.body.day:changed = false`,
				deleteRule: ADMIN,
				fields: [
					{ name: 'day', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					// { matin, apres_midi, nuit, suivant } : commentaires libres par période.
					{ name: 'notes', type: 'json', maxSize: 50000 },
					// Transports hors outil, ajoutés à la main : [{ period, service, company, time, origin, destination, ref }].
					{ name: 'manual', type: 'json', maxSize: 100000 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'legacy', type: 'json', maxSize: 200000 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_b201_day ON b201_reports (day)']
			})
		);
	},
	(app) => {
		for (const name of [
			'b201_reports',
			'order_templates',
			'order_events',
			'line_stations',
			'bus_company_lines',
			'bus_contacts',
			'bus_drivers'
		]) {
			app.delete(app.findCollectionByNameOrId(name));
		}
		const taxi = app.findCollectionByNameOrId('taxi_orders');
		// Règles de 1760000000 (avant de retirer les champs qu'elles citent).
		taxi.listRule = can('generate_taxi:read', READERS);
		taxi.viewRule = can('generate_taxi:read', READERS);
		taxi.createRule = can('generate_taxi:write', WRITERS);
		taxi.updateRule = can('generate_taxi:write', WRITERS);
		taxi.removeIndex('idx_taxi_orders_number');
		taxi.removeIndex('idx_taxi_orders_status');
		for (const f of ['created_by', 'taxi_company', 'pmr_client', 'confirmed_time', 'sent_at', ...LIFECYCLE, 'district', 'cancel_reason', 'notes']) {
			taxi.fields.removeByName(f);
		}
		app.save(taxi);
		const bus = app.findCollectionByNameOrId('bus_orders');
		bus.createRule = `(${can('otto:write', WRITERS)}) && @request.body.created_by = @request.auth.id`;
		bus.updateRule = `(${can('otto:write', WRITERS)}) && @request.body.created_by:changed = false`;
		bus.removeIndex('idx_bus_orders_number');
		for (const f of [...LIFECYCLE.filter((f) => f !== 'sent_at'), 'district', 'cancel_reason', 'notes']) {
			bus.fields.removeByName(f);
		}
		app.save(bus);
		app.delete(app.findCollectionByNameOrId('pmr_clients'));
		app.delete(app.findCollectionByNameOrId('taxi_companies'));
	}
);
