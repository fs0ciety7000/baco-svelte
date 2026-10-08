/// <reference path="../pb_data/types.d.ts" />
// Module Opérations (session 3). Décisions du 8 octobre 2026 (docs/design/AUDIT-UX-OPERATIONS.md §6, tout validé,
// fonds de carte = option B, proxy de tuiles par le serveur Next) :
// - main courante gardée, recentrée en journal d'exploitation : catégorie, heure de l'événement, liens vers une commande,
//   une prestation, un train ou un PN, consignes épinglées ; lecture par tous sauf otto_agent, écriture user + moderator ;
// - « Retirer » avec motif (auteur pendant 15 min, ensuite coordinateurs), entrée conservée ; suppression réelle : admin ;
// - « Lu » remplace les réactions ; notifications écrites par les hooks seulement (mentions, urgences, trains suivis) ;
// - passages à niveau : zone STOCKÉE (code de pmr_zones), jamais recalculée ; modifiés par les coordinateurs ;
// - trains suivis : 10 par agent, pour la journée, contrôlés par un cron (pb_hooks/operations.pb.js).
// Historique (`ops_log_events`) et notifications écrits par les hooks seulement.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const COORD_ROLE = `(${ADMIN} || @request.auth.role = "moderator")`;

function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	if (roles.length === 0) return `${ACTIVE} && (${ADMIN} || ${granted})`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}

const READERS = ['moderator', 'user', 'reader'];
const WRITERS = ['moderator', 'user'];
const DISTRICTS = ['Sud-Ouest', 'Sud-Est', 'Centre'];
const CATEGORIES = ['incident', 'pmr', 'commande', 'travaux', 'consigne', 'info'];

