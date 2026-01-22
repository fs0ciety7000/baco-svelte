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
        const valColor = value === 0 ? COLORS.zeroRed : '#1a1a1a';
        const label = key.replace('shift_', '').toUpperCase();

        return `
            <td align="center" style="padding: 0 18px;">
                <table cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 14px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">
                    <tr>
                        <td style="padding: 20px 28px; text-align: center;">
                            <div style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; color: #6c757d; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px;">${label}</div>
                            <div style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 32px; font-weight: 900; color: ${valColor}; line-height: 1;">${value}</div>
                        </td>
                    </tr>
                </table>
            </td>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 35px 0 40px 0;">
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
        const bgColor = zone === 'FMS' ? '#f7fafc' : '#faf5ff';
        return `
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin: 35px 0; border-radius: 14px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.08);">
                <thead>
                    <tr style="background: ${color};">
                        <th style="padding: 18px; text-align: left; color: white; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; width: 140px;">Gare</th>
                        <th style="padding: 18px; text-align: left; color: white; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">Interventions (${zone})</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="2" style="padding: 40px; text-align: center; font-style: italic; color: #a0aec0; font-size: 15px; background: ${bgColor}; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;">
                            Aucune intervention prévue
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    const rows = stations.map((station, index) => {
        const bgColor = index % 2 === 0 ? (zone === 'FMS' ? '#f0f9ff' : '#faf5ff') : 'white';
        const stationText = getStationText(interventions, station, zone, true);

        return `
            <tr style="background-color: ${bgColor}; border-bottom: 1px solid #e2e8f0; transition: background-color 0.2s;">
                <td style="padding: 20px; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-weight: 700; color: ${color}; font-size: 16px;">
                    ${station}
                </td>
                <td style="padding: 20px; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #4a5568; font-size: 14px; line-height: 1.8;">
                    ${stationText}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin: 35px 0; border-radius: 14px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.08);">
            <thead>
                <tr style="background: ${color};">
                    <th style="padding: 18px; text-align: left; color: white; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; width: 140px;">Gare</th>
                    <th style="padding: 18px; text-align: left; color: white; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">Interventions (${zone})</th>
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
    <div style="max-width: 1000px; margin: 0 auto; background: white;">

        <!-- Header avec dégradé SNCB -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, ${COLORS.sncbHex} 0%, #004a8f 100%); padding: 50px 30px;">
            <tr>
                <td align="center">
                    <img src="cid:logo" alt="SNCB Logo" style="max-width: 200px; margin-bottom: 25px;" />
                    <h1 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 42px; font-weight: 900; color: white; margin: 0; text-transform: uppercase; letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        Déplacements PMR
                    </h1>
                    <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 18px; color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-weight: 500;">
                        ${formattedDate.display}
                    </p>
                </td>
            </tr>
        </table>

        <!-- Container principal avec padding -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
                <td style="padding: 50px 40px;">

                    <!-- ========== SECTION MATIN ========== -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); border-radius: 18px; padding: 35px; margin-bottom: 50px; box-shadow: 0 6px 20px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center">
                                <h2 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 32px; font-weight: 900; color: #6b21a8; margin: 0; text-transform: uppercase; letter-spacing: 2px;">
                                    ☀️ Prestation Matin
                                </h2>
                            </td>
                        </tr>
                    </table>

                    <!-- Mons Matin -->
                    <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 800; color: ${COLORS.monsHex}; margin: 40px 0 25px 0; padding-left: 20px; border-left: 6px solid ${COLORS.monsHex};">
                        📍 Prévu dans Quinyx gare de Mons
                    </h3>
                    ${formatStatsHtml(presenceMons)}
                    ${generateInterventionsTable(interventions, 'FMS', 'morning', COLORS.monsHex)}

                    <!-- Tournai Matin -->
                    <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 800; color: ${COLORS.tournaiHex}; margin: 60px 0 25px 0; padding-left: 20px; border-left: 6px solid ${COLORS.tournaiHex};">
                        📍 Prévu dans Quinyx gare de Tournai
                    </h3>
                    ${formatStatsHtml(presenceTournai)}
                    ${generateInterventionsTable(interventions, 'FTY', 'morning', COLORS.tournaiHex)}

                    <!-- ========== SECTION APRÈS-MIDI ========== -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 18px; padding: 35px; margin: 70px 0 50px 0; box-shadow: 0 6px 20px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center">
                                <h2 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 32px; font-weight: 900; color: #78350f; margin: 0; text-transform: uppercase; letter-spacing: 2px;">
                                    🌙 Prestation Après-Midi
                                </h2>
                            </td>
                        </tr>
                    </table>

                    <!-- Mons Après-midi -->
                    <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 800; color: ${COLORS.monsHex}; margin: 40px 0 25px 0; padding-left: 20px; border-left: 6px solid ${COLORS.monsHex};">
                        📍 Prévu dans Quinyx gare de Mons
                    </h3>
                    ${formatStatsHtml(presenceMonsAM)}
                    ${generateInterventionsTable(interventionsAM, 'FMS', 'afternoon', COLORS.monsHex)}

                    <!-- Tournai Après-midi -->
                    <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 800; color: ${COLORS.tournaiHex}; margin: 60px 0 25px 0; padding-left: 20px; border-left: 6px solid ${COLORS.tournaiHex};">
                        📍 Prévu dans Quinyx gare de Tournai
                    </h3>
                    ${formatStatsHtml(presenceTournaiAM)}
                    ${generateInterventionsTable(interventionsAM, 'FTY', 'afternoon', COLORS.tournaiHex)}

                    <!-- ========== FOOTER NOTES ========== -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 14px; padding: 30px; margin-top: 60px; border-left: 6px solid ${COLORS.sncbHex}; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                        <tr>
                            <td>
                                <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 15px; color: #475569; margin: 10px 0; line-height: 1.8;">
                                    • Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.
                                </p>
                                <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 15px; color: #475569; margin: 10px 0; line-height: 1.8;">
                                    • Interventions PMR pour B-CS : Voir DICOS.
                                </p>
                                <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 18px; font-weight: 800; color: ${COLORS.sncbHex}; margin: 25px 0 0 0; line-height: 1.5;">
                                    📱 L'App DICOS PMR reste la base à consulter
                                </p>
                            </td>
                        </tr>
                    </table>

                </td>
            </tr>
        </table>

        <!-- Footer général -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 25px 40px;">
            <tr>
                <td align="center">
                    <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #94a3b8; margin: 0;">
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
