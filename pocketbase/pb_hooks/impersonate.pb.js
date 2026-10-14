/// <reference path="../pb_data/types.d.ts" />
// « Voir en tant que » (Administration, 14 oct. 2026). Routes internes réservées au serveur Next (secret partagé
// CSM_INTERNAL_SECRET, en-tête x-csm-internal, comparaison à temps constant ; coupées sans secret de 32 caractères) ET
// appelées avec le jeton de l'administrateur (en-tête Authorization) : l'appelant doit être un admin / sysop actif.
// Cible : compte actif, ni admin / sysop, ni compte de service, ni l'appelant. Le jeton renvoyé est un jeton STATIQUE de
// la cible (30 min, non renouvelable) ; la lecture seule est imposée par Next (middleware + client PocketBase en lecture).
// Début et fin tracés dans `audit_log` (action, administrateur, cible, rien d'autre).

// NB : les gestionnaires s'exécutent hors de la portée du fichier (pas de fonction partagée en tête) : require().

routerAdd('POST', '/api/csm/impersonate', (e) => {
	const lib = require(`${__hooks}/lib/impersonate.js`);
	const denied = lib.guard(e);
	if (denied) return denied;
	const body = e.requestInfo().body || {};
	let target;
	try {
		target = $app.findRecordById('users', String(body.target || '').slice(0, 40));
	} catch (err) {
		return e.json(404, { message: 'Compte introuvable.' });
	}
	const refused = lib.refuseTarget(e.auth, target);
	if (refused) return e.json(403, { message: refused });
	lib.audit($app, 'impersonate_start', e.auth.id, target.id);
	return e.json(200, {
		// time.Duration en nanosecondes.
		token: target.newStaticAuthToken(lib.TTL_S * 1000000000),
		id: target.id,
		name: target.getString('name') || target.getString('username'),
		role: target.getString('role'),
	});
});

// Fin du mode (bouton « Revenir à mon compte », expiration constatée, déconnexion) : trace seulement.
routerAdd('POST', '/api/csm/impersonate/stop', (e) => {
	const lib = require(`${__hooks}/lib/impersonate.js`);
	const denied = lib.guard(e);
	if (denied) return denied;
	const body = e.requestInfo().body || {};
	const target = String(body.target || '');
	if (!/^[a-z0-9-]{15,36}$/.test(target)) return e.json(400, { message: 'Cible invalide.' });
	lib.audit($app, 'impersonate_stop', e.auth.id, target);
	return e.json(200, { ok: true });
});
