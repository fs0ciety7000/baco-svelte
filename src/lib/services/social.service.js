import { supabase } from '$lib/supabase';

export const REACTIONS = [
    { type: 'like', emoji: '👍', label: 'Jaime' },
    { type: 'love', emoji: '❤️', label: 'Adore' },
    { type: 'fire', emoji: '🔥', label: 'Feu' },
    { type: 'laugh', emoji: '😂', label: 'Rire' }
];

// Barre d'emojis "standards" pour les commentaires (pas de nouvelle table nécessaire,
// simples caractères unicode insérés tels quels dans le texte)
export const QUICK_EMOJIS = [
    '😀', '😂', '😍', '😮', '😢', '😡', '🙏', '👏',
    '👍', '👎', '❤️', '🔥', '🎉', '💯', '😴', '🤔'
];

const EMOJI_NAME_REGEX = /^[a-z0-9_-]{2,32}$/;
const MAX_EMOJI_SIZE = 100 * 1024; // 100 Ko

function emojiFor(type) {
    return REACTIONS.find(r => r.type === type)?.emoji || '👍';
}

async function notifyUser(userIdTarget, { title, message, type = 'system', link_to = null }) {
    try {
        await supabase.from('notifications').insert([{
            user_id_target: userIdTarget, title, message, type, link_to, is_read: false
        }]);
    } catch (e) {
        console.warn('Notification non envoyée', e);
    }
}

/**
 * Extrait les personnes mentionnées ("@Nom Complet") dans un texte, à partir d'une
 * liste de candidats {id, full_name}. Trie par longueur de nom décroissante pour
 * éviter qu'un nom court n'écrase le matching d'un nom plus long qui le contient.
 */
function extractMentions(text, candidates = []) {
    const sorted = [...candidates].sort((a, b) => (b.full_name?.length || 0) - (a.full_name?.length || 0));
    const found = [];
    for (const c of sorted) {
        if (!c.full_name) continue;
        if (text.includes(`@${c.full_name}`) && !found.some(f => f.id === c.id)) {
            found.push(c);
        }
    }
    return found;
}

