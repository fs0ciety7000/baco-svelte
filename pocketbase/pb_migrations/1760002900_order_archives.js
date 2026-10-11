/// <reference path="../pb_data/types.d.ts" />
// Archives des bons (demande du 11 oct. 2026) : le PDF d'un bon bus ou taxi terminé est rangé sur le volume de
// PocketBase (champ fichier protégé) et, en production, copié dans R2 (bucket des sauvegardes, dossier `bons/`).
// Chaque nuit, un zip par mois de ces PDF est refait (volume + R2), téléchargeable depuis la page Archives.
//
// Écriture : uniquement par les routes internes `/api/csm/archives/*` (secret partagé avec Next, `archives.pb.js`).
// Lecture : droit `archives:read` (PACO/RCCA, Modérateur, admin, sysop par défaut ; jamais l'invité sauf droit accordé).
// Suppression : `archives:delete` (Modérateur, admin, sysop, ou droit accordé).

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const COORD = '(@request.auth.role = "paco" || @request.auth.role = "moderator")';

function read(perm) {
	return `${ACTIVE} && (${ADMIN} || (${COORD} && @request.auth.denies !~ '"${perm}"') || @request.auth.grants ~ '"${perm}"')`;
}
function del(perm) {
	return `${ACTIVE} && (${ADMIN} || (@request.auth.role = "moderator" && @request.auth.denies !~ '"${perm}"') || @request.auth.grants ~ '"${perm}"')`;
}

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const pdfs = new Collection({
			type: 'base',
			name: 'order_pdfs',
			listRule: read('archives:read'),
			viewRule: read('archives:read'),
			createRule: null,
			updateRule: null,
			deleteRule: del('archives:delete'),
			fields: [
				{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['bus', 'taxi'] },
				{ name: 'order_id', type: 'text', required: true, min: 15, max: 36, pattern: '^[a-z0-9-]+$' },
				// N° lisible : TC_… pour un bus (référence du bon), n° de commande pour un taxi.
				{ name: 'reference', type: 'text', max: 120 },
				{ name: 'route', type: 'text', max: 300 },
				{ name: 'service_day', type: 'text', max: 10, pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
				{ name: 'district', type: 'text', max: 20 },
				{
					name: 'file',
					type: 'file',
					required: true,
					maxSelect: 1,
					maxSize: 10 * 1024 * 1024,
					protected: true,
					mimeTypes: ['application/pdf']
				},
				{ name: 'generated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'r2_key', type: 'text', max: 300 },
				{ name: 'r2_at', type: 'date' },
				{ name: 'r2_error', type: 'text', max: 300 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_order_pdfs_order ON order_pdfs (kind, order_id)',
				'CREATE INDEX idx_order_pdfs_day ON order_pdfs (service_day)'
			]
		});
		app.save(pdfs);

		const backups = new Collection({
			type: 'base',
			name: 'order_pdf_backups',
			listRule: read('archives:read'),
			viewRule: read('archives:read'),
			createRule: null,
			updateRule: null,
			deleteRule: `${ACTIVE} && ${ADMIN}`,
			fields: [
				// Mois couvert (AAAA-MM, d'après la date de service des bons).
				{ name: 'month', type: 'text', required: true, max: 7, pattern: '^\\d{4}-\\d{2}$' },
				{ name: 'count', type: 'number', onlyInt: true, min: 0 },
				{
					name: 'file',
					type: 'file',
					required: true,
					maxSelect: 1,
					maxSize: 500 * 1024 * 1024,
					protected: true,
					mimeTypes: ['application/zip']
				},
				{ name: 'r2_key', type: 'text', max: 300 },
				{ name: 'r2_at', type: 'date' },
				{ name: 'r2_error', type: 'text', max: 300 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_order_pdf_backups_month ON order_pdf_backups (month)']
		});
		app.save(backups);
	},
	(app) => {
		for (const name of ['order_pdf_backups', 'order_pdfs']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {
				// Déjà supprimée.
			}
		}
	}
);
