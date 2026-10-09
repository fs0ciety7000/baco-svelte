/// <reference path="../pb_data/types.d.ts" />
// Jetons de connecteur PERSONNELS (9 oct. 2026) : chaque agent qui écrit les missions PMR génère depuis CSM le jeton de
// son extension DICOS (« Connecter l'extension »), au lieu d'un secret partagé distribué par l'admin. Seule l'empreinte
// SHA-256 est stockée ; le jeton en clair n'est montré qu'une fois. L'ingestion (compte `connector`) retrouve le jeton
// par son empreinte et note la dernière utilisation et la version de l'extension. Révocable par l'agent ou un admin ;
// supprimés à la désactivation du compte (hook users.pb.js).
// dicos_syncs : `complete` (dernier lot du jour reçu : une synchro interrompue s'affiche « incomplète »), `version`
// (version de l'extension), `synced_by` (agent propriétaire du jeton).

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const DICOS = `${ACTIVE} && @request.auth.grants ~ '"dicos:write"'`;
function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	const denied = `@request.auth.denies !~ '"${perm}"'`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && ${denied}) || ${granted})`;
}
// Écrire des missions (même via l'extension) exige le droit d'écriture des missions PMR (audit du 9 oct. 2026).
const WRITERS = ['moderator', 'user'];
const OWN = `${ACTIVE} && user = @request.auth.id`;

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		app.save(
			new Collection({
				type: 'base',
				name: 'connector_tokens',
				listRule: `(${OWN}) || (${ACTIVE} && ${ADMIN}) || (${DICOS})`,
				viewRule: `(${OWN}) || (${ACTIVE} && ${ADMIN}) || (${DICOS})`,
				// Pour soi seulement, avec le droit d'écrire les missions PMR ; jamais de date d'usage ni de version forgées.
				createRule:
					`(${can('deplacements:write', WRITERS)}) && @request.body.user = @request.auth.id` +
					' && @request.body.last_used:isset = false && @request.body.last_version:isset = false',
				// Seul le connecteur met à jour, et seulement l'usage (date, version).
				updateRule:
					`${DICOS} && @request.body.user:isset = false && @request.body.token_hash:isset = false` +
					' && @request.body.label:isset = false && @request.body.prefix:isset = false',
				deleteRule: `(${OWN}) || (${ACTIVE} && ${ADMIN})`,
				fields: [
					{ name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
					{ name: 'label', type: 'text', max: 80 },
					{ name: 'token_hash', type: 'text', required: true, min: 64, max: 64, pattern: '^[0-9a-f]{64}$' },
					{ name: 'prefix', type: 'text', max: 16 },
					{ name: 'last_used', type: 'date' },
					{ name: 'last_version', type: 'text', max: 20 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_connector_tokens_hash ON connector_tokens (token_hash)',
					'CREATE INDEX idx_connector_tokens_user ON connector_tokens (user)'
				]
			})
		);

		const syncs = app.findCollectionByNameOrId('dicos_syncs');
		syncs.fields.add(new BoolField({ name: 'complete' }));
		syncs.fields.add(new TextField({ name: 'version', max: 20 }));
		syncs.fields.add(new RelationField({ name: 'synced_by', collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
		app.save(syncs);
		// Fiches antérieures (extensions sans lots marqués) : considérées complètes, comme avant.
		app.db().newQuery('UPDATE dicos_syncs SET complete = 1').execute();
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('connector_tokens'));
		} catch (_) {}
		const syncs = app.findCollectionByNameOrId('dicos_syncs');
		for (const f of ['complete', 'version', 'synced_by']) syncs.fields.removeByName(f);
		app.save(syncs);
	}
);
