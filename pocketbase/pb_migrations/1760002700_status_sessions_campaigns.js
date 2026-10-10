/// <reference path="../pb_data/types.d.ts" />
// Demandes du 10 oct. 2026 :
// - statut du jour affiché au Journal (« EXTRA », « Pas en service »…) : `users.status` + `status_day` (valable ce jour-là),
//   modifiables par l'agent lui-même (updateRule inchangée) ;
// - sessions ouvertes : `user_sessions` (une fiche par connexion, cookie `csm_sid`), lues et supprimées par leur
//   propriétaire (et admin / sysop) ; supprimer la fiche déconnecte l'appareil (contrôle à chaque requête par Next) ;
// - campagnes d'e-mail (annonce du passage BACO → CSM) : `mail_campaigns`, admin / sysop seulement, envoi par la route
//   interne de PocketBase (pb_hooks/mail.pb.js).

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		if (!users.fields.getByName('status')) users.fields.add(new TextField({ name: 'status', max: 40 }));
		if (!users.fields.getByName('status_day'))
			users.fields.add(new TextField({ name: 'status_day', max: 10, pattern: '^$|^\\d{4}-\\d{2}-\\d{2}$' }));
		app.save(users);

		app.save(
			new Collection({
				type: 'base',
				name: 'user_sessions',
				listRule: `${ACTIVE} && (user = @request.auth.id || ${ADMIN})`,
				viewRule: `${ACTIVE} && (user = @request.auth.id || ${ADMIN})`,
				createRule: `${ACTIVE} && @request.body.user = @request.auth.id`,
				// Seule la dernière activité est mise à jour (par Next, avec le jeton de l'agent).
				updateRule:
					`${ACTIVE} && user = @request.auth.id && @request.body.user:isset = false && @request.body.sid:isset = false` +
					' && @request.body.user_agent:isset = false && @request.body.ip:isset = false',
				deleteRule: `${ACTIVE} && (user = @request.auth.id || ${ADMIN})`,
				fields: [
					{ name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
					{ name: 'sid', type: 'text', required: true, min: 32, max: 64, pattern: '^[a-f0-9]+$' },
					{ name: 'user_agent', type: 'text', max: 300 },
					{ name: 'ip', type: 'text', max: 64 },
					{ name: 'method', type: 'select', maxSelect: 1, values: ['password', 'passkey'] },
					{ name: 'last_seen', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_user_sessions_sid ON user_sessions (sid)',
					'CREATE INDEX idx_user_sessions_user ON user_sessions (user)'
				]
			})
		);

		app.save(
			new Collection({
				type: 'base',
				name: 'mail_campaigns',
				listRule: `${ACTIVE} && ${ADMIN}`,
				viewRule: `${ACTIVE} && ${ADMIN}`,
				createRule: `${ACTIVE} && ${ADMIN} && @request.body.created_by = @request.auth.id`,
				updateRule: `${ACTIVE} && ${ADMIN} && @request.body.created_by:isset = false`,
				deleteRule: `${ACTIVE} && ${ADMIN}`,
				fields: [
					{ name: 'subject', type: 'text', required: true, max: 200 },
					{ name: 'body', type: 'text', max: 20000 },
					{ name: 'status', type: 'select', maxSelect: 1, values: ['brouillon', 'envoyee'] },
					{ name: 'sent_count', type: 'number', onlyInt: true, min: 0 },
					{ name: 'failed', type: 'json', maxSize: 20000 },
					{ name: 'sent_at', type: 'date' },
					{ name: 'test_sent_at', type: 'date' },
					{ name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				]
			})
		);
	},
	(app) => {
		for (const n of ['mail_campaigns', 'user_sessions']) app.delete(app.findCollectionByNameOrId(n));
		const users = app.findCollectionByNameOrId('users');
		users.fields.removeByName('status');
		users.fields.removeByName('status_day');
		app.save(users);
	}
);
