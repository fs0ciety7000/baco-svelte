import { supabase } from '$lib/supabase';

export const ProfileService = {
    /**
     * Charge le profil complet de l'utilisateur
     */
    async getProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error; // Ignorer erreur "introuvable" si nouveau user
        return data || {};
    },

    /**
     * Met à jour les infos textuelles
     */
    async updateProfile(userId, updates) {
        const { error } = await supabase
            .from('profiles')
            .upsert({ id: userId, ...updates, updated_at: new Date() });

        if (error) throw error;
    },

    /**
     * Upload l'avatar et retourne l'URL publique
     */
    async uploadAvatar(userId, file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        // 1. Upload
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get URL
        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        return data.publicUrl;
    },

    /**
     * Déconnexion
     */
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
};