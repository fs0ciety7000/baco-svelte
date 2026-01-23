import { supabase } from '$lib/supabase';
import { DEFAULT_PRESENCE, PERIODS } from '$lib/utils/deplacements.constants.js';

// Petit cache pour éviter de recharger les gares à chaque navigation
let stationsCache = null;

export const DeplacementsService = {
    /**
     * Charge la liste des gares (avec cache simple)
     */
    async loadStations() {
        if (stationsCache) return stationsCache;

        try {
            const { data, error } = await supabase
                .from('ptcar_abbreviations')
                .select('abbreviation, zone_name')
                .order('abbreviation');

            if (error) throw error;
            stationsCache = data || [];
            return stationsCache;
        } catch (error) {
            console.error('Service Deplacements: Erreur gares', error);
            return [];
        }
    },

    /**
     * Charge un rapport journalier complet
     */
    async loadDailyReport(date) {
        try {
            // 1. Récupération du rapport global
            const { data: report, error: reportError } = await supabase
                .from('daily_movements')
                .select('*')
                .eq('date', date)
                .maybeSingle(); // 'maybeSingle' évite l'erreur si non trouvé

            if (reportError) throw reportError;

            // Si pas de rapport, on renvoie les valeurs par défaut
            if (!report) {
                return {
                    presenceMons: { ...DEFAULT_PRESENCE },
                    presenceTournai: { ...DEFAULT_PRESENCE },
                    presenceMonsAM: { ...DEFAULT_PRESENCE },
                    presenceTournaiAM: { ...DEFAULT_PRESENCE },
                    interventions: [],
                    interventionsAM: []
                };
            }

            // 2. Récupération des interventions liées
            const { data: lines, error: linesError } = await supabase
                .from('movement_interventions')
                .select('*')
                .eq('movement_id', report.id)
                .order('created_at', { ascending: true });

            if (linesError) throw linesError;

            return {
                presenceMons: report.presence_mons || { ...DEFAULT_PRESENCE },
                presenceTournai: report.presence_tournai || { ...DEFAULT_PRESENCE },
                presenceMonsAM: report.presence_mons_am || { ...DEFAULT_PRESENCE },
                presenceTournaiAM: report.presence_tournai_am || { ...DEFAULT_PRESENCE },
                interventions: lines?.filter(l => l.period === PERIODS.MORNING || !l.period) || [],
                interventionsAM: lines?.filter(l => l.period === PERIODS.AFTERNOON) || []
            };
        } catch (error) {
            console.error('Service Deplacements: Erreur rapport', error);
            throw error;
        }
    },

    /**
     * Sauvegarde (Upsert) le rapport et ses interventions
     */
    async saveDailyReport(payload) {
        const { date, presenceMons, presenceTournai, presenceMonsAM, presenceTournaiAM, interventions, interventionsAM } = payload;
        
        try {
            // A. Upsert du Parent (Daily Movement)
            const { data: report, error: reportError } = await supabase
                .from('daily_movements')
                .upsert({
                    date,
                    presence_mons: presenceMons,
                    presence_tournai: presenceTournai,
                    presence_mons_am: presenceMonsAM,
                    presence_tournai_am: presenceTournaiAM
                }, { onConflict: 'date' })
                .select()
                .single();

            if (reportError) throw reportError;

            // B. Gestion des Interventions (Delete All + Insert All pour cette date)
            const { error: deleteError } = await supabase
                .from('movement_interventions')
                .delete()
                .eq('movement_id', report.id);

            if (deleteError) throw deleteError;

            // Préparation des lignes valides
            const cleanLine = (line, period) => ({
                movement_id: report.id,
                period,
                station: line.station?.toUpperCase() || '',
                pmr_details: line.pmr_details || '',
                assigned_to: line.assigned_to || '',
                zone: line.zone || 'FMS'
            });

            const linesToInsert = [
                ...interventions.filter(i => i.station).map(i => cleanLine(i, PERIODS.MORNING)),
                ...interventionsAM.filter(i => i.station).map(i => cleanLine(i, PERIODS.AFTERNOON))
            ];

            if (linesToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('movement_interventions')
                    .insert(linesToInsert);
                if (insertError) throw insertError;
            }

            return { success: true };
        } catch (error) {
            console.error('Service Deplacements: Erreur sauvegarde', error);
            throw error;
        }
    }
};