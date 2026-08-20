import { supabase } from '$lib/supabase';

export const ActivityStatsService = {
    /**
     * Compte les commandes Otto (par user_id) et Taxi (par nom de rédacteur, seul lien
     * disponible : taxi_commands n'a pas de colonne user_id) pour un utilisateur donné.
     */
    async getUserStats(userId, fullName) {
        const [ottoRes, taxiRes] = await Promise.all([
            supabase.from('otto_commandes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
            fullName
                ? supabase.from('taxi_commands').select('id', { count: 'exact', head: true }).eq('redacteur', fullName)
                : Promise.resolve({ count: 0 })
        ]);

        const ottoCount = ottoRes.count || 0;
        const taxiCount = taxiRes.count || 0;
        return { ottoCount, taxiCount, total: ottoCount + taxiCount };
    },

    /**
     * Charge le classement global : tous les profils, avec leur nombre de commandes
     * Otto + Taxi, trié par total décroissant.
     */
    async getLeaderboard() {
        const [profilesRes, ottoRes, taxiRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, avatar_url, role, district'),
            supabase.from('otto_commandes').select('user_id'),
            supabase.from('taxi_commands').select('redacteur')
        ]);

        const profiles = profilesRes.data || [];
        const ottoRows = ottoRes.data || [];
        const taxiRows = taxiRes.data || [];

        const ottoCountByUser = new Map();
        ottoRows.forEach(r => {
            if (!r.user_id) return;
            ottoCountByUser.set(r.user_id, (ottoCountByUser.get(r.user_id) || 0) + 1);
        });

        const taxiCountByName = new Map();
        taxiRows.forEach(r => {
            if (!r.redacteur) return;
            taxiCountByName.set(r.redacteur, (taxiCountByName.get(r.redacteur) || 0) + 1);
        });

        const ranked = profiles.map(p => {
            const ottoCount = ottoCountByUser.get(p.id) || 0;
            const taxiCount = taxiCountByName.get(p.full_name) || 0;
            return {
                id: p.id,
                full_name: p.full_name || 'Sans nom',
                avatar_url: p.avatar_url,
                role: p.role,
                district: p.district,
                ottoCount,
                taxiCount,
                total: ottoCount + taxiCount
            };
        });

        return ranked
            .filter(r => r.total > 0)
            .sort((a, b) => b.total - a.total);
    }
};
