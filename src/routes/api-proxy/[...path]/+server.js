import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { resolveProxyTarget, hardenStorageHeaders } from '$lib/server/proxy';

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

/** @type {import('./$types').RequestHandler} */
async function proxy({ request, params, url, getClientAddress }) {
	const target = resolveProxyTarget(env.PUBLIC_SUPABASE_URL, params.path ?? '', url.search);
	if (!target) error(403, 'Chemin non autorisé');

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
	if (target.pathname.startsWith('/storage/v1/')) hardenStorageHeaders(responseHeaders);

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
