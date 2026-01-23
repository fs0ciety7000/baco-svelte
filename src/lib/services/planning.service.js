import { supabase } from '$lib/supabase';

export const PlanningService = {
    // --- LECTURE ---
    
    async loadProfiles() {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        return data || [];
    },

    async loadLeaves() {
        const { data, error } = await supabase
            .from('leave_requests')
            .select(`id, user_id, start_date, end_date, type, status, reason, profiles(full_name)`)
            .order('start_date', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async loadPlanning() {
        // Idéalement, filtrer par date (ex: année courante) pour la performance future
        const { data, error } = await supabase.from('planning').select('*');
        if (error) throw error;
        return data || [];
    },

    // --- ÉCRITURE (PLANNING) ---

    async upsertShift(payload) {
        // Upsert basé sur la contrainte unique (user_id, date, shift)
        const { data, error } = await supabase
            .from('planning')
            .upsert(payload, { onConflict: 'user_id, date, shift' })
            .select();
        if (error) throw error;
        return data;
    },

    async deleteShift(userId, dateKey, shift) {
        const { error } = await supabase
            .from('planning')
            .delete()
            .match({ user_id: userId, date: dateKey, shift: shift });
        if (error) throw error;
    },

    // --- ÉCRITURE (CONGÉS) ---

    async saveLeave(payload, id = null) {
        let result;
        // Nettoyage des champs de jointure éventuels
        const { profiles, ...cleanPayload } = payload;

        if (id) {
            // Update
            const { id: _id, ...updateData } = cleanPayload; // On exclut l'ID du payload
            result = await supabase.from('leave_requests').update(updateData).eq('id', id).select();
        } else {
            // Insert
            result = await supabase.from('leave_requests').insert([cleanPayload]).select();
        }
        
        if (result.error) throw result.error;
        return result.data;
    },

    async deleteLeave(id) {
        const { error } = await supabase.from('leave_requests').delete().eq('id', id);
        if (error) throw error;
    },

    async updateLeaveStatus(id, status) {
        const { error } = await supabase
            .from('leave_requests')
            .update({ status })
            .eq('id', id);
        if (error) throw error;
    }
};