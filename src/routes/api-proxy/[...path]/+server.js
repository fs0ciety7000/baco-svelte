import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

/**
 * Proxy same-origin vers Supabase.
 *
 * Le réseau de l'entreprise bloque *.supabase.co : le navigateur passe donc par
 * ce point d'entrée. Il est volontairement restreint :
 *  - liste blanche de services (REST, RPC, Auth limité, Storage) ;
 *  - en-têtes filtrés dans les deux sens (pas de cookies, pas d'en-têtes hop-by-hop) ;
 *  - connexion par mot de passe / inscription interdites ici (passent par /login, côté serveur).
 *
 * La sécurité des données repose sur la RLS : le JWT de l'utilisateur est relayé tel quel.
 */

const ALLOWED_PREFIXES = ['rest/v1/', 'storage/v1/', 'auth/v1/'];

/** Endpoints Auth autorisés depuis le navigateur. */
const ALLOWED_AUTH = new Set(['auth/v1/user', 'auth/v1/logout', 'auth/v1/token']);

const FORWARD_REQUEST_HEADERS = [
	'accept',
	'accept-profile',
	'authorization',
	'cache-control',
	'content-profile',
	'content-type',
	'prefer',
	'range',
	'x-client-info',
	'x-supabase-api-version',
	'x-upsert'
];

const DROP_RESPONSE_HEADERS = [
	'content-encoding',
	'content-length',
	'transfer-encoding',
	'connection',
	'set-cookie'
];

/** @param {string} path @param {URL} url */
function isAllowed(path, url) {
	if (path.includes('..')) return false;
	if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return false;
	if (path.startsWith('auth/v1/')) {
		if (!ALLOWED_AUTH.has(path)) return false;
		// Seul le rafraîchissement de jeton est permis via le proxy.
		if (path === 'auth/v1/token' && url.searchParams.get('grant_type') !== 'refresh_token')
			return false;
	}
	return true;
}

/** @type {import('./$types').RequestHandler} */
async function proxy({ request, params, url, getClientAddress }) {
	const path = params.path ?? '';
	if (!isAllowed(path, url)) error(403, 'Chemin non autorisé');

	const target = `${env.PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/${path}${url.search}`;

	const headers = new Headers();
	for (const name of FORWARD_REQUEST_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	headers.set('apikey', env.PUBLIC_SUPABASE_ANON_KEY);
	headers.set('x-forwarded-for', getClientAddress());

	const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

	let upstream;
	try {
		upstream = await fetch(target, {
			method: request.method,
			headers,
			body: hasBody ? request.body : undefined,
			// @ts-expect-error — requis par undici pour streamer le corps
			duplex: hasBody ? 'half' : undefined,
			redirect: 'manual'
		});
	} catch {
		error(502, 'Supabase injoignable');
	}

	const responseHeaders = new Headers(upstream.headers);
	for (const name of DROP_RESPONSE_HEADERS) responseHeaders.delete(name);
	responseHeaders.set('cache-control', 'no-store');

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders
	});
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
