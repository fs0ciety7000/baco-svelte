/**
 * Service de génération d'email pour les déplacements PMR
 * Génère un HTML optimisé pour Outlook avec un design moderne
 */

import { COLORS, EMAIL_CONFIG } from '$lib/utils/deplacements.constants.js';
import {
    formatDate,
    getStationsWithInterventions,
    getStationText
} from '$lib/utils/deplacements.helpers.js';

/**
 * Convertit une image URL en chaîne Base64
 * @param {string} url - Chemin de l'image
 * @returns {Promise<string>} Chaîne base64
 */
async function getBase64Image(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Erreur conversion image email:', e);
        return '';
    }
}

/**
 * Génère les badges HTML pour les statistiques de présence
 * @param {Object} presenceData - Données de présence
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
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 20px 0;">
            <tr>${badgeRows}</tr>
        </table>
    `;
}

/**
 * Génère le tableau HTML des interventions pour une zone
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
 * @param {string} logoBase64 - Logo encodé en base64
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
}, logoBase64 = '') {
    const formattedDate = formatDate(date);
    const baseStyle = `font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 15px; color: #2d3748; line-height: 1.6;`;

    // Si on a un logo Base64, on l'utilise, sinon on fallback sur le texte
    const logoImg = logoBase64 
        ? `<img src="${logoBase64}" alt="Logo" style="max-width: 200px; height: auto; margin-bottom: 15px; display: block;" />`
        : `<div style="font-size: 24px; font-weight: bold; color: white; margin-bottom: 15px;">SNCB</div>`;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Déplacements PMR - ${formattedDate.subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7fafc; ${baseStyle}">
    
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f7fafc; table-layout: fixed;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                
                <table cellpadding="0" cellspacing="0" border="0" width="70%" style="background: white; max-width: 700px; min-width: 320px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <tr>
                        <td>

                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, ${COLORS.sncbHex} 0%, #004a8f 100%); padding: 30px 20px;">
                                <tr>
                                    <td align="center">
                                        ${logoImg}
                                        <h1 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 900; color: white; margin: 0; text-transform: uppercase; letter-spacing: 2px;">
                                            DÉPLACEMENTS PMR
                                        </h1>
                                        <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-weight: 500;">
                                            ${formattedDate.display}
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 30px 20px;">

                                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); border-radius: 12px; padding: 20px; margin-bottom: 30px; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">
                                            <tr>
                                                <td align="center">
                                                    <h2 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 900; color: #6b21a8; margin: 0; text-transform: uppercase; letter-spacing: 1.5px;">
                                                        PRESTATION MATIN
                                                    </h2>
                                                </td>
                                            </tr>
                                        </table>

                                        <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 800; color: ${COLORS.monsHex}; margin: 25px 0 15px 0; padding-left: 15px; border-left: 4px solid ${COLORS.monsHex};">
                                            Prévu dans Quinyx gare de Mons
                                        </h3>
                                        ${formatStatsHtml(presenceMons)}
                                        ${generateInterventionsTable(interventions, 'FMS', 'morning', COLORS.monsHex)}

                                        <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 800; color: ${COLORS.tournaiHex}; margin: 35px 0 15px 0; padding-left: 15px; border-left: 4px solid ${COLORS.tournaiHex};">
                                            Prévu dans Quinyx gare de Tournai
                                        </h3>
                                        ${formatStatsHtml(presenceTournai)}
                                        ${generateInterventionsTable(interventions, 'FTY', 'morning', COLORS.tournaiHex)}

                                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 20px; margin: 40px 0 30px 0; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">
                                            <tr>
                                                <td align="center">
                                                    <h2 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 900; color: #78350f; margin: 0; text-transform: uppercase; letter-spacing: 1.5px;">
                                                        PRESTATION APRÈS-MIDI
                                                    </h2>
                                                </td>
                                            </tr>
                                        </table>

                                        <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 800; color: ${COLORS.monsHex}; margin: 25px 0 15px 0; padding-left: 15px; border-left: 4px solid ${COLORS.monsHex};">
                                            Prévu dans Quinyx gare de Mons
                                        </h3>
                                        ${formatStatsHtml(presenceMonsAM)}
                                        ${generateInterventionsTable(interventionsAM, 'FMS', 'afternoon', COLORS.monsHex)}

                                        <h3 style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 800; color: ${COLORS.tournaiHex}; margin: 35px 0 15px 0; padding-left: 15px; border-left: 4px solid ${COLORS.tournaiHex};">
                                            Prévu dans Quinyx gare de Tournai
                                        </h3>
                                        ${formatStatsHtml(presenceTournaiAM)}
                                        ${generateInterventionsTable(interventionsAM, 'FTY', 'afternoon', COLORS.tournaiHex)}

                                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; padding: 20px; margin-top: 40px; border-left: 4px solid ${COLORS.sncbHex}; box-shadow: 0 3px 10px rgba(0,0,0,0.08);">
                                            <tr>
                                                <td>
                                                    <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #475569; margin: 8px 0; line-height: 1.6;">
                                                        • Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.
                                                    </p>
                                                    <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #475569; margin: 8px 0; line-height: 1.6;">
                                                        • Interventions PMR pour B-CS : Voir DICOS.
                                                    </p>
                                                    <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 800; color: ${COLORS.sncbHex}; margin: 15px 0 0 0; line-height: 1.5;">
                                                        IMPORTANT: L'App DICOS PMR reste la base à consulter
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>

                                    </td>
                                </tr>
                            </table>

                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 25px 40px;">
                                <tr>
                                    <td align="center">
                                        <p style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #94a3b8; margin: 0;">
                                            Document généré automatiquement par BACO • SNCB
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
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
    let logoBase64 = '';
    
    // Tentative de chargement du logo pour intégration directe
    try {
        logoBase64 = await getBase64Image('/Logo_100Y_FR_horiz_blue.png');
    } catch (e) {
        console.warn("Impossible de charger le logo pour l'email", e);
    }

    // On passe le logoBase64 à la fonction de génération
    const html = generateEmailHtml(data, logoBase64);
    const formattedDate = formatDate(data.date);

    try {
        // Copier dans le presse-papier (format HTML)
        const blobHtml = new Blob([html], { type: 'text/html' });
        
        // Note: Certains navigateurs/contextes peuvent nécessiter 'text/plain' aussi
        // mais pour Outlook 'text/html' est le plus important.
        await navigator.clipboard.write([
            new ClipboardItem({ 
                'text/html': blobHtml 
            })
        ]);

        // Ouvrir Outlook
        const subject = encodeURIComponent(`Déplacements ${formattedDate.subject}`);
        const mailtoUrl = `mailto:${EMAIL_CONFIG.to}?cc=${EMAIL_CONFIG.cc}&subject=${subject}`;
        window.location.href = mailtoUrl;

        return { success: true };
    } catch (error) {
        console.error('Erreur lors de la copie:', error);
        throw error;
    }
}