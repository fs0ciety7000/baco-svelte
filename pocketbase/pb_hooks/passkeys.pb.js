/// <reference path="../pb_data/types.d.ts" />
// Connexion par passkey (décision du 10 oct. 2026). La signature WebAuthn est vérifiée par le serveur Next ; ces deux
// routes internes, réservées à Next par le secret partagé CSM_INTERNAL_SECRET (en-tête x-csm-internal, comparaison à
// temps constant ; routes coupées sans secret de 32 caractères au moins), lui fournissent la clé publique puis un jeton
// de session pour l'agent. Le navigateur ne joint jamais PocketBase.

// NB : les gestionnaires s'exécutent hors de la portée du fichier (pas de fonction partagée en tête) : contrôle répété.

// Clé publique d'une passkey (par identifiant de credential) : pour la vérification par Next.
routerAdd('POST', '/api/csm/passkey/lookup', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	const id = String(body.credentialId || '').slice(0, 1400);
	if (!id) return e.json(400, { message: 'credentialId requis' });
	let pk;
	try {
		pk = $app.findFirstRecordByFilter('passkeys', 'credential_id = {:id}', { id: id });
	} catch (err) {
		return e.json(404, { message: 'Passkey inconnue.' });
	}
	let user;
	try {
		user = $app.findRecordById('users', pk.getString('user'));
	} catch (err) {
		return e.json(404, { message: 'Passkey inconnue.' });
	}
	// Même réponse qu'une passkey inconnue : ne pas révéler qu'un compte est désactivé.
	if (user.getString('role') === 'disabled') return e.json(404, { message: 'Passkey inconnue.' });
	return e.json(200, {
		publicKey: pk.getString('public_key'),
		counter: pk.getInt('counter'),
		transports: pk.get('transports') || [],
	});
});

// Après vérification réussie par Next : compteur mis à jour (anti-clonage), jeton de session de l'agent.
routerAdd('POST', '/api/csm/passkey/token', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	const id = String(body.credentialId || '').slice(0, 1400);
	const counter = parseInt(body.counter, 10) || 0;
	let pk;
	try {
		pk = $app.findFirstRecordByFilter('passkeys', 'credential_id = {:id}', { id: id });
	} catch (err) {
		return e.json(404, { message: 'Passkey inconnue.' });
	}
	const old = pk.getInt('counter');
	// Un compteur qui recule (hors authentificateurs à compteur nul) trahit une clé clonée : refus.
	if (old > 0 && counter <= old) return e.json(409, { message: 'Compteur de passkey incohérent.' });
	const user = $app.findRecordById('users', pk.getString('user'));
	if (user.getString('role') === 'disabled') return e.json(403, { message: 'Compte désactivé.' });
	pk.set('counter', counter);
	pk.set('last_used', new Date().toISOString().replace('T', ' '));
	$app.saveNoValidate(pk);
	return e.json(200, { token: user.newAuthToken() });
});

// Enregistrement d'une passkey, après vérification de l'attestation par Next (revue sécurité du 10 oct. 2026 : plus de
// création directe par l'agent). 10 par compte au plus ; compte actif seulement.
routerAdd('POST', '/api/csm/passkey/register', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	const userId = String(body.user || '');
	let user;
	try {
		user = $app.findRecordById('users', userId);
	} catch (err) {
		return e.json(404, { message: 'Compte introuvable.' });
	}
	if (user.getString('role') === 'disabled' || user.getString('role') === 'connector')
		return e.json(403, { message: 'Compte non autorisé.' });
	const count = $app.countRecords('passkeys', $dbx.hashExp({ user: userId }));
	if (count >= 10) return e.json(409, { message: '10 passkeys au plus : supprimes-en une.' });
	const col = $app.findCollectionByNameOrId('passkeys');
	const r = new Record(col);
	r.set('user', userId);
	r.set('credential_id', String(body.credentialId || '').slice(0, 1400));
	r.set('public_key', String(body.publicKey || '').slice(0, 4000));
	r.set('counter', Math.max(0, parseInt(body.counter, 10) || 0));
	r.set('transports', Array.isArray(body.transports) ? body.transports.slice(0, 8).map(String) : []);
	r.set('device_type', String(body.deviceType || '').slice(0, 40));
	r.set('backed_up', body.backedUp === true);
	r.set('name', String(body.name || 'Passkey').slice(0, 80));
	try {
		$app.save(r);
	} catch (err) {
		return e.json(409, { message: 'Passkey déjà enregistrée.' });
	}
	return e.json(200, { id: r.id });
});

