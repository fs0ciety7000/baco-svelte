import { supabase } from '$lib/supabase';

export const JournalService = {
    /**
     * Charge les logs avec pagination et filtres
     */
    async loadLogs({ page = 0, limit = 15, search = "", author = "all", date = "", currentUserId }) {
        const from = page * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('main_courante')
            .select(`*, profiles(full_name, avatar_url), log_reactions(user_id, emoji)`)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (search) query = query.ilike('message_content', `%${search}%`);
        if (author !== 'all') query = query.eq('user_id', author);
        if (date) {
            query = query.gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Traitement des réactions pour l'UI
        return data.map(log => {
            const reactionsMap = { '👍': 0, '👀': 0, '⚠️': 0 };
            let myReaction = null;
            
            if (log.log_reactions) {
                log.log_reactions.forEach(r => {
                    if (reactionsMap[r.emoji] !== undefined) reactionsMap[r.emoji]++;
                    if (r.user_id === currentUserId) myReaction = r.emoji;
                });
            }
            return { ...log, reactionsMap, myReaction };
        });
    },

    /**
     * Crée une nouvelle entrée
     */
    async createLog({ content, isUrgent, userId, file }) {
        let attachmentPath = null;
        let attachmentType = null;

        if (file) {
            const ext = file.name.split('.').pop();
            const fileName = `journal/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
            const { error: upError } = await supabase.storage.from('documents').upload(fileName, file);
            if (upError) throw upError;
            
            attachmentPath = fileName;
            attachmentType = file.type.startsWith('image/') ? 'image' : 'file';
        }

        const { error } = await supabase.from('main_courante').insert({
            message_content: content,
            is_urgent: isUrgent,
            user_id: userId,
            attachment_path: attachmentPath,
            attachment_type: attachmentType
        });

        if (error) throw error;
    },

    /**
     * Met à jour une entrée
     */
    async updateLog(id, content, isUrgent) {
        const { error } = await supabase
            .from('main_courante')
            .update({ 
                message_content: content, 
                is_urgent: isUrgent, 
                updated_at: new Date() 
            })
            .eq('id', id);
        
        if (error) throw error;
    },

    /**
     * Supprime une entrée
     */
    async deleteLog(id) {
        const { error } = await supabase.from('main_courante').delete().eq('id', id);
        if (error) throw error;
    },

    /**
     * Gère les réactions (Toggle)
     */
    async toggleReaction(logId, userId, emoji, currentReaction) {
        if (currentReaction === emoji) {
            await supabase.from('log_reactions').delete().match({ log_id: logId, user_id: userId });
        } else {
            await supabase.from('log_reactions').upsert(
                { log_id: logId, user_id: userId, emoji }, 
                { onConflict: 'log_id, user_id' }
            );
        }
    },

    /**
     * Récupère l'URL publique d'un fichier
     */
    getPublicUrl(path) {
        if (!path) return '';
        const { data } = supabase.storage.from('documents').getPublicUrl(path);
        return data.publicUrl;
    }
};