import { supabase } from '$lib/supabase';

export const PmrService = {
    /**
     * Charge les données PMR avec filtres optionnels
     */
    async loadPmrData({ search = "", zone = "all", etat = "all", type = "all" } = {}) {
        let query = supabase.from('pmr_data').select('*').order('gare', { ascending: true });

        if (zone !== 'all') query = query.eq('zone', zone);
        if (etat !== 'all') query = query.eq('etat_rampe', etat);
        if (type !== 'all') query = query.eq('type_assistance', type);
        
        if (search.trim()) {
            const s = search.trim();
            // Recherche multi-colonnes
            query = query.or(`gare.ilike.%${s}%,quai.ilike.%${s}%,rampe_id.ilike.%${s}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /**
     * Crée ou met à jour une entrée PMR
     */
    async savePmr(entry) {
        // Nettoyage des champs vides ou 'N/A' pour les mettre à NULL en base si nécessaire
        const payload = { ...entry };
        delete payload.id; // On retire l'ID du payload pour l'update/insert propre

        // Nettoyage spécifique
        Object.keys(payload).forEach(k => { 
            if (payload[k] === '' || payload[k] === 'N/A') payload[k] = null; 
        });

        // Valeurs par défaut si null
        if (!payload.etat_rampe) payload.etat_rampe = 'OK';

        let result;
        if (entry.id) {
            result = await supabase.from('pmr_data').update(payload).eq('id', entry.id).select();
        } else {
            result = await supabase.from('pmr_data').insert([payload]).select();
        }

        if (result.error) throw result.error;
        return result.data[0];
    },

    /**
     * Supprime une entrée
     */
    async deletePmr(id) {
        const { error } = await supabase.from('pmr_data').delete().eq('id', id);
        if (error) throw error;
    }
};