/// <reference path="../pb_data/types.d.ts" />
// Intégration DICOS (Missions PMR, session 3). Décisions du 8 octobre 2026 (docs/design/CADRAGE-DICOS.md) :
// - les missions DICOS sont ingérées dans `pmr_assists` (prestations), avec `dicos_id` (dédup), `source`, `mission_type` ;
// - le détail NOMINATIF (client, e-mail, téléphone, accompagnateur, conducteur, point de rencontre) va dans une
//   collection à part `pmr_mission`, lisible avec `pmr:read` seulement (une règle ne masque pas un champ) et effacée à
//   l'anonymisation à 12 mois — comme `pmr_assist_legacy` ;
// - l'écriture d'ingestion est réservée à un compte de service portant le droit `dicos:write` (jamais un agent interactif).

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const COORD = `${ACTIVE} && (${ADMIN} || @request.auth.role = "moderator")`;
const DICOS = `${ACTIVE} && @request.auth.grants ~ '"dicos:write"'`;

function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	if (roles.length === 0) return `${ACTIVE} && (${ADMIN} || ${granted})`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}
const READERS = ['moderator', 'user', 'reader'];

migrate(
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		const add = (f) => {
			if (!assists.fields.getByName(f.name)) assists.fields.add(f);
		};
		add(new TextField({ name: 'dicos_id', max: 40 }));
		add(new SelectField({ name: 'source', maxSelect: 1, values: ['baco', 'dicos', 'manual'] }));
		add(new TextField({ name: 'mission_type', max: 20 }));
		assists.addIndex('idx_pmr_assists_dicos', true, 'dicos_id', "dicos_id != ''");

		// Ingestion DICOS : branche ajoutée aux règles de création / modification (compte de service `dicos:write`).
		// `dicos_id`/`source` posés, statut libre (une mission peut arriver déjà réalisée), champs sensibles non forgeables.
		const dicosCreate =
			`(${DICOS}) && @request.body.source = "dicos" && @request.body.dicos_id != "" && ` +
			'@request.body.created_by = @request.auth.id && @request.body.updated_by = @request.auth.id && ' +
			'@request.body.legacy_id:isset = false && @request.body.anonymized:isset = false';
		const dicosUpdate =
			`(${DICOS}) && source = "dicos" && @request.body.updated_by = @request.auth.id && ` +
			'@request.body.created_by:changed = false && @request.body.dicos_id:changed = false && ' +
			'@request.body.legacy_id:isset = false && @request.body.anonymized:isset = false';
		assists.createRule = `(${assists.createRule}) || (${dicosCreate})`;
		assists.updateRule = `(${assists.updateRule}) || (${dicosUpdate})`;
		app.save(assists);

		// Détail nominatif d'une mission DICOS : lisible avec pmr:read seulement, écrit par le service dicos:write.
		app.save(
			new Collection({
				type: 'base',
				name: 'pmr_mission',
				listRule: can('pmr:read', READERS),
				viewRule: can('pmr:read', READERS),
				createRule: `(${DICOS}) && @request.body.assist != ""`,
				updateRule: DICOS,
				deleteRule: ADMIN,
				fields: [
					{ name: 'assist', type: 'relation', collectionId: assists.id, maxSelect: 1, required: true, cascadeDelete: true },
					{ name: 'reservation_type', type: 'text', max: 40 },
					{ name: 'raw_status', type: 'text', max: 40 },
					{ name: 'client_first', type: 'text', max: 200 },
					{ name: 'client_last', type: 'text', max: 200 },
					{ name: 'client_phone', type: 'text', max: 100 },
					{ name: 'client_email', type: 'text', max: 200 },
					{ name: 'client_lang', type: 'text', max: 40 },
					{ name: 'client_desc', type: 'text', max: 500 },
					{ name: 'train_manager_name', type: 'text', max: 200 },
					{ name: 'train_manager_phone', type: 'text', max: 100 },
					{ name: 'driver_name', type: 'text', max: 200 },
					{ name: 'driver_phone', type: 'text', max: 100 },
					{ name: 'meeting_point', type: 'text', max: 300 },
					{ name: 'coach', type: 'text', max: 20 },
					{ name: 'door', type: 'text', max: 20 },
					{ name: 'owner_name', type: 'text', max: 200 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_pmr_mission_assist ON pmr_mission (assist)']
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('pmr_mission'));
		} catch (_) {}
		const assists = app.findCollectionByNameOrId('pmr_assists');
		// Les règles sont restaurées par la migration PMR si on redescend ; on retire seulement les champs ajoutés.
		for (const name of ['dicos_id', 'source', 'mission_type']) assists.fields.removeByName(name);
		app.save(assists);
	}
);
