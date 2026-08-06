import { supabase } from '$lib/supabase';

export const LignesAdminService = {
    /**
     * Charge tous les arrêts, triés par ligne puis par ordre
     */
    async loadAll() {
        const { data, error } = await supabase
            .from('ligne_data')
            .select('id, ligne_nom, gare, ordre, district')
            .order('ligne_nom', { ascending: true })
            .order('ordre', { ascending: true, nullsFirst: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Crée un nouvel arrêt (utilisé aussi pour créer une nouvelle ligne via son 1er arrêt)
     */
    async createStop({ ligne_nom, gare, district, ordre }) {
        const { data, error } = await supabase
            .from('ligne_data')
            .insert([{ ligne_nom, gare, district, ordre }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Met à jour un arrêt (nom de gare, district...) par id
     */
    async updateStop(id, payload) {
        const { error } = await supabase
            .from('ligne_data')
            .update(payload)
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Supprime un arrêt par id
     */
    async deleteStop(id) {
        const { error } = await supabase
            .from('ligne_data')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Supprime une ligne entière (tous ses arrêts)
     */
    async deleteLine(ligne_nom) {
        const { error } = await supabase
            .from('ligne_data')
            .delete()
            .eq('ligne_nom', ligne_nom);

        if (error) throw error;
    },

    /**
     * Renomme une ligne (impacte toutes ses lignes/arrêts)
     */
    async renameLine(oldName, newName) {
        const { error } = await supabase
            .from('ligne_data')
            .update({ ligne_nom: newName })
            .eq('ligne_nom', oldName);

        if (error) throw error;
    },

    /**
     * Met à jour le district de toute une ligne
     */
    async updateDistrict(ligne_nom, district) {
        const { error } = await supabase
            .from('ligne_data')
            .update({ district })
            .eq('ligne_nom', ligne_nom);

        if (error) throw error;
    },

    /**
     * Réordonne les arrêts d'une ligne (drag & drop) — écrit un ordre séquentiel 1..N
     */
    async reorderStops(orderedRows) {
        const updates = orderedRows.map((row, idx) =>
            supabase.from('ligne_data').update({ ordre: idx + 1 }).eq('id', row.id)
        );
        const results = await Promise.all(updates);
        const failed = results.find(r => r.error);
        if (failed) throw failed.error;
    }
};
