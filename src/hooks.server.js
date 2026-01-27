// src/hooks.server.js
import { createServerClient } from '@supabase/ssr'
import { redirect } from '@sveltejs/kit'

// Utilisez l'import statique de SvelteKit, c'est plus fiable côté serveur
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
  const path = event.url.pathname

  // 0. EXCLURE les assets statiques et routes internes (AVANT tout le reste)
  if (
    path.startsWith('/_app') ||
    path.startsWith('/favicon') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico') ||
    path.endsWith('.webp') ||
    path.endsWith('.woff') ||
    path.endsWith('.woff2') ||
    path.endsWith('.ttf') ||
    path.startsWith('/api') ||
    path.startsWith('/rest')
  ) {
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
    return resolve(event)
  }

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

  // 1. CHARGER LES SETTINGS (avec cache) - FORCE REFRESH pour debug
  const now = Date.now();
  // Toujours recharger pour être sûr (enlève le cache temporairement)
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
    
    console.log('🔒 Gate mode:', settingsCache.gate, '| Maintenance:', settingsCache.maintenance);
  } catch (e) {
    console.error('❌ Erreur chargement settings:', e);
    settingsCache = { maintenance: false, gate: false, lastCheck: now };
  }

  // 2. GATE MODE - PRIORITÉ ABSOLUE
  const gatePassCookie = event.cookies.get('baco_gate_pass');
  const hasValidGatePass = isValidGatePass(gatePassCookie);
  
  console.log('🚪 Gate check - Path:', path, '| Has pass:', hasValidGatePass, '| Gate active:', settingsCache.gate);

  if (settingsCache.gate && !hasValidGatePass) {
    if (path !== '/gate') {
      console.log('🔴 REDIRECT TO GATE from', path);
      throw redirect(303, '/gate');
    }
  }

  // 3. Vérification de la session
  const {
    data: { user },
  } = await event.locals.supabase.auth.getUser()

  event.locals.user = user
  event.locals.session = !!user

  // 4. MAINTENANCE MODE
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

    if (!isAdmin) {
      console.log('🔧 REDIRECT TO MAINTENANCE from', path);
      throw redirect(303, '/maintenance');
    }
  }

  if (path === '/maintenance' && !settingsCache.maintenance) {
    throw redirect(303, user ? '/accueil' : '/');
  }

  // 5. Routes publiques
  if (path === '/' || path === '/gate' || path === '/maintenance' || path.startsWith('/auth') || path.startsWith('/rest') || path.startsWith('/api')) {
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