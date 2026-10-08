/// <reference path="../pb_data/types.d.ts" />
// Module Référentiels (session 3). Décisions du 8 octobre 2026 (docs/design/AUDIT-UX-REFERENTIELS.md §6, tout validé) :
// - Annuaire général (`directory_contacts`), zones SPI (`spi_points`), abréviations PtCar (`ptcar`), correspondances
//   EBP (`ebp_views`) : lecture par tous (droit de lecture), écriture réservée aux COORDINATEURS (moderator) ;
// - Procédures (`procedures`) + versions (`procedure_versions`, écrites par hook) + bibliothèque de documents
//   (`documents`, fichier PROTÉGÉ servi par Next, jamais d'URL publique) : lecture par tous, écriture user + moderator ;
// - les gares (`line_stations`) et PN (`level_crossings`) existent déjà et sont seulement LUS par l'onglet Lignes.
// Audit : collections ajoutées à pb_hooks/audit.pb.js. Versioning et refus de suppression d'un document référencé :
// pb_hooks/referentiels.pb.js.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const COORD = `(${ADMIN} || @request.auth.role = "moderator")`;

function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	if (roles.length === 0) return `${ACTIVE} && (${ADMIN} || ${granted})`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}
const READERS = ['moderator', 'user', 'reader'];
const WRITERS = ['moderator', 'user']; // procédures et documents : ouverts au rôle user (comme la v1)

