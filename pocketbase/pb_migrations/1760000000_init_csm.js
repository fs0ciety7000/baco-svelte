/// <reference path="../pb_data/types.d.ts" />
// Schéma initial CSM (prototype de l'étape 1) : comptes, sociétés de bus, commandes bus et taxi, audit.
//
// Règles d'accès : le navigateur ne parle jamais à PocketBase. Le serveur Next appelle PocketBase avec
// le jeton de l'agent connecté, donc ces règles s'appliquent à chaque requête (défense en profondeur,
// équivalent des policies RLS). Les rôles viennent de `users.role`, que l'agent ne peut pas modifier.
//
// Permissions fines : `grants` / `denies` sont des tableaux JSON de permissions v1 (« otto:write »…),
// issus de `profiles.permissions` (true → grants, false → denies).

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';

/** Règle « rôle par défaut OU permission accordée, sauf permission retirée ». */
function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	if (roles.length === 0) return `${ACTIVE} && (${ADMIN} || ${granted})`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}

const READERS = ['moderator', 'user', 'otto_agent', 'reader'];
const WRITERS = ['moderator', 'user', 'otto_agent'];

migrate(
	(app) => {
		// --- Comptes : identifiants Supabase (UUID) conservés pour garder les liens à l'import ---
		const users = app.findCollectionByNameOrId('users');
		const id = users.fields.getByName('id');
		id.pattern = '^[a-z0-9-]+$';
		id.min = 15;
		id.max = 36;
		users.fields.add(
			new SelectField({
				name: 'role',
				required: true,
				maxSelect: 1,
				values: ['admin', 'sysop', 'moderator', 'otto_agent', 'user', 'reader', 'disabled']
			})
		);
		users.fields.add(new JSONField({ name: 'grants', maxSize: 4000 }));
		users.fields.add(new JSONField({ name: 'denies', maxSize: 4000 }));
		users.fields.add(new TextField({ name: 'username', max: 100 }));
		users.fields.add(new TextField({ name: 'fonction', max: 200 }));
		users.fields.add(new SelectField({ name: 'district', maxSelect: 1, values: ['Sud-Ouest', 'Sud-Est'] }));
		users.fields.add(new DateField({ name: 'banned_until' }));
		users.fields.add(new JSONField({ name: 'preferences', maxSize: 20000 }));
		// Un agent voit l'annuaire de l'équipe ; seul un admin crée, modifie le rôle ou supprime.
		users.listRule = ACTIVE;
		users.viewRule = ACTIVE;
		users.createRule = null;
		users.updateRule =
			`${ADMIN} || (id = @request.auth.id && @request.body.role:isset = false && @request.body.grants:isset = false` +
			` && @request.body.denies:isset = false && @request.body.banned_until:isset = false && @request.body.email:isset = false)`;
		users.deleteRule = null;
		users.addIndex('idx_users_username', true, 'username', "username != ''");
		users.passwordAuth.identityFields = ['email', 'username'];
		app.save(users);

		// --- Sociétés de bus ---
		const companies = new Collection({
			type: 'base',
			name: 'bus_companies',
			listRule: can('otto:read', READERS),
			viewRule: can('otto:read', READERS),
			createRule: can('otto:write', ['moderator']),
			updateRule: can('otto:write', ['moderator']),
			deleteRule: ADMIN,
			fields: [
				{ name: 'legacy_id', type: 'number', onlyInt: true },
				{ name: 'name', type: 'text', required: true, max: 200 },
				{ name: 'address', type: 'text', max: 500 },
				{ name: 'phone', type: 'text', max: 100 },
				{ name: 'email', type: 'text', max: 500 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_bus_companies_legacy ON bus_companies (legacy_id) WHERE legacy_id IS NOT NULL']
		});
		app.save(companies);

		const STATUS = ['brouillon', 'envoye', 'confirme', 'en_cours', 'termine', 'facture', 'annule'];

		// --- Commandes bus (C3, ex-otto_commandes) ---
		const bus = new Collection({
			type: 'base',
			name: 'bus_orders',
			listRule: can('otto:read', READERS),
			viewRule: can('otto:read', READERS),
			createRule: `(${can('otto:write', WRITERS)}) && @request.body.created_by = @request.auth.id`,
			updateRule: `(${can('otto:write', WRITERS)}) && @request.body.created_by:changed = false`,
			deleteRule: can('otto:delete', []),
			fields: [
				{ name: 'legacy_id', type: 'number', onlyInt: true },
				{ name: 'status', type: 'select', required: true, maxSelect: 1, values: STATUS },
				{ name: 'c3_type', type: 'number', onlyInt: true, min: 1, max: 3 },
				{ name: 'reason', type: 'text', max: 2000 },
				{ name: 'order_date', type: 'date' },
				{ name: 'call_time', type: 'text', max: 8, pattern: '^$|^\\d{2}:\\d{2}(:\\d{2})?$' },
				{ name: 'lines', type: 'json', maxSize: 20000 },
				{ name: 'stops', type: 'json', maxSize: 100000 },
				{ name: 'stops_mode', type: 'select', maxSelect: 1, values: ['auto', 'manuel'] },
				{ name: 'stops_manual', type: 'text', max: 5000 },
				{ name: 'relation', type: 'text', max: 200 },
				{ name: 'origin', type: 'text', max: 200 },
				{ name: 'destination', type: 'text', max: 200 },
				{ name: 'round_trip', type: 'bool' },
				{ name: 'direct', type: 'bool' },
				{ name: 'bus_count', type: 'number', onlyInt: true, min: 0, max: 200 },
				{ name: 'bus_capacity', type: 'number', onlyInt: true, min: 0 },
				{ name: 'passengers', type: 'number', onlyInt: true, min: 0 },
				{ name: 'pmr_count', type: 'number', onlyInt: true, min: 0 },
				{ name: 'buses', type: 'json', maxSize: 200000 },
				{ name: 'company', type: 'relation', collectionId: companies.id, maxSelect: 1 },
				{ name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'validated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'sent_at', type: 'date' },
				{ name: 'sent_by_name', type: 'text', max: 200 },
				{ name: 'pdf', type: 'file', maxSelect: 1, maxSize: 30 * 1024 * 1024, mimeTypes: ['application/pdf'], protected: true },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_bus_orders_legacy ON bus_orders (legacy_id) WHERE legacy_id IS NOT NULL',
				'CREATE INDEX idx_bus_orders_date ON bus_orders (order_date)',
				'CREATE INDEX idx_bus_orders_status ON bus_orders (status)'
			]
		});
		app.save(bus);

		// --- Commandes taxi (ex-taxi_commands) : contient des données PMR (santé) ---
		const taxi = new Collection({
			type: 'base',
			name: 'taxi_orders',
			listRule: can('generate_taxi:read', READERS),
			viewRule: can('generate_taxi:read', READERS),
			createRule: can('generate_taxi:write', WRITERS),
			updateRule: can('generate_taxi:write', WRITERS),
			deleteRule: can('generate_taxi:delete', []),
			fields: [
				{ name: 'status', type: 'select', required: true, maxSelect: 1, values: STATUS },
				{ name: 'author', type: 'text', max: 200 },
				{ name: 'trip_at', type: 'date' },
				{ name: 'return_at', type: 'date' },
				{ name: 'trip_type', type: 'text', max: 50 },
				{ name: 'from_station', type: 'text', max: 200 },
				{ name: 'to_station', type: 'text', max: 200 },
				{ name: 'via_station', type: 'text', max: 200 },
				{ name: 'return_from', type: 'text', max: 200 },
				{ name: 'return_to', type: 'text', max: 200 },
				{ name: 'taxi_name', type: 'text', max: 200 },
				{ name: 'taxi_email', type: 'text', max: 500 },
				{ name: 'taxi_phone', type: 'text', max: 100 },
				{ name: 'taxi_address', type: 'text', max: 500 },
				{ name: 'is_pmr', type: 'bool' },
				{ name: 'pmr_type', type: 'text', max: 100 },
				{ name: 'pmr_last_name', type: 'text', max: 200 },
				{ name: 'pmr_first_name', type: 'text', max: 200 },
				{ name: 'pmr_phone', type: 'text', max: 100 },
				{ name: 'pmr_file', type: 'text', max: 100 },
				{ name: 'pmr_reason', type: 'text', max: 2000 },
				{ name: 'passenger_name', type: 'text', max: 200 },
				{ name: 'relation_number', type: 'text', max: 100 },
				{ name: 'billing', type: 'text', max: 200 },
				{ name: 'reason', type: 'text', max: 2000 },
				{ name: 'passengers', type: 'number', onlyInt: true, min: 0 },
				{ name: 'pmr_count', type: 'number', onlyInt: true, min: 0 },
				{ name: 'vehicles', type: 'number', onlyInt: true, min: 0 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_taxi_orders_trip ON taxi_orders (trip_at)']
		});
		app.save(taxi);

		// --- Journal d'audit : écrit uniquement par les hooks (remplace log_audit_action / log_audit_diff) ---
		const audit = new Collection({
			type: 'base',
			name: 'audit_log',
			listRule: `${ACTIVE} && (${ADMIN} || @request.auth.grants ~ '"audit:read"')`,
			viewRule: `${ACTIVE} && (${ADMIN} || @request.auth.grants ~ '"audit:read"')`,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'action', type: 'select', required: true, maxSelect: 1, values: ['create', 'update', 'delete'] },
				{ name: 'collection', type: 'text', required: true, max: 100 },
				{ name: 'record', type: 'text', required: true, max: 100 },
				{ name: 'user', type: 'text', max: 36 },
				{ name: 'changes', type: 'json', maxSize: 500000 },
				{ name: 'legacy', type: 'bool' },
				{ name: 'at', type: 'date', required: true }
			],
			indexes: ['CREATE INDEX idx_audit_record ON audit_log (collection, record)', 'CREATE INDEX idx_audit_at ON audit_log (at)']
		});
		app.save(audit);

		// --- Sauvegardes planifiées : chaque nuit à 2 h (UTC), 14 conservées dans pb_data/backups ---
		const settings = app.settings();
		settings.meta.appName = 'CSM';
		settings.backups.cron = '0 2 * * *';
		settings.backups.cronMaxKeep = 14;
		settings.trustedProxy.headers = ['X-Forwarded-For'];
		app.save(settings);
	},
	(app) => {
		for (const name of ['audit_log', 'taxi_orders', 'bus_orders', 'bus_companies']) {
			app.delete(app.findCollectionByNameOrId(name));
		}
		const users = app.findCollectionByNameOrId('users');
		for (const f of ['role', 'grants', 'denies', 'username', 'fonction', 'district', 'banned_until', 'preferences']) {
			users.fields.removeByName(f);
		}
		app.save(users);
	}
);