export const SocialService = {
    REACTIONS,
    extractMentions,

    // --- ANNUAIRE (pour mentions & page Découvrir) ---
    async getAllProfiles() {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role, district')
            .order('full_name');
        if (error) throw error;
        return data || [];
    },

    // --- RÉACTIONS ---

    async getLikes(profileId) {
        const { data, error } = await supabase
            .from('profile_likes')
            .select('liker_id, reaction_type')
            .eq('profile_id', profileId);
        if (error) throw error;
        return data || [];
    },

    async getLikesCount(profileId) {
        const { count, error } = await supabase
            .from('profile_likes')
            .select('id', { count: 'exact', head: true })
            .eq('profile_id', profileId);
        if (error) throw error;
        return count || 0;
    },

    /**
     * Définit/bascule la réaction de `likerId` sur le profil `profileId`.
     * Même réaction re-cliquée -> retirée. Réaction différente -> remplacée.
     * @returns {string|null} type de réaction actif après l'opération (null si retirée)
     */
    async setReaction(profileId, likerId, reactionType, { actorName } = {}) {
        const { data: existing } = await supabase
            .from('profile_likes')
            .select('id, reaction_type')
            .eq('profile_id', profileId)
            .eq('liker_id', likerId)
            .maybeSingle();

        let active = reactionType;

        if (existing) {
            if (existing.reaction_type === reactionType) {
                const { error } = await supabase.from('profile_likes').delete().eq('id', existing.id);
                if (error) throw error;
                active = null;
            } else {
                const { error } = await supabase.from('profile_likes').update({ reaction_type: reactionType }).eq('id', existing.id);
                if (error) throw error;
            }
        } else {
            const { error } = await supabase.from('profile_likes').insert([{ profile_id: profileId, liker_id: likerId, reaction_type: reactionType }]);
            if (error) throw error;
        }

        if (active && profileId !== likerId && actorName) {
            await notifyUser(profileId, {
                title: 'Nouvelle réaction',
                message: `${actorName} a réagi ${emojiFor(active)} à votre profil.`,
                type: 'social',
                link_to: `/profil?id=${profileId}`
            });
        }

        return active;
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

    async addComment(profileId, authorId, content, { actorName, mentionCandidates = [] } = {}) {
        const trimmed = (content || '').trim();
        if (!trimmed) throw new Error('Commentaire vide');
        if (trimmed.length > 500) throw new Error('Commentaire trop long (max 500 caractères)');

        const { error } = await supabase
            .from('profile_comments')
            .insert([{ profile_id: profileId, author_id: authorId, content: trimmed }]);
        if (error) throw error;

        const excerpt = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;

        if (profileId !== authorId && actorName) {
            await notifyUser(profileId, {
                title: 'Nouveau commentaire',
                message: `${actorName} a commenté votre profil : "${excerpt}"`,
                type: 'social',
                link_to: `/profil?id=${profileId}`
            });
        }

        const mentioned = extractMentions(trimmed, mentionCandidates);
        for (const person of mentioned) {
            if (person.id === authorId || person.id === profileId) continue; // déjà notifié via le commentaire lui-même
            await notifyUser(person.id, {
                title: 'Vous avez été mentionné',
                message: `${actorName} vous a mentionné dans un commentaire : "${excerpt}"`,
                type: 'mention',
                link_to: `/profil?id=${profileId}`
            });
        }
    },

    async deleteComment(commentId) {
        const { error } = await supabase.from('profile_comments').delete().eq('id', commentId);
        if (error) throw error;
    },

    // --- EMOJIS PERSONNALISÉS ---

    async getCustomEmojis() {
        const { data, error } = await supabase
            .from('custom_emojis')
            .select('id, name, image_url, created_by')
            .order('name');
        if (error) throw error;
        return data || [];
    },

    /**
     * Upload une image comme emoji personnalisé, réutilisable ensuite via :nom:.
     * @param {File} file image (png/jpg/gif/webp, 100 Ko max)
     * @param {string} name identifiant court, lettres/chiffres/tirets uniquement
     * @param {string} userId créateur
     */
    async uploadCustomEmoji(file, name, userId) {
        const cleanName = (name || '').trim().toLowerCase().replace(/\s+/g, '-');
        if (!EMOJI_NAME_REGEX.test(cleanName)) {
            throw new Error('Nom invalide (2-32 caractères : lettres, chiffres, - ou _)');
        }
        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Fichier image requis');
        }
        if (file.size > MAX_EMOJI_SIZE) {
            throw new Error('Image trop lourde (100 Ko max)');
        }

        const ext = file.name.split('.').pop();
        const path = `emojis/${cleanName}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file);
        if (uploadError) throw uploadError;

        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);

        const { error } = await supabase
            .from('custom_emojis')
            .insert([{ name: cleanName, image_url: pub.publicUrl, created_by: userId }]);

        if (error) {
            if (error.code === '23505') throw new Error(`L'emoji ":${cleanName}:" existe déjà`);
            throw error;
        }

        return { name: cleanName, image_url: pub.publicUrl };
    },

    /**
     * Découpe un texte de commentaire en segments {type:'text'|'emoji', value}
     * en remplaçant les shortcodes :nom: connus par l'emoji personnalisé correspondant.
     */
    renderCommentParts(content, customEmojis = []) {
        const map = new Map(customEmojis.map(e => [e.name, e]));
        const regex = /:([a-z0-9_-]{2,32}):/gi;
        const parts = [];
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(content))) {
            if (match.index > lastIndex) parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
            const emoji = map.get(match[1].toLowerCase());
            if (emoji) {
                parts.push({ type: 'emoji', value: emoji });
            } else {
                parts.push({ type: 'text', value: match[0] });
            }
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < content.length) parts.push({ type: 'text', value: content.slice(lastIndex) });
        return parts;
    }
};
