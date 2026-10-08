/**
 * Règles du proxy same-origin vers Supabase (/api-proxy/*).
 * Isolé ici pour être testé unitairement (voir proxy.test.js).
 */

const ALLOWED_PREFIXES = ['/rest/v1/', '/storage/v1/', '/auth/v1/'];

/** Endpoints Auth autorisés depuis le navigateur (connexion/inscription : uniquement côté serveur). */
const ALLOWED_AUTH = new Set(['/auth/v1/user', '/auth/v1/logout', '/auth/v1/token']);

/**
 * Construit l'URL Supabase cible à partir du chemin décodé reçu par SvelteKit,
 * puis vérifie la liste blanche sur le chemin NORMALISÉ (après résolution des
 * `..`, des encodages, etc.). Renvoie null si la requête doit être refusée.
 *
 * @param {string} base     PUBLIC_SUPABASE_URL
 * @param {string} rawPath  params.path (déjà décodé par SvelteKit)
 * @param {string} search   url.search
 * @returns {URL | null}
 */
export function resolveProxyTarget(base, rawPath, search) {
	// Caractères de contrôle, antislash : supprimés ou réinterprétés par fetch → refus.
	if (/[\u0000-\u001f\u007f\\]/.test(rawPath)) return null;

	const origin = new URL(base);
	let target;
	try {
		target = new URL(`/${rawPath}${search}`, origin);
	} catch {
		return null;
	}
	if (target.origin !== origin.origin) return null;

	let pathname;
	try {
		pathname = decodeURIComponent(target.pathname);
	} catch {
		return null;
	}
	if (pathname.includes('..') || /[\u0000-\u001f\u007f\\]/.test(pathname)) return null;
	if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return null;

	if (pathname.startsWith('/auth/v1/')) {
		if (!ALLOWED_AUTH.has(pathname)) return null;
		if (
			pathname === '/auth/v1/token' &&
			target.searchParams.get('grant_type') !== 'refresh_token'
		) {
			return null;
		}
	}
	return target;
}

/** Types de fichiers Storage affichables en ligne sans risque d'exécution de script. */
const INLINE_SAFE_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/avif',
	'application/pdf'
]);

/**
 * Durcit les en-têtes d'un fichier servi depuis Supabase Storage via notre domaine :
 * un SVG/HTML téléversé ne doit jamais s'exécuter sur l'origine de CSM.
 * @param {Headers} headers
 */
export function hardenStorageHeaders(headers) {
	const type = (headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	headers.set(
		'content-security-policy',
		"sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
	);
	headers.set('x-content-type-options', 'nosniff');
	if (!INLINE_SAFE_TYPES.has(type)) {
		headers.set('content-disposition', 'attachment');
	}
}
