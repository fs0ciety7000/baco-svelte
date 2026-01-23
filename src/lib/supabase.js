import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { browser } from '$app/environment';

// Déterminer l'URL :
// - Si on est dans le navigateur -> On utilise le Proxy (pour contourner le firewall)
// - Si on est sur le serveur (Vercel) -> On utilise la vraie URL (plus rapide et non bloquée)
const supabaseUrl = browser 
    ? `${window.location.origin}/api-proxy` 
    : PUBLIC_SUPABASE_URL;

const options = {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        // Clé de stockage explicite pour éviter les conflits
        storageKey: 'sb-baco-inky-auth-token' 
    }
};

let client;

if (browser) {
    // SINGLETON PATTERN :
    // Si un client existe déjà dans la fenêtre (cas du Hot Reload ou navigation), on le réutilise.
    // Cela supprime l'avertissement "Multiple GoTrueClient instances".
    if (!window._supabaseInstance) {
        window._supabaseInstance = createClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, options);
    }
    client = window._supabaseInstance;
} else {
    // Sur le serveur, on crée toujours une nouvelle instance pour éviter le partage de session entre utilisateurs
    client = createClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, options);
}

export const supabase = client;