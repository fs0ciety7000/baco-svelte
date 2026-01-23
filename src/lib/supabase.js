import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Si on est dans le navigateur (client), on utilise le proxy
// Si on est sur le serveur (SSR), on utilise la vraie URL (car le serveur n'est pas bloqué)
const isBrowser = typeof window !== 'undefined';
const supabaseUrl = isBrowser ? '/api-proxy' : PUBLIC_SUPABASE_URL;

export const supabase = createClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
        // Important : L'auth doit souvent persister sur le domaine principal
        persistSession: true,
        autoRefreshToken: true,
    }
});