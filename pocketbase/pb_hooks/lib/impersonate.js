// « Voir en tant que » : contrôles partagés par les routes de impersonate.pb.js (chargé par require()).

const TTL_S = 30 * 60;
const ADMINS = ['admin', 'sysop'];
// Rôles qu'on ne peut pas emprunter : autres administrateurs, compte de service, compte désactivé.
const FORBIDDEN = ['admin', 'sysop', 'connector', 'disabled'];

/**
 * Secret interne + appelant admin / sysop actif ; LÈVE une erreur sinon. Ne jamais « renvoyer » `e.json(...)` depuis une
 * fonction partagée : en JSVM `e.json()` vaut `undefined`, le gestionnaire continuait et renvoyait le jeton à la suite du
 * refus (audit sécurité du 14 oct. 2026, faille critique corrigée).
 */
function guard(e) {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) throw new NotFoundError('Not found.');
	const auth = e.auth;
	if (!auth || auth.collection().name !== 'users') throw new UnauthorizedError('Connexion requise.');
	if (ADMINS.indexOf(auth.getString('role')) === -1) throw new ForbiddenError('Réservé aux administrateurs.');
}

/** Motif du refus d'une cible (texte), ou '' si elle est valide. */
function refuseTarget(auth, target) {
	if (target.id === auth.id) return 'Impossible de te voir toi-même « en tant que ».';
	const role = target.getString('role');
	if (role === 'disabled') return 'Compte désactivé.';
	if (role === 'connector') return 'Compte de service : non consultable.';
	if (FORBIDDEN.indexOf(role) !== -1) return 'Un autre administrateur ne peut pas être consulté « en tant que ».';
	return '';
}

function audit(app, action, adminId, targetId) {
	const row = new Record(app.findCollectionByNameOrId('audit_log'));
	row.set('action', action);
	row.set('collection', 'users');
	row.set('record', targetId);
	row.set('user', adminId);
	row.set('changes', {});
	row.set('at', new Date().toISOString());
	app.save(row);
}

module.exports = { TTL_S, guard, refuseTarget, audit };
