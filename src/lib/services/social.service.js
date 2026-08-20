import { supabase } from '$lib/supabase';

export const SocialService = {
    // --- LIKES ---

    async getLikes(profileId) {
        const { data, error } = await supabase
            .from('profile_likes')
            .select('liker_id')
            .eq('profile_id', profileId);
        if (error) throw error;
        return data || [];
    },

    /**
     * Bascule le like (ajoute si absent, retire si déjà présent).
     * @returns {boolean} true si désormais liké, false si retiré.
     */
    async toggleLike(profileId, likerId) {
        const { data: existing } = await supabase
            .from('profile_likes')
            .select('id')
            .eq('profile_id', profileId)
            .eq('liker_id', likerId)
            .maybeSingle();

        if (existing) {
            const { error } = await supabase.from('profile_likes').delete().eq('id', existing.id);
            if (error) throw error;
            return false;
        }

        const { error } = await supabase.from('profile_likes').insert([{ profile_id: profileId, liker_id: likerId }]);
        if (error) throw error;
        return true;
    },

    // --- COMMENTAIRES ---

    async getComments(profileId) {
        const { data, error } = await supabase
            .from('profile_comments')
            .select('*, author:author_id(full_name, avatar_url)')
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async addComment(profileId, authorId, content) {
        const trimmed = (content || '').trim();
        if (!trimmed) throw new Error('Commentaire vide');
        if (trimmed.length > 500) throw new Error('Commentaire trop long (max 500 caractères)');

        const { error } = await supabase
            .from('profile_comments')
            .insert([{ profile_id: profileId, author_id: authorId, content: trimmed }]);
        if (error) throw error;
    },

    async deleteComment(commentId) {
        const { error } = await supabase.from('profile_comments').delete().eq('id', commentId);
        if (error) throw error;
    }
};
