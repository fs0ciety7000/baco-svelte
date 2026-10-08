// src/hooks.server.js
import { createServerClient } from '@supabase/ssr';
import { redirect, error } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { AUTH_COOKIE, SUPABASE_PROXY_PATH } from '$lib/config';
import { isPublicRoute, canAccessRoute, isAdminLike } from '$lib/server/guards';

const SETTINGS_TTL = 30_000;
let settingsCache = { maintenance: false, at: 0 };

/** Chemins qui ne passent ni par l'auth ni par les gardes (assets, santé, proxy). */
function isBypassed(path) {
	return (
		path.startsWith('/_app/') ||
		path === '/healthz' ||
		path === '/sw.js' ||
		path.startsWith('/workbox-') ||
		path === '/manifest.webmanifest' ||
		/\.[a-z0-9]{2,5}$/i.test(path)
	);
}

/** 1. Client Supabase serveur (cookies) + helpers de session. */
const supabaseHandle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(
		env.PUBLIC_SUPABASE_URL,
		env.PUBLIC_SUPABASE_ANON_KEY,
		{
			cookieOptions: { name: AUTH_COOKIE },
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) =>
						event.cookies.set(name, value, {
							...options,
							path: '/',
							sameSite: 'lax',
							secure: !dev,
							// Le client navigateur doit pouvoir lire la session (requêtes via le proxy).
							httpOnly: false
						})
					);
				}
			}
		}
	);

	/** getUser() valide le JWT auprès de Supabase (contrairement à getSession()). Mémoïsé par requête. */
	let userPromise;
	event.locals.getUser = () => {
		userPromise ??= event.locals.supabase.auth
			.getUser()
			.then(({ data, error: err }) => (err ? null : data.user))
			.catch(() => null);
		return userPromise;
	};

	let profilePromise;
	event.locals.getProfile = () => {
		profilePromise ??= event.locals.getUser().then(async (user) => {
			if (!user) return null;
			const { data } = await event.locals.supabase
				.from('profiles')
				.select('id, role, permissions, banned_until, full_name, avatar_url, username')
				.eq('id', user.id)
				.single();
			return data ?? null;
		});
		return profilePromise;
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

/** 2. Mode maintenance + authentification + autorisation par route. */
const guardHandle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (isBypassed(path) || path.startsWith(SUPABASE_PROXY_PATH)) {
		return resolve(event);
	}

	const isApi = path.startsWith('/api/');

	// Maintenance (lecture anon autorisée par RLS sur app_settings)
	if (Date.now() - settingsCache.at > SETTINGS_TTL) {
		const { data } = await event.locals.supabase
			.from('app_settings')
			.select('value')
			.eq('key', 'maintenance_mode')
			.maybeSingle();
		settingsCache = { maintenance: data?.value === 'true' || data?.value === true, at: Date.now() };
	}

	const user = await event.locals.getUser();
	event.locals.user = user;

	if (path === '/') {
		redirect(303, user ? '/accueil' : '/login');
	}

	if (isPublicRoute(path)) {
		if (path === '/login' && user) redirect(303, '/accueil');
		if (path === '/maintenance' && !settingsCache.maintenance)
			redirect(303, user ? '/accueil' : '/login');
		return resolve(event);
	}

	if (!user) {
		if (isApi) error(401, 'Non authentifié');
		const redirectTo = path + event.url.search;
		redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	const profile = await event.locals.getProfile();
	event.locals.profile = profile;

	if (profile?.banned_until && new Date(profile.banned_until) > new Date()) {
		await event.locals.supabase.auth.signOut();
		redirect(303, '/login?banned=1');
	}

	if (settingsCache.maintenance && !isAdminLike(profile)) {
		if (isApi) error(503, 'Maintenance en cours');
		redirect(303, '/maintenance');
	}

	if (!isApi && !canAccessRoute(path, profile)) {
		redirect(303, '/accueil?denied=1');
	}

	return resolve(event);
};

/** 3. En-têtes de sécurité (la CSP est gérée par kit.csp dans svelte.config.js). */
const headersHandle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(self), payment=()'
	);
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	if (!dev)
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	return response;
};

export const handle = sequence(supabaseHandle, guardHandle, headersHandle);

/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ error: err, event, status }) {
	if (status !== 404) {
		console.error(
			JSON.stringify({ level: 'error', path: event.url.pathname, status, message: err?.message })
		);
	}
	return { message: status === 404 ? 'Page introuvable' : 'Une erreur inattendue est survenue.' };
}
