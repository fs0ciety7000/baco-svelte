/**
 * Fonctions utilitaires pour le module Déplacements PMR
 */

import { PRESET_STATIONS_FMS, PRESET_STATIONS_FTY, ROLES_KEYWORDS } from './deplacements.constants.js';

/**
 * Détecte la zone d'une gare (FMS ou FTY)
 * @param {string} stationName - Nom de la gare
 * @returns {string} 'FMS' ou 'FTY'
 */
export function detectZone(stationName) {
    const s = stationName?.toUpperCase() || '';
    if (PRESET_STATIONS_FTY.includes(s) && !PRESET_STATIONS_FMS.includes(s)) {
        return 'FTY';
    }
    return 'FMS';
}

/**
 * Met en gras les rôles dans le texte (pour HTML)
 * @param {string} text - Texte à formater
 * @returns {string} Texte HTML avec rôles en gras
 */
export function highlightRoles(text) {
    if (!text) return "";
    const regex = new RegExp(`\\b(${ROLES_KEYWORDS.join('|')})\\b`, 'gi');
    return text.replace(regex, '<b>$1</b>');
}

/**
 * Récupère les gares avec interventions pour une zone et période donnée
 * @param {Array} interventions - Liste des interventions
 * @param {string} zone - Zone (FMS ou FTY)
 * @param {string} period - Période (morning ou afternoon)
 * @returns {Array<string>} Liste triée des codes de gares
 */
export function getStationsWithInterventions(interventions, zone, period) {
    const stationsWithData = new Set();
    interventions
        .filter(i => i.zone === zone && i.station.trim() !== '')
        .forEach(i => stationsWithData.add(i.station));
    return Array.from(stationsWithData).sort();
}

/**
 * Génère le texte des interventions pour une gare
 * @param {Array} interventions - Liste des interventions
 * @param {string} stationCode - Code de la gare
 * @param {string|null} zoneFilter - Filtre par zone (optionnel)
 * @param {boolean} forHtml - Si true, formate pour HTML
 * @returns {string} Texte formaté des interventions
 */
export function getStationText(interventions, stationCode, zoneFilter = null, forHtml = false) {
    const matches = interventions.filter(i =>
        i.station === stationCode &&
        (zoneFilter ? i.zone === zoneFilter : true)
    );

    if (matches.length === 0) return "///";

    return matches.map(m => {
        const details = m.pmr_details || "";
        const assignee = m.assigned_to ? `(${m.assigned_to})` : "";
        let fullText = `${details} ${assignee}`.trim();
        if (forHtml) {
            fullText = highlightRoles(fullText);
        }
        return fullText;
    }).join(forHtml ? '<br/>' : '\n');
}

/**
 * Formate une date pour l'affichage
 * @param {string} dateStr - Date au format ISO
 * @returns {Object} Objet avec différents formats
 */
export function formatDate(dateStr) {
    const d = new Date(dateStr);
    return {
        display: d.toLocaleDateString('fr-BE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }),
        subject: `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`,
        filename: `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
    };
}

/**
 * Convertit une image URL en base64
 * @param {string} url - URL de l'image
 * @returns {Promise<string>} Image en base64
 */
export async function getBase64ImageFromURL(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute("crossOrigin", "anonymous");
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = url;
    });
}

/**
 * Valide les données d'une intervention
 * @param {Object} intervention - Intervention à valider
 * @returns {boolean} True si valide
 */
export function isValidIntervention(intervention) {
    if (!intervention) return false;
    if (!intervention.station) return false;
    if (typeof intervention.station !== 'string') return false;
    return intervention.station.trim() !== '';
}

/**
 * Filtre les interventions valides
 * @param {Array} interventions - Liste des interventions
 * @returns {Array} Interventions valides
 */
export function filterValidInterventions(interventions) {
    return interventions.filter(isValidIntervention);
}
