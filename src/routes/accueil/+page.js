import { supabase } from '$lib/supabase'; // Assurez-vous que le chemin est bon

export const ssr = false;

export async function load({ parent }) {
    // 1. On essaie de récupérer la session depuis le layout racine
    const parentData = await parent();
    let session = parentData.session;

    // 2. CORRECTION : Si le parent ne donne rien, on va chercher la session nous-mêmes
    // C'est ce qui manque actuellement.
    if (!session) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
    }

    let savedConfig = [];
    let savedTheme = 'default';

    // 3. Si on a récupéré une session (via parent OU manuellement), on charge les préférences
    if (session?.user) {
        const { data, error } = await supabase
            .from('user_preferences')
            .select('dashboard_config, theme')
            .eq('user_id', session.user.id)
            .maybeSingle(); // <--- REMPLACEZ .single() PAR CECI

        if (!error && data) {
            savedConfig = data.dashboard_config || [];
            savedTheme = data.theme || 'default';
        }
    }
    // 4. On renvoie tout à la page +page.svelte
    return {
        savedConfig,
        savedTheme,
        session // <--- Maintenant cette variable n'est plus nulle
    };
}