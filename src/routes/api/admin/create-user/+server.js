// src/routes/api/admin/create-user/+server.js
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export async function POST({ request, locals }) {
    // 1. Vérifier que l'utilisateur est admin
    const { data: { user } } = await locals.supabase.auth.getUser();
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
    const { email, password, full_name, role = 'reader', district = 'Sud-Ouest' } = await request.json();

    if (!email || !password) {
        throw error(400, 'Email et mot de passe requis');
    }

    if (password.length < 8) {
        throw error(400, 'Le mot de passe doit contenir au moins 8 caractères');
    }

    // Validation du rôle
    const validRoles = ['reader', 'user', 'moderator', 'admin', 'otto_agent'];
    if (!validRoles.includes(role)) {
        throw error(400, 'Rôle invalide');
    }

    // Validation du district
    const validDistricts = ['Sud-Ouest', 'Sud-Est', 'Centre'];
    if (!validDistricts.includes(district)) {
        throw error(400, 'District invalide');
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

        // 5. Mettre à jour (ou créer si le trigger auto n'a pas encore fait son travail) le profil
        //    avec le rôle, le nom et le district
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: newUser.user.id,
                role: role,
                full_name: full_name || '',
                district: district,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (updateError) {
            console.error('Erreur mise à jour profil:', updateError);
            // L'utilisateur est créé mais le profil n'a pas été mis à jour
        }

        return json({
            success: true,
            user: {
                id: newUser.user.id,
                email: newUser.user.email,
                role: role,
                district: district
            }
        });

    } catch (err) {
        console.error('Erreur serveur:', err);
        throw error(500, err.message || 'Erreur lors de la création du compte');
    }
}
