import { supabase } from '$lib/supabase';

export const StatsService = {
    /**
     * Charge et calcule toutes les statistiques
     */
    async getGlobalStats() {
        // 1. Récupération parallèle
        const [ottoRes, taxiRes] = await Promise.all([
            supabase.from('otto_commandes').select(`
                id, date_commande, origine, destination, 
                societes_bus(nom), 
                creator:user_id(full_name)
            `),
            supabase.from('taxi_commands').select(`
                id, date_trajet, gare_origine, gare_arrivee, 
                taxi_nom, 
                redacteur
            `)
        ]);

        if (ottoRes.error) console.error("Erreur Otto", ottoRes.error);
        if (taxiRes.error) console.error("Erreur Taxi", taxiRes.error);

        // 2. Normalisation
        const ottos = (ottoRes.data || []).map(o => ({
            type: 'bus',
            societe: o.societes_bus?.nom || 'Inconnue',
            origine: o.origine,
            destination: o.destination,
            createur: o.creator?.full_name || 'Inconnu'
        }));

        const taxis = (taxiRes.data || []).map(t => ({
            type: 'taxi',
            societe: t.taxi_nom || 'Inconnue',
            origine: t.gare_origine,
            destination: t.gare_arrivee,
            createur: t.redacteur || 'Inconnu'
        }));

        const allItems = [...ottos, ...taxis];

        // 3. Calculs
        return {
            global: {
                total: allItems.length,
                otto: ottos.length,
                taxi: taxis.length
            },
            topSocieties: this._getTopRanking(allItems, 'societe', 5),
            topRoutes: this._getTopRoutes(allItems, 8),
            topCreators: this._getTopRanking(allItems, 'createur', 5)
        };
    },

    // --- Helpers de calcul ---

    _getTopRanking(items, key, limit) {
        const map = {};
        items.forEach(item => {
            const val = item[key];
            if (!val) return;
            if (!map[val]) map[val] = { name: val, count: 0, type: item.type };
            map[val].count++;
        });
        return Object.values(map)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    },

    _getTopRoutes(items, limit) {
        const map = {};
        items.forEach(item => {
            if (!item.origine || !item.destination) return;
            const routeKey = `${item.origine} → ${item.destination}`;
            const displayKey = `${item.origine}|${item.destination}`; // Séparateur pour split facile
            
            if (!map[routeKey]) map[routeKey] = { name: displayKey, count: 0, type: item.type };
            map[routeKey].count++;
        });
        return Object.values(map)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
};