// Champ d'auteur non forgeable + legacy_id figé : branche commune aux create/update.
const own = '@request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false';

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		// --- Annuaire général (ex-contacts_repertoire) ---
		app.save(
			new Collection({
				type: 'base',
				name: 'directory_contacts',
				listRule: can('repertoire:read', READERS),
				viewRule: can('repertoire:read', READERS),
				createRule: `(${can('repertoire:write', ['moderator'])}) && ${own}`,
				updateRule: `(${can('repertoire:write', ['moderator'])}) && ${own} && @request.body.legacy_id:changed = false`,
				deleteRule: COORD,
				fields: [
					{ name: 'legacy_id', type: 'number', onlyInt: true, min: 0 },
					{ name: 'name', type: 'text', required: true, max: 200 },
					{ name: 'phone', type: 'text', max: 60 },
					{ name: 'email', type: 'text', max: 200 },
					{ name: 'category', type: 'text', max: 60 },
					{ name: 'zone', type: 'text', max: 60 },
					{ name: 'group', type: 'text', max: 120 },
					{ name: 'note', type: 'text', max: 1000 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE INDEX idx_directory_category ON directory_contacts (category)',
					'CREATE INDEX idx_directory_name ON directory_contacts (name)'
				]
			})
		);

		// --- Zones SPI par ligne (ex-spi_data) ---
		app.save(
			new Collection({
				type: 'base',
				name: 'spi_points',
				listRule: ACTIVE,
				viewRule: ACTIVE,
				createRule: `(${can('lignes:write', ['moderator'])}) && ${own}`,
				updateRule: `(${can('lignes:write', ['moderator'])}) && ${own} && @request.body.legacy_id:changed = false`,
				deleteRule: COORD,
				fields: [
					{ name: 'legacy_id', type: 'number', onlyInt: true, min: 0 },
					{ name: 'line', type: 'text', required: true, max: 20 },
					{ name: 'place', type: 'text', max: 200 },
					{ name: 'zone', type: 'text', max: 10, pattern: '^$|^[A-Z0-9]{2,10}$' },
					{ name: 'address', type: 'text', max: 500 },
					{ name: 'notes', type: 'text', max: 1000 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE INDEX idx_spi_line ON spi_points (line)']
			})
		);

		// --- Abréviations PtCar (ex-ptcar_abbreviations) : référentiel officiel, abbr UNIQUE ---
		app.save(
			new Collection({
				type: 'base',
				name: 'ptcar',
				listRule: can('ptcar:read', READERS),
				viewRule: can('ptcar:read', READERS),
				createRule: `(${can('ptcar:write', ['moderator'])}) && ${own}`,
				updateRule: `(${can('ptcar:write', ['moderator'])}) && ${own} && @request.body.legacy_id:changed = false`,
				deleteRule: ADMIN,
				fields: [
					{ name: 'legacy_id', type: 'number', onlyInt: true, min: 0 },
					{ name: 'abbr', type: 'text', required: true, max: 20 },
					{ name: 'name_fr', type: 'text', max: 200 },
					{ name: 'name_nl', type: 'text', max: 200 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_ptcar_abbr ON ptcar (abbr)',
					'CREATE INDEX idx_ptcar_fr ON ptcar (name_fr)'
				]
			})
		);

		// --- Correspondances EBP (ex-ebp) ---
		app.save(
			new Collection({
				type: 'base',
				name: 'ebp_views',
				listRule: can('ebp:read', READERS),
				viewRule: can('ebp:read', READERS),
				createRule: `(${can('ebp:write', ['moderator'])}) && ${own}`,
				updateRule: `(${can('ebp:write', ['moderator'])}) && ${own} && @request.body.legacy_id:changed = false`,
				deleteRule: ADMIN,
				fields: [
					{ name: 'legacy_id', type: 'number', onlyInt: true, min: 0 },
					{ name: 'line', type: 'text', max: 60 },
					{ name: 'ptcar', type: 'text', max: 200 },
					{ name: 'abbr', type: 'text', max: 20 },
					{ name: 'ebp_view', type: 'text', max: 120 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE INDEX idx_ebp_abbr ON ebp_views (abbr)',
					'CREATE INDEX idx_ebp_view ON ebp_views (ebp_view)'
				]
			})
		);

		// --- Bibliothèque de documents : fichier PROTÉGÉ (servi par Next avec le jeton), jamais d'URL publique ---
		const documents = new Collection({
			type: 'base',
			name: 'documents',
			listRule: can('documents:read', READERS),
			viewRule: can('documents:read', READERS),
			createRule: `(${can('documents:write', WRITERS)}) && @request.body.uploaded_by = @request.auth.id && @request.body.legacy_id:isset = false`,
			updateRule: `(${can('documents:write', WRITERS)}) && @request.body.legacy_id:isset = false`,
			deleteRule: COORD, // refus si référencé par une procédure : hook referentiels.pb.js
			fields: [
				{ name: 'legacy_id', type: 'text', max: 300 },
				{ name: 'name', type: 'text', required: true, max: 300 },
				{ name: 'category', type: 'text', max: 60 },
				{
					name: 'file',
					type: 'file',
					maxSelect: 1,
					maxSize: 30 * 1024 * 1024,
					protected: true,
					mimeTypes: [
						'application/pdf',
						'image/png', 'image/jpeg', 'image/gif', 'image/webp',
						'application/msword',
						'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
						'application/vnd.ms-excel',
						'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						'application/vnd.ms-powerpoint',
						'application/vnd.openxmlformats-officedocument.presentationml.presentation',
						'text/plain', 'text/csv'
					]
				},
				{ name: 'uploaded_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_documents_category ON documents (category)']
		});
		app.save(documents);

		// --- Procédures (base de connaissances Markdown) ---
		const procedures = new Collection({
			type: 'base',
			name: 'procedures',
			listRule: can('documents:read', READERS),
			viewRule: can('documents:read', READERS),
			createRule: `(${can('documents:write', WRITERS)}) && ${own}`,
			updateRule: `(${can('documents:write', WRITERS)}) && ${own} && @request.body.legacy_id:changed = false`,
			deleteRule: COORD,
			fields: [
				{ name: 'legacy_id', type: 'text', max: 60 },
				{ name: 'title', type: 'text', required: true, max: 300 },
				{ name: 'category', type: 'text', max: 60 },
				{ name: 'content', type: 'text', max: 20000 },
				{ name: 'attachments', type: 'relation', collectionId: documents.id, maxSelect: 50 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_procedures_category ON procedures (category)',
				'CREATE INDEX idx_procedures_title ON procedures (title)'
			]
		});
		app.save(procedures);

		// --- Versions de procédure : écrites PAR HOOK uniquement (snapshot atomique à chaque modification) ---
		app.save(
			new Collection({
				type: 'base',
				name: 'procedure_versions',
				listRule: can('documents:read', READERS),
				viewRule: can('documents:read', READERS),
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'procedure', type: 'relation', collectionId: procedures.id, maxSelect: 1, required: true, cascadeDelete: true },
					{ name: 'title', type: 'text', max: 300 },
					{ name: 'category', type: 'text', max: 60 },
					{ name: 'content', type: 'text', max: 20000 },
					{ name: 'by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'at', type: 'autodate', onCreate: true }
				],
				indexes: ['CREATE INDEX idx_procedure_versions_proc ON procedure_versions (procedure, at)']
			})
		);
	},
	(app) => {
		for (const name of ['procedure_versions', 'procedures', 'documents', 'ebp_views', 'ptcar', 'spi_points', 'directory_contacts']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
	}
);