// Dépôts de la v1 (codés en dur dans carte-pn/+page.svelte) : base de l'itinéraire vers un PN.
const DEPOTS = {
	FTY: { label: 'Tournai', lat: 50.613056, lon: 3.396944 },
	FMS: { label: 'Mons', lat: 50.4557, lon: 3.9395 },
	FCR: { label: 'Charleroi', lat: 50.404444, lon: 4.438611 }
};

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const busOrders = app.findCollectionByNameOrId('bus_orders');
		const taxiOrders = app.findCollectionByNameOrId('taxi_orders');
		const assists = app.findCollectionByNameOrId('pmr_assists');

		// --- Zones : dépôt (itinéraire PN) + zone FNR des PN ---
		const zones = app.findCollectionByNameOrId('pmr_zones');
		for (const f of [
			new TextField({ name: 'depot_label', max: 100 }),
			new NumberField({ name: 'depot_lat', min: -90, max: 90 }),
			new NumberField({ name: 'depot_lon', min: -180, max: 180 })
		]) {
			if (!zones.fields.getByName(f.name)) zones.fields.add(f);
		}
		app.save(zones);
		for (const code of Object.keys(DEPOTS)) {
			try {
				const z = app.findFirstRecordByData('pmr_zones', 'code', code);
				z.set('depot_label', DEPOTS[code].label);
				z.set('depot_lat', DEPOTS[code].lat);
				z.set('depot_lon', DEPOTS[code].lon);
				app.save(z);
			} catch (_) {
				// Zone absente (base vide) : l'import la crée avec son dépôt.
			}
		}
		// FNR : zone des PN de Namur (9 PN en v1), district à préciser par un coordinateur.
		if (app.countRecords('pmr_zones') > 0) {
			try {
				app.findFirstRecordByData('pmr_zones', 'code', 'FNR');
			} catch (_) {
				const z = new Record(zones);
				z.set('code', 'FNR');
				z.set('label', 'Namur');
				z.set('stations', []);
				app.save(z);
			}
		}

		// --- Passages à niveau ---
		const crossings = new Collection({
			type: 'base',
			name: 'level_crossings',
			listRule: can('carte_pn:read', READERS),
			viewRule: can('carte_pn:read', READERS),
			// Plus d'écriture ouverte à tout compte (BUG-1 de la v1) : coordinateurs (carte_pn:write) seulement.
			createRule: `(${can('carte_pn:write', ['moderator'])}) && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false`,
			updateRule: `(${can('carte_pn:write', ['moderator'])}) && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false`,
			deleteRule: ADMIN,
			fields: [
				{ name: 'line', type: 'text', required: true, max: 20, pattern: '^L\\.[0-9]{1,3}[A-Z]?$' },
				{ name: 'number', type: 'text', required: true, max: 20, pattern: '^[0-9]{1,4}( bis| ter)?$' },
				{ name: 'bk', type: 'number', min: 0, max: 1000 },
				{ name: 'address', type: 'text', max: 500 },
				{ name: 'lat', type: 'number', min: -90, max: 90 },
				{ name: 'lon', type: 'number', min: -180, max: 180 },
				// Code de zone (pmr_zones.code) : texte, pour survivre à la réimportation des zones.
				{ name: 'zone', type: 'text', max: 10, pattern: '^$|^[A-Z0-9]{2,10}$' },
				{ name: 'notes', type: 'text', max: 1000 },
				{ name: 'active', type: 'bool' },
				{ name: 'source', type: 'select', maxSelect: 1, values: ['baco', 'csm'] },
				{ name: 'legacy_id', type: 'number', onlyInt: true, min: 0 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_level_crossings_key ON level_crossings (line, number)', 'CREATE INDEX idx_level_crossings_zone ON level_crossings (zone)']
		});
		app.save(crossings);

		// --- Main courante ---
		// Entrée retirée : visible de son auteur et des coordinateurs seulement.
		const readLog = `(${can('journal:read', READERS)}) && (status = "active" || author = @request.auth.id || ${COORD_ROLE})`;
		// Champs posés par les hooks, jamais par la requête.
		const hookOnly = ['mentions', 'edited_at', 'legacy_id', 'notified'].map((f) => `@request.body.${f}:isset = false`).join(' && ');
		const log = new Collection({
			type: 'base',
			name: 'ops_log',
			listRule: readLog,
			viewRule: readLog,
			createRule:
				`(${can('journal:write', WRITERS)}) && @request.body.author = @request.auth.id && ${hookOnly} && ` +
				'(@request.body.status:isset = false || @request.body.status = "active") && @request.body.retired_reason:isset = false',
			// Auteur (journal:write) ou coordinateur ; le retrait / rétablissement est contrôlé par le hook.
			updateRule:
				`(${can('journal:write', WRITERS)}) && (author = @request.auth.id || ${COORD_ROLE}) && ` +
				`@request.body.author:changed = false && ${hookOnly}`,
			deleteRule: ADMIN,
			fields: [
				{ name: 'body', type: 'text', required: true, max: 4000 },
				{ name: 'category', type: 'select', required: true, maxSelect: 1, values: CATEGORIES },
				{ name: 'occurred_at', type: 'date', required: true },
				{ name: 'urgent', type: 'bool' },
				{ name: 'pinned_until', type: 'date' },
				{ name: 'district', type: 'select', maxSelect: 1, values: DISTRICTS },
				{ name: 'train', type: 'text', max: 20, pattern: '^$|^[A-Z]{0,4} ?[0-9]{1,6}$' },
				{ name: 'bus_order', type: 'relation', collectionId: busOrders.id, maxSelect: 1 },
				{ name: 'taxi_order', type: 'relation', collectionId: taxiOrders.id, maxSelect: 1 },
				{ name: 'pmr_assist', type: 'relation', collectionId: assists.id, maxSelect: 1 },
				{ name: 'level_crossing', type: 'relation', collectionId: crossings.id, maxSelect: 1 },
				{ name: 'mentions', type: 'relation', collectionId: users.id, maxSelect: 20 },
				{
					name: 'attachments',
					type: 'file',
					maxSelect: 3,
					maxSize: 5 * 1024 * 1024,
					mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
					protected: true
				},
				{ name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'retiree'] },
				{ name: 'retired_reason', type: 'text', max: 500 },
				{ name: 'author', type: 'relation', collectionId: users.id, maxSelect: 1, required: true },
				{ name: 'edited_at', type: 'date' },
				// Destinataires déjà notifiés (et « *urgent ») : une notification par agent et par entrée au plus.
				{ name: 'notified', type: 'json', maxSize: 20000 },
				{ name: 'legacy_id', type: 'number', onlyInt: true, min: 0 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_ops_log_at ON ops_log (occurred_at)',
				'CREATE INDEX idx_ops_log_cat ON ops_log (category, occurred_at)',
				'CREATE INDEX idx_ops_log_pinned ON ops_log (pinned_until)',
				'CREATE UNIQUE INDEX idx_ops_log_legacy ON ops_log (legacy_id) WHERE legacy_id > 0'
			]
		});
		app.save(log);

		// Accusés de lecture et historique : visibles comme l'entrée (une entrée retirée reste masquée).
		const entryVisible = `(entry.status = "active" || entry.author = @request.auth.id || ${COORD_ROLE})`;

		// --- Accusés de lecture (« Lu ») ---
		app.save(
			new Collection({
				type: 'base',
				name: 'ops_log_reads',
				listRule: `(${can('journal:read', READERS)}) && ${entryVisible}`,
				viewRule: `(${can('journal:read', READERS)}) && ${entryVisible}`,
				createRule: `(${can('journal:read', READERS)}) && @request.body.user = @request.auth.id && @request.body.entry.status = "active"`,
				updateRule: null,
				deleteRule: `${ACTIVE} && user = @request.auth.id`,
				fields: [
					{ name: 'entry', type: 'relation', collectionId: log.id, maxSelect: 1, required: true, cascadeDelete: true },
					{ name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
					{ name: 'created', type: 'autodate', onCreate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_ops_log_reads ON ops_log_reads (entry, user)']
			})
		);

		// --- Historique des entrées (hooks seulement) ---
		app.save(
			new Collection({
				type: 'base',
				name: 'ops_log_events',
				listRule: `(${can('journal:read', READERS)}) && ${entryVisible}`,
				viewRule: `(${can('journal:read', READERS)}) && ${entryVisible}`,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'entry', type: 'relation', collectionId: log.id, maxSelect: 1, required: true, cascadeDelete: true },
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['create', 'edit', 'retire', 'restore'] },
					{ name: 'field', type: 'text', max: 40 },
					{ name: 'from', type: 'text', max: 4000 },
					{ name: 'to', type: 'text', max: 4000 },
					{ name: 'by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'note', type: 'text', max: 500 },
					{ name: 'at', type: 'date', required: true }
				],
				indexes: ['CREATE INDEX idx_ops_log_events ON ops_log_events (entry, at)']
			})
		);

		// --- Notifications (hooks seulement ; le destinataire lit, marque lu, supprime) ---
		const SELF = `${ACTIVE} && user = @request.auth.id`;
		const onlyReadAt = ['user', 'kind', 'title', 'body', 'link', 'source', 'source_id'].map((f) => `@request.body.${f}:isset = false`).join(' && ');
		app.save(
			new Collection({
				type: 'base',
				name: 'notifications',
				listRule: SELF,
				viewRule: SELF,
				createRule: null,
				updateRule: `${SELF} && ${onlyReadAt}`,
				deleteRule: SELF,
				fields: [
					{ name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['mention', 'urgent', 'train', 'systeme'] },
					{ name: 'title', type: 'text', required: true, max: 200 },
					{ name: 'body', type: 'text', max: 500 },
					// Chemin interne seulement (jamais d'URL externe dans la cloche).
					{ name: 'link', type: 'text', max: 300, pattern: '^$|^/[A-Za-z0-9_][A-Za-z0-9/_?=&.%-]*$' },
					{ name: 'source', type: 'text', max: 40 },
					{ name: 'source_id', type: 'text', max: 40 },
					{ name: 'read_at', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true }
				],
				indexes: ['CREATE INDEX idx_notifications_user ON notifications (user, read_at, created)']
			})
		);

		// --- Trains suivis (alertes de retard / suppression, pour la journée) ---
		const OWNER = `${ACTIVE} && user = @request.auth.id`;
		app.save(
			new Collection({
				type: 'base',
				name: 'train_watches',
				listRule: OWNER,
				viewRule: OWNER,
				createRule: `(${can('live:read', READERS)}) && @request.body.user = @request.auth.id && @request.body.last_state:isset = false`,
				updateRule: `${OWNER} && @request.body.user:isset = false && @request.body.last_state:isset = false && @request.body.train:changed = false && @request.body.day:changed = false`,
				deleteRule: OWNER,
				fields: [
					{ name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
					// Identifiant iRail du train (« IC2134 ») et jour de circulation (Europe/Brussels).
					{ name: 'train', type: 'text', required: true, max: 12, pattern: '^[A-Z]{0,4}[0-9]{1,6}$' },
					{ name: 'day', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'label', type: 'text', max: 120 },
					{ name: 'threshold_min', type: 'number', onlyInt: true, min: 1, max: 120 },
					{ name: 'last_state', type: 'json', maxSize: 2000 },
					{ name: 'created', type: 'autodate', onCreate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_train_watches ON train_watches (user, train, day)', 'CREATE INDEX idx_train_watches_day ON train_watches (day)']
			})
		);
	},
	(app) => {
		for (const name of ['train_watches', 'notifications', 'ops_log_events', 'ops_log_reads', 'ops_log', 'level_crossings']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
		const zones = app.findCollectionByNameOrId('pmr_zones');
		for (const f of ['depot_label', 'depot_lat', 'depot_lon']) zones.fields.removeByName(f);
		app.save(zones);
	}
);
