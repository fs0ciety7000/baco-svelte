// src/hooks.server.js
import { createServerClient } from '@supabase/ssr'
import { redirect } from '@sveltejs/kit'

// Utilisez l'import statique de SvelteKit, c'est plus fiable coté serveur
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

// Cache pour les settings (évite trop de requêtes)
let settingsCache = { maintenance: false, gate: false, lastCheck: 0 };
const CACHE_TTL = 30000; // 30 secondes

// Fonction pour valider le gate pass
function isValidGatePass(pass) {
  if (!pass) return false;
  try {
    const data = JSON.parse(Buffer.from(pass, 'base64').toString());
    return data.exp > Date.now();
  } catch {
    return false;
  }
}

export const handle = async ({ event, resolve }) => {

  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            event.cookies.set(name, value, { ...options, path: '/' })
          )
        },
      },
    }
  )

  const path = event.url.pathname

  // 1. CHARGER LES SETTINGS (avec cache)
  const now = Date.now();
  if (now - settingsCache.lastCheck > CACHE_TTL) {
    try {
      const { data } = await event.locals.supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['maintenance_mode', 'gate_mode']);

      const settings = {};
      data?.forEach(s => { settings[s.key] = s.value === 'true' || s.value === true; });

      settingsCache = {
        maintenance: settings.maintenance_mode || false,
        gate: settings.gate_mode || false,
        lastCheck: now
      };
    } catch (e) {
      // Table n'existe pas ou erreur
      settingsCache = { maintenance: false, gate: false, lastCheck: now };
    }
  }

  // 2. GATE MODE - Vérifier AVANT tout le reste
  // La gate bloque l'accès à tout le site sauf /gate elle-même
  if (settingsCache.gate && path !== '/gate') {
    // Vérifier si l'utilisateur a un pass valide (cookie côté client via localStorage sync)
    const gatePassCookie = event.cookies.get('baco_gate_pass');

    if (!isValidGatePass(gatePassCookie)) {
      throw redirect(303, '/gate');
    }
  }

  // Si on est sur /gate mais que la gate est désactivée, rediriger vers login
  if (path === '/gate' && !settingsCache.gate) {
    throw redirect(303, '/');
  }

  // 3. Vérification de la session (Sécurisé)
  const {
    data: { user },
  } = await event.locals.supabase.auth.getUser()

  event.locals.user = user
  event.locals.session = !!user

  // 4. MAINTENANCE MODE - Bloque TOUT sauf /maintenance et /gate
  if (settingsCache.maintenance && path !== '/maintenance' && path !== '/gate') {
    let isAdmin = false;

    if (user) {
      const { data: profile } = await event.locals.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      isAdmin = profile?.role === 'admin';
    }

    // Rediriger TOUT LE MONDE (sauf admins) vers la page maintenance
    if (!isAdmin) {
      throw redirect(303, '/maintenance');
    }
  }

  // Si on est sur /maintenance mais que la maintenance est désactivée, rediriger
  if (path === '/maintenance' && !settingsCache.maintenance) {
    throw redirect(303, user ? '/accueil' : '/');
  }

  // 5. Routes publiques (Login, API, etc.)
  if (path === '/' || path.startsWith('/auth') || path.startsWith('/rest') || path.startsWith('/api')) {
    // Si déjà connecté et sur la page de login, on redirige vers l'accueil
    if (user && path === '/') {
        throw redirect(303, '/accueil')
    }
    return resolve(event)
  }

  // 6. Si pas d'utilisateur -> Redirection Login
  if (!user) {
    throw redirect(303, '/')
  }

  // 7. Protection Spécifique ADMIN
  if (path.startsWith('/admin')) {
    const { data: profile } = await event.locals.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        throw redirect(303, '/accueil')
    }
  }

  // 8. Exécution de la requête
  return resolve(event, {
    filterSerializedResponseHeaders: (name) => name === 'content-range',
  })
}