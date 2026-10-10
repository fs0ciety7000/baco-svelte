/// <reference path="../pb_data/types.d.ts" />
// E-mail de réinitialisation du mot de passe (décision du 10 oct. 2026 : « mot de passe oublié » par e-mail). Seul envoi
// automatique de CSM : les bons de commande restent des brouillons .eml envoyés à la main. SMTP réglé à chaque démarrage
// de `serve` depuis les variables de csm-pocketbase (jamais dans Git) ; elles sont la SEULE source de vérité :
// - CSM_SMTP_HOST, CSM_SMTP_USER, CSM_SMTP_PASSWORD, CSM_MAIL_SENDER : toutes présentes → envoi activé ;
//   CSM_SMTP_PORT (défaut 587 ; 465 = TLS implicite), CSM_MAIL_SENDER_NAME (défaut « CSM · Client Solutions ») ;
// - sinon → SMTP coupé : la page « Mot de passe oublié » renvoie vers un administrateur.
// CSM_APP_URL (https://test-csm.fs0ciety.org, https://csm.fs0ciety.org) : adresse du site dans le lien de l'e-mail.
onBootstrap((e) => {
	e.next();
	const args = $os.args || [];
	let serve = false;
	for (let i = 0; i < args.length; i++) if (String(args[i]) === 'serve') serve = true;
	if (!serve) return;
	const env = (k) => String($os.getenv(k) || '').trim();
	const host = env('CSM_SMTP_HOST');
	const user = env('CSM_SMTP_USER');
	const password = env('CSM_SMTP_PASSWORD');
	const sender = env('CSM_MAIL_SENDER');
	const appUrl = env('CSM_APP_URL').replace(/\/+$/, '');
	const complete = !!(host && user && password && sender && /^https:\/\//.test(appUrl));
	const port = parseInt(env('CSM_SMTP_PORT'), 10) || 587;
	try {
		const settings = e.app.settings().clone();
		if (appUrl) settings.meta.appURL = appUrl;
		settings.meta.appName = 'CSM';
		if (complete) {
			settings.meta.senderAddress = sender;
			settings.meta.senderName = env('CSM_MAIL_SENDER_NAME') || 'CSM · Client Solutions';
			settings.smtp.enabled = true;
			settings.smtp.host = host;
			settings.smtp.port = port;
			settings.smtp.username = user;
			settings.smtp.password = password;
			settings.smtp.tls = port === 465;
		} else {
			settings.smtp.enabled = false;
			settings.smtp.password = '';
		}
		e.app.save(settings);
		console.log(`e-mail : ${complete ? `SMTP ${host}:${port}` : 'coupé (variables CSM_SMTP_* / CSM_APP_URL incomplètes)'}`);
	} catch (err) {
		console.log('e-mail : réglage ignoré :', String(err));
	}
});

// Le site demande si la réinitialisation par e-mail est possible (aucune donnée sensible renvoyée).
routerAdd('GET', '/api/csm/password-reset', (e) => {
	return e.json(200, { enabled: !!$app.settings().smtp.enabled });
});
