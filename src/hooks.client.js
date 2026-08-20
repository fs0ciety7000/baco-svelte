// src/hooks.client.js
// Capture les erreurs client non gérées et les journalise en base (app_error_logs)
// pour alimenter le dashboard santé de l'app (/admin/sante, réservé sysop).
import { supabase } from '$lib/supabase';

/** @type {import('@sveltejs/kit').HandleClientError} */
export async function handleError({ error, event }) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from('app_error_logs').insert({
            message: error?.message || String(error),
            stack: error?.stack || null,
            url: event?.url?.pathname || null,
            user_id: session?.user?.id || null
        });
    } catch {
        // Ne jamais faire planter l'app à cause du logging d'erreur lui-même
    }

    return {
        message: 'Une erreur inattendue est survenue.'
    };
}
