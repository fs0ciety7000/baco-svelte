import { supabase } from '$lib/supabase';

export const TaxiService = {
    // --- RÉPERTOIRE ---
    async getAllTaxis() {
        const { data, error } = await supabase.from('taxis').select('*').order('nom');
        if (error) throw error;
        return (data || []).map(t => ({
            ...t,
            societe: t.nom,
            lieux: t.lieux || [],
            contacts: t.contacts || [],
            mail: t.mail || [],
            adresse: t.adresse || [],
            remarques: t.remarques || []
        }));
    },

    async getLieux() {
        const { data, error } = await supabase.from('taxis').select('lieux');
        if (error) throw error;
        const allLieux = (data || []).flatMap(row => row.lieux || []);
        return [...new Set(allLieux)].filter(l => l && l !== 'nihil' && l.trim() !== '').sort();
    },

    async saveTaxi(taxi) {
        const payload = {
            nom: taxi.societe,
            lieux: taxi.lieux,
            contacts: taxi.contacts,
            mail: taxi.mail,
            adresse: taxi.adresse,
            remarques: taxi.remarques
        };

        let result;
        if (taxi.id) {
            result = await supabase.from('taxis').update(payload).eq('id', taxi.id).select();
        } else {
            result = await supabase.from('taxis').insert([payload]).select();
        }
        if (result.error) throw result.error;
        return result.data;
    },

    async deleteTaxi(id) {
        const { error } = await supabase.from('taxis').delete().eq('id', id);
        if (error) throw error;
    },

    // --- COMMANDES ---
    
    async loadCommandesHistory() {
        const { data, error } = await supabase
            .from('taxi_commands')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data || [];
    },

    async saveCommande(payload) {
        // CORRECTION ICI : On retire 'pmr_search' et 'id' du payload envoyé
        const { id, pmr_search, ...data } = payload;
        
        // Formatage dates pour Supabase
        if (data.date_trajet) data.date_trajet = new Date(data.date_trajet).toISOString();
        
        if (data.date_retour) {
            data.date_retour = new Date(data.date_retour).toISOString();
        } else {
            data.date_retour = null;
        }

        // Nettoyage si on passe de PMR à Standard ou inversement
        if (!data.is_pmr) {
            data.pmr_nom = null;
            data.pmr_type = null;
            data.pmr_dossier = null;
            data.pmr_prenom = null;
            data.pmr_tel = null;
            data.pmr_motif = null;
        } else {
            data.passager_nom = null;
            data.relation_number = null;
        }

        let result;
        if (id) {
            result = await supabase.from('taxi_commands').update(data).eq('id', id).select();
        } else {
            result = await supabase.from('taxi_commands').insert([data]).select();
        }
        
        if (result.error) throw result.error;
        return result.data[0];
    },

    async deleteCommande(id) {
        const { error } = await supabase.from('taxi_commands').delete().eq('id', id);
        if (error) throw error;
    },

    // --- REFERENTIELS ---

    async loadPmrClients() {
        const { data } = await supabase.from('pmr_clients').select('*').order('nom');
        return data || [];
    },

    async loadStations() {
        const { data } = await supabase.from('ligne_data').select('gare').not('gare', 'is', null).order('gare');
        if (!data) return [];
        return [...new Set(data.map(d => d.gare))].sort();
    }
};