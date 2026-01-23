import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// On détermine l'URL à utiliser
let supabaseUrl = PUBLIC_SUPABASE_URL; // Par défaut : la vraie URL (pour le serveur)

// Si on est dans le navigateur, on passe par le proxy
if (typeof window !== 'undefined') {
    // On construit l'URL manuellement pour éviter les erreurs de format
    // window.location.origin donne "https://baco-inky.vercel.app"
    supabaseUrl = `${window.location.origin}/api-proxy`;
}

export const supabase = createClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});