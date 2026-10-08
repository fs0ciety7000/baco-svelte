/**
 * Cible de redirection interne sûre (anti « open redirect »).
 * N'accepte qu'un chemin relatif du même site : pas de `//`, pas d'antislash,
 * pas de caractères de contrôle, et l'origine résolue doit rester la nôtre.
 * @param {string | null | undefined} target
 * @param {string} origin
 * @param {string} [fallback]
 */
export function safeRedirect(target, origin, fallback = '/accueil') {
	if (!target || !target.startsWith('/') || target.startsWith('//')) return fallback;
	if (/[\\\u0000-\u001f\u007f]/.test(target)) return fallback;
	try {
		const url = new URL(target, origin);
		return url.origin === new URL(origin).origin ? url.pathname + url.search + url.hash : fallback;
	} catch {
		return fallback;
	}
}