// Mot de passe réinitialisé (compte peut-être compromis) : ses passkeys sont supprimées.
onRecordConfirmPasswordResetRequest((e) => {
	e.next();
	try {
		const list = $app.findRecordsByFilter('passkeys', 'user = {:u}', '', 50, 0, { u: e.record.id });
		for (const pk of list) $app.delete(pk);
	} catch (err) {
		console.log('passkeys : nettoyage après réinitialisation impossible :', String(err));
	}
}, 'users');

// Compte désactivé : ses passkeys sont supprimées (comme ses jetons de connecteur).
onRecordAfterUpdateSuccess((e) => {
	e.next();
	if (e.record.getString('role') !== 'disabled') return;
	try {
		const list = $app.findRecordsByFilter('passkeys', 'user = {:u}', '', 50, 0, { u: e.record.id });
		for (const pk of list) $app.delete(pk);
	} catch (err) {
		console.log('passkeys : nettoyage après désactivation impossible :', String(err));
	}
}, 'users');

// « Déconnecter les autres appareils » (demande du 10 oct. 2026) : nouvelle clé de jeton (tous les jetons existants de
// l'agent deviennent invalides) puis jeton neuf pour l'appareil courant, renvoyé à Next seul (secret partagé).
routerAdd('POST', '/api/csm/session/rotate', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	let user;
	try {
		user = $app.findRecordById('users', String(body.user || ''));
	} catch (err) {
		return e.json(404, { message: 'Compte introuvable.' });
	}
	if (user.getString('role') === 'disabled') return e.json(403, { message: 'Compte désactivé.' });
	user.refreshTokenKey();
	$app.saveNoValidate(user);
	return e.json(200, { token: user.newAuthToken() });
});

// Ouverture d'une session (connexion réussie côté Next) : 20 sessions au plus par agent, les plus anciennes fermées.
routerAdd('POST', '/api/csm/session/open', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	let user;
	try {
		user = $app.findRecordById('users', String(body.user || ''));
	} catch (err) {
		return e.json(404, { message: 'Compte introuvable.' });
	}
	if (user.getString('role') === 'disabled') return e.json(403, { message: 'Compte désactivé.' });
	const sid = String(body.sid || '');
	if (!/^[a-f0-9]{32,64}$/.test(sid)) return e.json(400, { message: 'Identifiant de session invalide.' });
	const old = $app.findRecordsByFilter('user_sessions', 'user = {:u}', '-last_seen', 200, 0, { u: user.id });
	for (let i = 19; i < old.length; i++) $app.delete(old[i]);
	const r = new Record($app.findCollectionByNameOrId('user_sessions'));
	r.set('user', user.id);
	r.set('sid', sid);
	r.set('method', body.method === 'passkey' ? 'passkey' : 'password');
	r.set('user_agent', String(body.user_agent || '').slice(0, 300));
	r.set('ip', String(body.ip || '').slice(0, 64));
	r.set('last_seen', new Date().toISOString().replace('T', ' '));
	$app.save(r);
	return e.json(200, { id: r.id });
});

// Purge quotidienne : sessions sans activité depuis 30 jours (le jeton PocketBase expire de toute façon avant).
cronAdd('user-sessions-purge', '40 3 * * *', () => {
	const limit = new Date(Date.now() - 30 * 86400000).toISOString().replace('T', ' ');
	try {
		const old = $app.findRecordsByFilter('user_sessions', 'last_seen < {:d}', '', 2000, 0, { d: limit });
		for (const r of old) $app.delete(r);
	} catch (err) {
		console.log('user-sessions-purge :', String(err));
	}
});
