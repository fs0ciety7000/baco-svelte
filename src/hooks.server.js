// src/hooks.server.js
import { createServerClient } from '@supabase/ssr'
import { redirect } from '@sveltejs/kit'

// Utilisez l'import statique de SvelteKit, c'est plus fiable coté serveur
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

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

  // A. Exclusion des routes publiques (Login, Assets, API auth)
  // Ajoutez ici vos routes publiques si besoin (ex: /about, /legal)
  if (path === '/' || path.startsWith('/auth') || path.startsWith('/rest')) {
    // Si déjà connecté et sur la page de login, on redirige vers l'accueil
    if (user && path === '/') {
        throw redirect(303, '/accueil')
    }
    return resolve(event)
  }

  // B. Si pas d'utilisateur -> Redirection Login
  if (!user) {
    throw redirect(303, '/')
  }

  // C. Protection Spécifique ADMIN
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