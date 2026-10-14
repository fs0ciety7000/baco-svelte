/// <reference path="../pb_data/types.d.ts" />
// grants / denies toujours des tableaux : les règles d'accès testent `denies !~ '"perm"'`, et un JSON null
// rendrait ce test faux (NULL en SQL), ce qui couperait l'accès de l'agent à tout le module.
//
// `perms` (rôles v3, lot L1) : permissions effectives, TOUJOURS recalculées ici à partir de role / grants / denies
// (lib/perms.js) ; une valeur envoyée dans le corps est ignorée, même par un admin ou un superuser. Jamais `null`.

onRecordCreate((e) => {
	for (const f of ['grants', 'denies']) {
		// get() renvoie du JSON brut (pas un tableau JS) : on teste sa forme texte.
		const raw = e.record.getString(f).trim();
		if (!raw.startsWith('[')) e.record.set(f, []);
	}
	e.record.set('perms', require(`${__hooks}/lib/perms.js`).permsOf(e.record));
	e.next();
}, 'users');

onRecordUpdate((e) => {
	for (const f of ['grants', 'denies']) {
		// get() renvoie du JSON brut (pas un tableau JS) : on teste sa forme texte.
		const raw = e.record.getString(f).trim();
		if (!raw.startsWith('[')) e.record.set(f, []);
	}
	e.record.set('perms', require(`${__hooks}/lib/perms.js`).permsOf(e.record));
	e.next();
}, 'users');

// Désactivation d'un compte : les jetons déjà émis sont révoqués (nouvelle `tokenKey`), sinon un ancien jeton resterait
// valable jusqu'à son expiration (audit du 9 oct. 2026).
onRecordUpdate((e) => {
	if (e.record.getString('role') === 'disabled' && e.record.original().getString('role') !== 'disabled') {
		e.record.refreshTokenKey();
	}
	e.next();
}, 'users');

// Jetons de connecteur personnels (extension DICOS) supprimés à la désactivation du compte.
onRecordAfterUpdateSuccess((e) => {
	if (e.record.getString('role') === 'disabled') {
		try {
			for (const t of $app.findRecordsByFilter('connector_tokens', 'user = {:u}', '', 0, 0, { u: e.record.id })) {
				$app.delete(t);
			}
		} catch (err) {
			console.log('connector_tokens: suppression impossible', err);
		}
	}
	e.next();
}, 'users');

// Au plus 10 jetons par agent (un par poste / navigateur suffit).
onRecordCreateRequest((e) => {
	const user = e.record.getString('user');
	const n = $app.countRecords('connector_tokens', $dbx.hashExp({ user: user }));
	if (n >= 10) throw new BadRequestError('10 jetons au plus : révoque un ancien appareil.');
	e.next();
}, 'connector_tokens');

// perms / grants / denies d'un AUTRE agent : visibles des seuls admin / sysop (et superusers). L'agent garde les siens
// (`getCurrentUser` côté web lit `perms`, et `grants` pour les droits hors catalogue). Le compte de service (`connector`)
// lit `perms` du propriétaire d'un jeton d'extension (web : `authenticateConnector`), jamais grants / denies.
// Masquage à la réponse seulement : `@request.auth.*` des règles lit la base, pas la réponse.
onRecordEnrich((e) => {
	const auth = e.requestInfo && e.requestInfo.auth;
	const role = auth ? auth.getString('role') : '';
	const admin = !!auth && (auth.isSuperuser() || role === 'admin' || role === 'sysop');
	if (!admin && (!auth || auth.id !== e.record.id)) {
		if (role === 'connector') e.record.hide('grants', 'denies');
		else e.record.hide('perms', 'grants', 'denies');
	}
	e.next();
}, 'users');

// Catalogue modifié par un déploiement (clé ajoutée, rôle par défaut changé) : `perms` de chaque compte recalculé au
// démarrage de `serve`, avant toute connexion (une trentaine de comptes). Écrit en SQL et seulement s'il change : ni
// `updated`, ni audit, ni événement temps réel. Une erreur n'empêche pas le démarrage (premier démarrage : le champ est
// ajouté ensuite par la migration 1760004300, qui fait le calcul) ; toute modification d'un compte recalcule aussi.
onBootstrap((e) => {
	e.next();
	const args = $os.args || [];
	let serve = false;
	for (let i = 0; i < args.length; i++) if (String(args[i]) === 'serve') serve = true;
	if (!serve) return;
	try {
		const perms = require(`${__hooks}/lib/perms.js`);
		let n = 0;
		for (const r of $app.findAllRecords('users')) {
			const next = JSON.stringify(perms.permsOf(r));
			let cur = null;
			try {
				cur = JSON.stringify(JSON.parse(r.getString('perms') || 'null'));
			} catch (_) {
				cur = null;
			}
			if (cur === next) continue;
			$app.db().newQuery('UPDATE users SET perms = {:p} WHERE id = {:id}').bind({ p: next, id: r.id }).execute();
			n++;
		}
		if (n) console.log(`users.perms recalculé pour ${n} compte(s) (catalogue des permissions modifié)`);
	} catch (err) {
		console.log('users.perms : recalcul au démarrage impossible', err);
	}
});
