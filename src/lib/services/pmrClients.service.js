import { supabase } from '$lib/supabase';

export const PmrClientsService = {
    /**
     * Charge les clients avec pagination et recherche
     */
    async loadClients({ page = 1, limit = 12, search = "" }) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('pmr_clients')
            .select('*', { count: 'exact' })
            .order('nom', { ascending: true })
            .range(from, to);

        if (search.trim()) {
            const q = search.trim();
            // Recherche large sur plusieurs champs
            query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,telephone.ilike.%${q}%,type.ilike.%${q}%`);
        }

        const { data, count, error } = await query;
        if (error) throw error;
        
        return { 
            data: data || [], 
            total: count || 0 
        };
    },

    /**
     * Ajoute ou met à jour un client
     */
    async saveClient(client) {
        const payload = { ...client };
        const id = payload.id;
        delete payload.id; // On retire l'ID du corps de la requête

        // Nettoyage des champs vides
        ['prenom', 'telephone', 'type', 'remarques'].forEach(k => {
            if (!payload[k] || typeof payload[k] === 'string' && payload[k].trim() === '') {
                payload[k] = null;
            }
        });

        let result;
        if (id) {
            result = await supabase.from('pmr_clients').update(payload).eq('id', id).select();
        } else {
            result = await supabase.from('pmr_clients').insert([payload]).select();
        }

        if (result.error) throw result.error;
        return result.data[0];
    },

    /**
     * Supprime un client
     */
    async deleteClient(id) {
        const { error } = await supabase.from('pmr_clients').delete().eq('id', id);
        if (error) throw error;
    }
};