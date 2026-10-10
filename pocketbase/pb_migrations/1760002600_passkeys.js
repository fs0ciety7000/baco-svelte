/// <reference path="../pb_data/types.d.ts" />
// Passkeys (décision du 10 oct. 2026) : WebAuthn vérifié par le serveur Next (@simplewebauthn) ; PocketBase garde les
// clés publiques. L'agent voit, nomme et supprime les siennes ; admin / sysop voient et suppriment celles de tous.
// Création, compteur et dernière utilisation : routes internes seulement (pb_hooks/passkeys.pb.js), après vérification
// par Next. Passkeys supprimées à la réinitialisation du mot de passe et à la désactivation du compte.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		app.save(
			new Collection({
				type: 'base',
				name: 'passkeys',
				listRule: `${ACTIVE} && (user = @request.auth.id || ${ADMIN})`,
				viewRule: `${ACTIVE} && (user = @request.auth.id || ${ADMIN})`,
				// Création par la route interne seulement (après vérification de l'attestation par Next) : un agent qui
				// écrirait directement une clé publique de son choix se ménagerait un accès survivant au changement de mot
				// de passe (revue sécurité du 10 oct. 2026).
				createRule: null,
				updateRule:
					`${ACTIVE} && user = @request.auth.id && @request.body.user:isset = false && @request.body.credential_id:isset = false` +
					' && @request.body.public_key:isset = false && @request.body.counter:isset = false && @request.body.last_used:isset = false',
				deleteRule: `${ACTIVE} && (user = @request.auth.id || ${ADMIN})`,
				fields: [
					{ name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
					{ name: 'credential_id', type: 'text', required: true, max: 1400 },
					{ name: 'public_key', type: 'text', required: true, max: 4000 },
					{ name: 'counter', type: 'number', onlyInt: true, min: 0 },
					{ name: 'transports', type: 'json', maxSize: 500 },
					{ name: 'device_type', type: 'text', max: 40 },
					{ name: 'backed_up', type: 'bool' },
					{ name: 'name', type: 'text', max: 80 },
					{ name: 'last_used', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_passkeys_credential ON passkeys (credential_id)',
					'CREATE INDEX idx_passkeys_user ON passkeys (user)'
				]
			})
		);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('passkeys'));
	}
);
