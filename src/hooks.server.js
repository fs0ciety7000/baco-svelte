// src/hooks.server.js
import { createServerClient } from '@supabase/ssr'
import { redirect } from '@sveltejs/kit'

// Utilisez l'import statique de SvelteKit, c'est plus fiable coté serveur
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

// Cache pour le mode maintenance (évite trop de requêtes)
let maintenanceCache = { value: false, lastCheck: 0 };
const CACHE_TTL = 30000; // 30 secondes

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

  // 2. Vérification de la session (Sécurisé)
  // getUser() valide le token JWT coté serveur
  const {
    data: { user },
  } = await event.locals.supabase.auth.getUser()

  event.locals.user = user
  event.locals.session = !!user

  // 3. PROTECTION DES ROUTES
  const path = event.url.pathname

  // A. Vérifier le mode maintenance (avec cache)
  const now = Date.now();
  if (now - maintenanceCache.lastCheck > CACHE_TTL) {
    try {
      const { data } = await event.locals.supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single();

      maintenanceCache = {
        value: data?.value === 'true' || data?.value === true,
        lastCheck: now
      };
    } catch (e) {
      // Table n'existe pas ou erreur - pas de maintenance
      maintenanceCache = { value: false, lastCheck: now };
    }
  }

  // Si maintenance active, vérifier si l'utilisateur est admin
  if (maintenanceCache.value && !path.startsWith('/maintenance') && path !== '/') {
    let isAdmin = false;

    if (user) {
      const { data: profile } = await event.locals.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      isAdmin = profile?.role === 'admin';
    }

    // Rediriger les non-admins vers la page maintenance
    if (!isAdmin) {
      throw redirect(303, '/maintenance');
    }
  }

  // Si on est sur /maintenance mais que la maintenance est désactivée, rediriger vers accueil
  if (path === '/maintenance' && !maintenanceCache.value && user) {
    throw redirect(303, '/accueil');
  }

  // B. Exclusion des routes publiques (Login, Assets, API auth, Maintenance)
  if (path === '/' || path.startsWith('/auth') || path.startsWith('/rest') || path === '/maintenance') {
    // Si déjà connecté et sur la page de login, on redirige vers l'accueil
    if (user && path === '/') {
        throw redirect(303, '/accueil')
    }
    return resolve(event)
  }

  // C. Si pas d'utilisateur -> Redirection Login
  if (!user) {
    throw redirect(303, '/')
  }

  // D. Protection Spécifique ADMIN
  if (path.startsWith('/admin')) {
    // On doit vérifier le rôle en base de données
    const { data: profile } = await event.locals.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        // Tentative d'accès non autorisé -> Redirection ou Erreur
        throw redirect(303, '/accueil')
    }
  }

  // 4. Exécution de la requête
  return resolve(event, {
    filterSerializedResponseHeaders: (name) => name === 'content-range',
  })
}