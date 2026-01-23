import { supabase } from '$lib/supabase';

export const ProfileService = {
    // --- LECTURE ---

    async getProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || {};
    },

    async getInfractions(userId) {
        const { data, error } = await supabase
            .from('infractions')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            // Filtre : Rouge OU (Jaune non expiré)
            .or('card_type.eq.red, and(card_type.eq.yellow,expires_at.gt.now())')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        return data || [];
    },

    async getAdminUserEmail(userId) {
        // Nécessite une fonction RPC 'admin_get_user_email' dans Supabase
        // Si elle n'existe pas, on retourne null sans planter
        try {
            const { data, error } = await supabase.rpc('admin_get_user_email', { p_user_id: userId });
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn("RPC admin_get_user_email manquant ou erreur", e);
            return null;
        }
    },

    // --- ECRITURE ---

    async updateProfile(userId, updates) {
        const { error } = await supabase
            .from('profiles')
            .update({ ...updates, updated_at: new Date() })
            .eq('id', userId);
        if (error) throw error;
    },

    async updateTheme(userId, themeKey) {
        // 1. Update User Preferences
        const { error: prefError } = await supabase
            .from('user_preferences')
            .upsert({ user_id: userId, theme: themeKey, updated_at: new Date() }, { onConflict: 'user_id' });
        if (prefError) throw prefError;

        // 2. Update Profile (Backup)
        await supabase.from('profiles').update({ theme: themeKey }).eq('id', userId);
    },

    async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
    },

    async uploadAvatar(userId, file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Math.random()}.${fileExt}`; // Dossier par UserID

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        return data.publicUrl;
    },

    async signOut() {
        await supabase.auth.signOut();
    }
};