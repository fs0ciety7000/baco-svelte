import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Détection : sommes-nous dans le navigateur ?
const isBrowser = typeof window !== 'undefined';

// Si Navigateur : on utilise l'URL du Proxy (ex: https://baco-inky.vercel.app/api-proxy)
// Si Serveur : on utilise la vraie URL Supabase (car le serveur n'est pas bloqué)
const supabaseUrl = isBrowser 
    ? `${window.location.origin}/api-proxy` 
    : PUBLIC_SUPABASE_URL;

export const supabase = createClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});