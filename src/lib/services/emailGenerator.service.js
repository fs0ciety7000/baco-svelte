/**
 * Service de génération d'email pour les déplacements PMR
 * Génère un HTML optimisé pour Outlook avec un design moderne
 */

import { COLORS, EMAIL_CONFIG } from '$lib/utils/deplacements.constants.js';
import {
    formatDate,
    getStationsWithInterventions,
    getStationText,
    highlightRoles
} from '$lib/utils/deplacements.helpers.js';

/**
 * Génère les badges HTML pour les statistiques de présence
 * @param {Object} presenceData - Données de présence (spi, opi, cpi, pa, shift_10_18)
 * @returns {string} HTML des badges
 */
function formatStatsHtml(presenceData) {
    const entries = Object.entries(presenceData);
    const badgeRows = entries.map(([key, value]) => {
        const valColor = value === 0 ? COLORS.zeroRed : '#000000';
        const label = key.replace('shift_', '').toUpperCase();

        return `
            <td align="center" style="padding: 0 6px;">
                <table cellpadding="0" cellspacing="0" border="0" style="background: #e9ecef; border-radius: 4px;">
                    <tr>
                        <td style="padding: 8px 16px; text-align: center;">
                            <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: 600; color: #666; margin-bottom: 4px;">${label}</div>
                            <div style="font-family: Arial, sans-serif; font-size: 18px; font-weight: 700; color: ${valColor};">${value}</div>
                        </td>
                    </tr>
                </table>
            </td>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 10px 0;">
            <tr>${badgeRows}</tr>
        </table>
    `;
}

/**
 * Génère le tableau HTML des interventions pour une zone
 * @param {Array} interventions - Liste des interventions
 * @param {string} zone - Zone (FMS ou FTY)
 * @param {string} period - Période (morning ou afternoon)
 * @param {string} color - Couleur de la zone
 * @returns {string} HTML du tableau
 */
function generateInterventionsTable(interventions, zone, period, color) {
    const stations = getStationsWithInterventions(interventions, zone, period);

    if (stations.length === 0) {
        return `
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin: 15px 0; border: 1px solid #ddd;">
                <thead>
                    <tr style="background: ${color};">
                        <th style="padding: 10px; text-align: left; color: white; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; width: 120px;">Gare</th>
                        <th style="padding: 10px; text-align: left; color: white; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase;">Interventions (${zone})</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="2" style="padding: 20px; text-align: center; font-style: italic; color: #999; font-size: 13px; background: white; font-family: Arial, sans-serif;">
                            Aucune intervention prévue
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    const rows = stations.map((station, index) => {
        const bgColor = index % 2 === 0 ? 'white' : '#f8f8f8';
        const stationText = getStationText(interventions, station, zone, true);

        return `
            <tr style="background-color: ${bgColor};">
                <td style="padding: 8px 10px; font-family: Arial, sans-serif; font-weight: 700; color: ${color}; font-size: 13px; border-bottom: 1px solid #ddd;">
                    ${station}
                </td>
                <td style="padding: 8px 10px; font-family: Arial, sans-serif; color: #333; font-size: 12px; border-bottom: 1px solid #ddd;">
                    ${stationText}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin: 15px 0; border: 1px solid #ddd;">
            <thead>
                <tr style="background: ${color};">
                    <th style="padding: 10px; text-align: left; color: white; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; width: 120px;">Gare</th>
                    <th style="padding: 10px; text-align: left; color: white; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase;">Interventions (${zone})</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

/**
 * Génère le HTML complet de l'email
 * @param {Object} data - Données du rapport
 * @returns {string} HTML de l'email
 */
export function generateEmailHtml({
    date,
    presenceMons,
    presenceTournai,
    presenceMonsAM,
    presenceTournaiAM,
    interventions,
    interventionsAM
}) {
    const formattedDate = formatDate(date);

    const containerStyle = `font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 15px; color: #2d3748; background-color: #f7fafc; padding: 0; margin: 0; line-height: 1.6;`;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Déplacements PMR - ${formattedDate.subject}</title>
</head>
<body style="${containerStyle}">
    <div style="max-width: 480px; margin: 0 auto; background: white;">

        <!-- Header avec dégradé SNCB -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: ${COLORS.sncbHex}; padding: 20px 15px; border-bottom: 3px solid #003d7a;">
            <tr>
                <td align="center">
                    <img src="cid:logo" alt="SNCB Logo" style="max-width: 120px; margin-bottom: 10px;" />
                    <h1 style="font-family: Arial, sans-serif; font-size: 20px; font-weight: 700; color: white; margin: 0; text-transform: uppercase;">
                        DÉPLACEMENTS PMR
                    </h1>
                    <p style="font-family: Arial, sans-serif; font-size: 13px; color: white; margin: 8px 0 0 0;">
                        ${formattedDate.display}
                    </p>
                </td>
            </tr>
        </table>

        <!-- Container principal avec padding -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
                <td style="padding: 20px 15px;">

                    <!-- ========== SECTION MATIN ========== -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #c39bd3; border-radius: 4px; padding: 12px 15px; margin-bottom: 15px;">
                        <tr>
                            <td align="center">
                                <h2 style="font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; color: #6b21a8; margin: 0; text-transform: uppercase;">
                                    PRESTATION MATIN
                                </h2>
                            </td>
                        </tr>
                    </table>

                    <!-- Mons Matin -->
                    <h3 style="font-family: Arial, sans-serif; font-size: 14px; font-weight: 700; color: #000; margin: 15px 0 8px 0;">
                        Prévu dans Quinyx gare de Mons
                    </h3>
                    ${formatStatsHtml(presenceMons)}
                    ${generateInterventionsTable(interventions, 'FMS', 'morning', COLORS.monsHex)}

                    <!-- Tournai Matin -->
                    <h3 style="font-family: Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${COLORS.tournaiHex}; margin: 20px 0 8px 0;">
                        Prévu dans Quinyx gare de Tournai
                    </h3>
                    ${formatStatsHtml(presenceTournai)}
                    ${generateInterventionsTable(interventions, 'FTY', 'morning', COLORS.tournaiHex)}

                    <!-- ========== SECTION APRÈS-MIDI ========== -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f9e79f; border-radius: 4px; padding: 12px 15px; margin: 25px 0 15px 0;">
                        <tr>
                            <td align="center">
                                <h2 style="font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; color: #78350f; margin: 0; text-transform: uppercase;">
                                    PRESTATION APRÈS-MIDI
                                </h2>
                            </td>
                        </tr>
                    </table>

                    <!-- Mons Après-midi -->
                    <h3 style="font-family: Arial, sans-serif; font-size: 14px; font-weight: 700; color: #000; margin: 15px 0 8px 0;">
                        Prévu dans Quinyx gare de Mons
                    </h3>
                    ${formatStatsHtml(presenceMonsAM)}
                    ${generateInterventionsTable(interventionsAM, 'FMS', 'afternoon', COLORS.monsHex)}

                    <!-- Tournai Après-midi -->
                    <h3 style="font-family: Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${COLORS.tournaiHex}; margin: 20px 0 8px 0;">
                        Prévu dans Quinyx gare de Tournai
                    </h3>
                    ${formatStatsHtml(presenceTournaiAM)}
                    ${generateInterventionsTable(interventionsAM, 'FTY', 'afternoon', COLORS.tournaiHex)}

                    <!-- ========== FOOTER NOTES ========== -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #e3f2fd; border: 1px solid #90caf9; border-radius: 4px; padding: 12px 15px; margin-top: 25px;">
                        <tr>
                            <td>
                                <p style="font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 4px 0; line-height: 1.5;">
                                    • Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.
                                </p>
                                <p style="font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 4px 0; line-height: 1.5;">
                                    • Interventions PMR pour B-CS : Voir DICOS.
                                </p>
                                <p style="font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; color: ${COLORS.sncbHex}; margin: 8px 0 0 0;">
                                    IMPORTANT: L'App DICOS PMR reste la base à consulter
                                </p>
                            </td>
                        </tr>
                    </table>

                </td>
            </tr>
        </table>

        <!-- Footer général -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f5f5f5; border-top: 1px solid #ddd; padding: 12px 15px;">
            <tr>
                <td align="center">
                    <p style="font-family: Arial, sans-serif; font-size: 11px; color: #999; margin: 0;">
                        Document généré automatiquement par BACO • SNCB
                    </p>
                </td>
            </tr>
        </table>

    </div>
</body>
</html>
    `.trim();
}

/**
 * Copie l'email dans le presse-papier et ouvre Outlook
 * @param {Object} data - Données du rapport
 * @returns {Promise<void>}
 */
export async function copyForOutlook(data) {
    const html = generateEmailHtml(data);
    const formattedDate = formatDate(data.date);

    try {
        // Copier dans le presse-papier
        const blobHtml = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': blobHtml })
        ]);

        // Ouvrir Outlook avec subject pré-rempli
        const subject = encodeURIComponent(`Déplacements ${formattedDate.subject}`);
        const mailtoUrl = `mailto:${EMAIL_CONFIG.to}?cc=${EMAIL_CONFIG.cc}&subject=${subject}`;
        window.location.href = mailtoUrl;

        return { success: true };
    } catch (error) {
        console.error('Erreur lors de la copie:', error);
        throw error;
    }
}
