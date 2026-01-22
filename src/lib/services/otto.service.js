import { supabase } from '$lib/supabase';

export const OttoService = {
    /**
     * Charge toutes les commandes avec les relations nécessaires
     */
    async loadCommandes() {
        const { data, error } = await supabase
            .from('otto_commandes')
            .select(`
                *, 
                creator:user_id(full_name), 
                validator:validated_by(full_name),
                societes_bus(nom, adresse, telephone, email)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Charge la liste des sociétés de bus
     */
    async loadSocietes() {
        const { data, error } = await supabase
            .from('societes_bus')
            .select('id, nom, adresse, telephone, email')
            .order('nom');

        if (error) throw error;
        return data || [];
    },

    /**
     * Charge les chauffeurs pour une société donnée
     */
    async loadChauffeurs(societeId) {
        if (!societeId) return [];
        const { data, error } = await supabase
            .from('chauffeurs_bus')
            .select('*')
            .eq('societe_id', societeId)
            .order('nom');

        if (error) throw error;
        return data || [];
    },

    /**
     * Charge les données de référence (Lignes et Arrêts)
     * Optimisé pour retourner des Sets dédoublés
     */
    async loadReferenceData() {
        const { data } = await supabase
            .from('ligne_data')
            .select('ligne_nom, gare, ordre')
            .not('gare', 'is', null)
            .order('ligne_nom');

        if (!data) return { lines: [], stops: [], raw: [] };

        // On crée un Set pour dédoubler, puis on trie avec localeCompare en mode numérique
        // Cela permet de trier correctement "L.90" avant "L.100" par exemple.
        const lines = [...new Set(data.map(l => l.ligne_nom))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));


        return {
            lines,
            stops: [...new Set(data.map(d => d.gare))].sort(),
            raw: data // Gardé pour le calcul de l'ordre des arrêts
        };
    },

    /**
     * Sauvegarde (Insert ou Update) une commande
     */
    async saveCommande(payload, id = null) {
        let result;
        if (id) {
            result = await supabase.from('otto_commandes').update(payload).eq('id', id).select();
        } else {
            result = await supabase.from('otto_commandes').insert([payload]).select();
        }

        if (result.error) throw result.error;
        return result.data;
    },

    /**
     * Supprime une commande
     */
    async deleteCommande(id) {
        const { error } = await supabase
            .from('otto_commandes')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};