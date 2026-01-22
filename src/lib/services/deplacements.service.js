/**
 * Service pour gérer les déplacements PMR avec Supabase
 */

import { supabase } from '$lib/supabase';
import { DEFAULT_PRESENCE, PERIODS } from '$lib/utils/deplacements.constants.js';

/**
 * Charge la liste des gares depuis la base
 * @returns {Promise<Array>} Liste des gares
 */
export async function loadStations() {
    try {
        const { data, error } = await supabase
            .from('ptcar_abbreviations')
            .select('abbreviation, zone_name');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur lors du chargement des gares:', error);
        return [];
    }
}

/**
 * Charge un rapport journalier par date
 * @param {string} date - Date au format ISO (YYYY-MM-DD)
 * @returns {Promise<Object>} Rapport avec présences et interventions
 */
export async function loadDailyReport(date) {
    try {
        // Charger le rapport principal
        const { data: report, error: reportError } = await supabase
            .from('daily_movements')
            .select('*')
            .eq('date', date)
            .single();

        if (reportError && reportError.code !== 'PGRST116') { // PGRST116 = not found
            throw reportError;
        }

        if (!report) {
            // Pas de rapport pour cette date
            return {
                presenceMons: { ...DEFAULT_PRESENCE },
                presenceTournai: { ...DEFAULT_PRESENCE },
                presenceMonsAM: { ...DEFAULT_PRESENCE },
                presenceTournaiAM: { ...DEFAULT_PRESENCE },
                interventions: [],
                interventionsAM: []
            };
        }

        // Charger les interventions
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
        console.error('Erreur lors du chargement du rapport:', error);
        throw error;
    }
}

/**
 * Sauvegarde un rapport journalier
 * @param {Object} data - Données du rapport
 * @param {string} data.date - Date au format ISO
 * @param {Object} data.presenceMons - Présence Mons matin
 * @param {Object} data.presenceTournai - Présence Tournai matin
 * @param {Object} data.presenceMonsAM - Présence Mons après-midi
 * @param {Object} data.presenceTournaiAM - Présence Tournai après-midi
 * @param {Array} data.interventions - Interventions matin
 * @param {Array} data.interventionsAM - Interventions après-midi
 * @returns {Promise<void>}
 */
export async function saveDailyReport({
    date,
    presenceMons,
    presenceTournai,
    presenceMonsAM,
    presenceTournaiAM,
    interventions,
    interventionsAM
}) {
    try {
        // Upsert du rapport principal
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

        // Supprimer les anciennes interventions
        const { error: deleteError } = await supabase
            .from('movement_interventions')
            .delete()
            .eq('movement_id', report.id);

        if (deleteError) throw deleteError;

        // Préparer les nouvelles interventions
        const validLinesMorning = interventions
            .filter(i => i.station.trim() !== '')
            .map(i => ({ ...i, movement_id: report.id, period: PERIODS.MORNING }));

        const validLinesAfternoon = interventionsAM
            .filter(i => i.station.trim() !== '')
            .map(i => ({ ...i, movement_id: report.id, period: PERIODS.AFTERNOON }));

        const allValidLines = [...validLinesMorning, ...validLinesAfternoon];

        // Insérer les nouvelles interventions
        if (allValidLines.length > 0) {
            const { error: insertError } = await supabase
                .from('movement_interventions')
                .insert(allValidLines);

            if (insertError) throw insertError;
        }

        return { success: true };
    } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        throw error;
    }
}

/**
 * Supprime un rapport journalier
 * @param {string} date - Date au format ISO
 * @returns {Promise<void>}
 */
export async function deleteDailyReport(date) {
    try {
        const { error } = await supabase
            .from('daily_movements')
            .delete()
            .eq('date', date);

        if (error) throw error;
    } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        throw error;
    }
}

/**
 * Liste tous les rapports
 * @param {Object} options - Options de filtre
 * @param {number} options.limit - Limite de résultats
 * @param {number} options.offset - Offset pour pagination
 * @returns {Promise<Array>} Liste des rapports
 */
export async function listDailyReports({ limit = 50, offset = 0 } = {}) {
    try {
        const { data, error } = await supabase
            .from('daily_movements')
            .select('*')
            .order('date', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erreur lors du chargement des rapports:', error);
        return [];
    }
}
