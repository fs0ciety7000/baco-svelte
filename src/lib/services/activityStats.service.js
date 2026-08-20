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
    },

    /**
     * Calendrier d'activité (façon GitHub) pour un utilisateur : nombre de commandes
     * Otto + Taxi par jour, sur les `months` derniers mois.
     * @returns {{counts: Object<string,number>, from: string, to: string}}
     */
    async getUserActivityCalendar(userId, fullName, months = 6) {
        const to = new Date();
        const from = new Date();
        from.setMonth(from.getMonth() - months);
        const fromStr = from.toISOString().split('T')[0];
        const toStr = to.toISOString().split('T')[0];

        const [ottoRes, taxiRes] = await Promise.all([
            supabase.from('otto_commandes').select('date_commande').eq('user_id', userId).gte('date_commande', fromStr),
            fullName
                ? supabase.from('taxi_commands').select('date_trajet').eq('redacteur', fullName).gte('date_trajet', fromStr)
                : Promise.resolve({ data: [] })
        ]);

        const counts = {};
        (ottoRes.data || []).forEach(r => {
            if (!r.date_commande) return;
            counts[r.date_commande] = (counts[r.date_commande] || 0) + 1;
        });
        (taxiRes.data || []).forEach(r => {
            if (!r.date_trajet) return;
            const day = r.date_trajet.split('T')[0];
            counts[day] = (counts[day] || 0) + 1;
        });

        return { counts, from: fromStr, to: toStr };
    },

    /**
     * Champion(s) du mois en cours : le rédacteur avec le plus de commandes (Otto + Taxi)
     * pour chacun des 3 districts, sur le mois calendaire en cours.
     */
    async getMonthlyChampionsByDistrict() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        const [profilesRes, ottoRes, taxiRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, avatar_url, district'),
            supabase.from('otto_commandes').select('user_id').gte('date_commande', monthStart),
            supabase.from('taxi_commands').select('redacteur').gte('date_trajet', monthStart)
        ]);

        const profiles = profilesRes.data || [];
        const ottoCountByUser = new Map();
        (ottoRes.data || []).forEach(r => {
            if (!r.user_id) return;
            ottoCountByUser.set(r.user_id, (ottoCountByUser.get(r.user_id) || 0) + 1);
        });
        const taxiCountByName = new Map();
        (taxiRes.data || []).forEach(r => {
            if (!r.redacteur) return;
            taxiCountByName.set(r.redacteur, (taxiCountByName.get(r.redacteur) || 0) + 1);
        });

        const ranked = profiles.map(p => {
            const total = (ottoCountByUser.get(p.id) || 0) + (taxiCountByName.get(p.full_name) || 0);
            return { id: p.id, full_name: p.full_name || 'Sans nom', avatar_url: p.avatar_url, district: p.district, total };
        }).filter(r => r.total > 0);

        const champions = {};
        for (const district of ['Sud-Ouest', 'Sud-Est', 'Centre']) {
            const inDistrict = ranked.filter(r => r.district === district).sort((a, b) => b.total - a.total);
            champions[district] = inDistrict[0] || null;
        }
        return { monthLabel: now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }), champions };
    }
};
