import { supabase } from '$lib/supabase';

export const AdminService = {
    /**
     * Crée un nouvel utilisateur (via API serveur)
     */
    async createUser({ email, password, full_name, role = 'reader' }) {
        const response = await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, full_name, role })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erreur lors de la création');
        }

        return data;
    },

    /**
     * Met à jour les permissions personnalisées d'un utilisateur
     */
    async updateUserPermissions(userId, permissions) {
        const { error } = await supabase
            .from('profiles')
            .update({ permissions, updated_at: new Date().toISOString() })
            .eq('id', userId);

        if (error) throw error;
    },

    /**
     * Charge la liste des utilisateurs avec recherche et pagination
     */
    async getUsers({ page = 1, limit = 20, search = "" }) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('profiles')
            .select('*', { count: 'exact' })
            .order('updated_at', { ascending: false })
            .range(from, to);

        if (search.trim()) {
            const s = search.trim();
            query = query.or(`username.ilike.%${s}%,full_name.ilike.%${s}%,matricule.ilike.%${s}%`);
        }

        const { data, count, error } = await query;
        if (error) throw error;
        
        return { users: data || [], total: count || 0 };
    },

    /**
     * Met à jour le rôle d'un utilisateur (Admin, Modérateur, User)
     */
    async updateUserRole(userId, newRole) {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);
        
        if (error) throw error;
    },

    /**
     * Ajoute une infraction (Carton Jaune/Rouge)
     */
    async addInfraction({ userId, type, reason, durationDays = 30, createdBy }) {
        // Calcul date expiration
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        const { error } = await supabase
            .from('infractions')
            .insert([{
                user_id: userId,
                card_type: type, // 'yellow' | 'red'
                reason: reason,
                created_by: createdBy,
                expires_at: expiresAt,
                is_active: true
            }]);

        if (error) throw error;
    },

    /**
     * Supprime (révoque) une infraction
     */
    async revokeInfraction(infractionId) {
        const { error } = await supabase
            .from('infractions')
            .update({ is_active: false })
            .eq('id', infractionId);

        if (error) throw error;
    },

    /**
     * Récupère les logs récents du système (Audit)
     */
    async getSystemLogs(limit = 50) {
        // Suppose une table 'action_logs' ou similaire
        const { data, error } = await supabase
            .from('action_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.warn("Table action_logs introuvable ou erreur:", error);
            return [];
        }
        return data;
    },

    /**
     * Récupère l'état du mode maintenance
     */
    async getMaintenanceMode() {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'maintenance_mode')
            .single();

        if (error) {
            // Si la table n'existe pas ou pas de ligne, retourner false
            return false;
        }

        return data?.value === 'true' || data?.value === true;
    },

    /**
     * Active ou désactive le mode maintenance
     */
    async setMaintenanceMode(enabled) {
        const { error } = await supabase
            .from('app_settings')
            .upsert({
                key: 'maintenance_mode',
                value: enabled ? 'true' : 'false',
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        if (error) throw error;
    }
};