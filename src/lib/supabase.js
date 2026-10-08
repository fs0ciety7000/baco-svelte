import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { AUTH_COOKIE, SUPABASE_PROXY_PATH } from '$lib/config';

/**
 * Client Supabase « navigateur ».
 * - Session stockée en cookie (`csm-auth`) pour que le serveur SvelteKit la voie
 *   (gardes de route côté serveur, voir hooks.server.js).
 * - Toutes les requêtes passent par le proxy same-origin, car le réseau de
 *   l'entreprise bloque *.supabase.co.
 *
 * Côté serveur (SSR d'un composant qui importe ce module), on expose un client
 * anonyme sans session : les données authentifiées se chargent via
 * `locals.supabase` dans les fichiers +page.server / +layout.server.
 */
export const supabase = browser
	? createBrowserClient(
			`${window.location.origin}${SUPABASE_PROXY_PATH}`,
			env.PUBLIC_SUPABASE_ANON_KEY,
			{
				cookieOptions: { name: AUTH_COOKIE }
			}
		)
	: createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY, {
			auth: { persistSession: false, autoRefreshToken: false }
		});
