// src/routes/api/admin/create-user/+server.js
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export async function POST({ request, locals }) {
    // 1. Vérifier que l'utilisateur est admin
    const user = locals.user;
    if (!user) {
        throw error(401, 'Non authentifié');
    }

    const { data: profile } = await locals.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        throw error(403, 'Accès refusé - Admin uniquement');
    }

    // 2. Récupérer les données du formulaire
    const { email, password, full_name, role = 'reader' } = await request.json();

    if (!email || !password) {
        throw error(400, 'Email et mot de passe requis');
    }

    if (password.length < 8) {
        throw error(400, 'Le mot de passe doit contenir au moins 8 caractères');
    }

    // Validation du rôle
    const validRoles = ['reader', 'user', 'moderator', 'admin'];
    if (!validRoles.includes(role)) {
        throw error(400, 'Rôle invalide');
    }

    // 3. Créer le client admin Supabase (avec service_role key)
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        // 4. Créer l'utilisateur via l'admin API
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Confirme automatiquement l'email
            user_metadata: {
                full_name: full_name || ''
            }
        });

        if (createError) {
            console.error('Erreur création utilisateur:', createError);
            throw error(400, createError.message);
        }

        // 5. Mettre à jour le profil avec le rôle et le nom
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({
                role: role,
                full_name: full_name || '',
                updated_at: new Date().toISOString()
            })
            .eq('id', newUser.user.id);

        if (updateError) {
            console.error('Erreur mise à jour profil:', updateError);
            // L'utilisateur est créé mais le profil n'a pas été mis à jour
        }

        return json({
            success: true,
            user: {
                id: newUser.user.id,
                email: newUser.user.email,
                role: role
            }
        });

    } catch (err) {
        console.error('Erreur serveur:', err);
        throw error(500, err.message || 'Erreur lors de la création du compte');
    }
}
