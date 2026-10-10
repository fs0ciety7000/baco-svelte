/// <reference path="../pb_data/types.d.ts" />
// Mot de passe oublié (décision du 10 oct. 2026) : e-mail en français, lien vers le site CSM (pas vers PocketBase, que
// le navigateur ne joint jamais), valable 30 minutes. Le SMTP est réglé par pb_hooks/mail.pb.js.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.resetPasswordTemplate.subject = 'CSM : réinitialisation de ton mot de passe';
		users.resetPasswordTemplate.body = [
			'<p>Bonjour,</p>',
			'<p>Une réinitialisation du mot de passe de ton compte CSM a été demandée.</p>',
			'<p><a href="{APP_URL}/connexion/nouveau-mot-de-passe?token={TOKEN}" target="_blank" rel="noopener">Choisir un nouveau mot de passe</a></p>',
			'<p>Le lien est valable 30 minutes et ne sert qu\'une fois. Si tu n\'as rien demandé, ignore ce message : ton mot de passe ne change pas.</p>',
			'<p>— CSM · Client Solutions</p>'
		].join('\n');
		users.passwordResetToken.duration = 1800;
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.passwordResetToken.duration = 1800;
		app.save(users);
	}
);
