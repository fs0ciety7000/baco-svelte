/**
 * Service de génération d'email pour les déplacements PMR
 * Génère un HTML optimisé pour Outlook, fidèle au rendu PDF
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
 * Génère les badges compacts de présence (style PDF)
 * @param {Object} presenceData - Données de présence
 * @returns {string} HTML des badges
 */
function formatStatsHtml(presenceData) {
    const entries = Object.entries(presenceData);
    const badges = entries.map(([key, value]) => {
        const valColor = value === 0 ? COLORS.zeroRed : '#1a1a1a';
        const label = key.replace('shift_', '').toUpperCase();
        return `
            <td style="padding: 0 3px;">
                <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td style="background-color: #e5e7eb; padding: 5px 10px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: bold; color: #1a1a1a; white-space: nowrap;">
                            ${label}: <span style="color: ${valColor};">${value}</span>
                        </td>
                    </tr>
                </table>
            </td>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 14px 0;">
            <tr>${badges}</tr>
        </table>
    `;
}

/**
 * Génère un tableau d'interventions style PDF (lignes alternées, en-tête coloré)
 */
function generateInterventionsTable(interventions, zone, period, color) {
    const stations = getStationsWithInterventions(interventions, zone, period);

    if (stations.length === 0) {
        return `
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin-bottom: 14px;">
                <thead>
                    <tr>
                        <th style="background-color: ${color}; padding: 9px 12px; text-align: left; color: white; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: bold; text-transform: uppercase; width: 80px;">GARE</th>
                        <th style="background-color: ${color}; padding: 9px 12px; text-align: left; color: white; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: bold; text-transform: uppercase;">INTERVENTIONS (${zone})</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="2" style="padding: 14px; text-align: center; font-style: italic; color: #909090; font-size: 12px; font-family: Arial, Helvetica, sans-serif; background-color: #f8f8f8;">
                            Aucune intervention prévue
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    const rows = stations.map((station, index) => {
        const bgColor = index % 2 === 0 ? '#f8fafc' : '#ffffff';
        const stationText = getStationText(interventions, station, zone, true);
        return `
            <tr style="background-color: ${bgColor};">
                <td style="padding: 9px 12px; font-family: Arial, Helvetica, sans-serif; font-weight: bold; color: ${color}; font-size: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; width: 80px;">
                    ${station}
                </td>
                <td style="padding: 9px 12px; font-family: Arial, Helvetica, sans-serif; color: #404040; font-size: 12px; line-height: 1.6; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                    ${stationText}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin-bottom: 14px;">
            <thead>
                <tr>
                    <th style="background-color: ${color}; padding: 9px 12px; text-align: left; color: white; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: bold; text-transform: uppercase; width: 80px;">GARE</th>
                    <th style="background-color: ${color}; padding: 9px 12px; text-align: left; color: white; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: bold; text-transform: uppercase;">INTERVENTIONS (${zone})</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

/**
 * Génère le HTML complet de l'email (style fidèle au PDF)
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

    const logoImg = logoBase64
        ? `<img src="${logoBase64}" alt="Logo SNCB" style="width: 120px; height: auto; display: block;" />`
        : `<span style="font-family: Arial, Helvetica, sans-serif; font-size: 18px; font-weight: bold; color: ${COLORS.sncbHex};">SNCB</span>`;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Déplacements PMR - ${formattedDate.subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f0f0;">

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f0f0f0;">
        <tr>
            <td align="center" style="padding: 20px 10px;">

                <!-- Conteneur principal -->
                <table cellpadding="0" cellspacing="0" border="0" width="680" style="background-color: #ffffff; max-width: 680px;">

                    <!-- EN-TÊTE : logo gauche + titre centré (comme PDF) -->
                    <tr>
                        <td style="padding: 18px 20px 12px 20px;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="width: 130px; vertical-align: middle;">
                                        ${logoImg}
                                    </td>
                                    <td style="vertical-align: middle; text-align: center;">
                                        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; color: ${COLORS.sncbHex}; text-transform: uppercase; letter-spacing: 1px;">DÉPLACEMENTS PMR</div>
                                        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #505050; margin-top: 4px;">${formattedDate.display}</div>
                                    </td>
                                    <td style="width: 130px;"></td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Ligne de séparation bleue (comme PDF) -->
                    <tr>
                        <td style="padding: 0 20px;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="border-top: 2px solid ${COLORS.sncbHex}; font-size: 0; line-height: 0; height: 2px;">&nbsp;</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- CONTENU -->
                    <tr>
                        <td style="padding: 20px;">

                            <!-- Bandeau PRESTATION MATIN (couleur morningBg comme PDF) -->
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 18px;">
                                <tr>
                                    <td style="background-color: ${COLORS.morningBg}; padding: 9px 12px; text-align: center;">
                                        <span style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: bold; color: #6b35a8; text-transform: uppercase; letter-spacing: 1px;">PRESTATION MATIN</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Mons Matin -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: bold; color: ${COLORS.monsHex}; margin: 14px 0 6px 0; padding-left: 8px; border-left: 3px solid ${COLORS.monsHex};">Prévu dans Quinyx gare de Mons</p>
                            ${formatStatsHtml(presenceMons)}
                            ${generateInterventionsTable(interventions, 'FMS', 'morning', COLORS.monsHex)}

                            <!-- Tournai Matin -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: bold; color: ${COLORS.tournaiHex}; margin: 18px 0 6px 0; padding-left: 8px; border-left: 3px solid ${COLORS.tournaiHex};">Prévu dans Quinyx gare de Tournai</p>
                            ${formatStatsHtml(presenceTournai)}
                            ${generateInterventionsTable(interventions, 'FTY', 'morning', COLORS.tournaiHex)}

                            <!-- Bandeau PRESTATION APRÈS-MIDI (couleur afternoonBg comme PDF) -->
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 28px 0 18px 0;">
                                <tr>
                                    <td style="background-color: ${COLORS.afternoonBg}; padding: 9px 12px; text-align: center;">
                                        <span style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: bold; color: #4e350f; text-transform: uppercase; letter-spacing: 1px;">PRESTATION APRÈS-MIDI</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Mons Après-midi -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: bold; color: ${COLORS.monsHex}; margin: 14px 0 6px 0; padding-left: 8px; border-left: 3px solid ${COLORS.monsHex};">Prévu dans Quinyx gare de Mons</p>
                            ${formatStatsHtml(presenceMonsAM)}
                            ${generateInterventionsTable(interventionsAM, 'FMS', 'afternoon', COLORS.monsHex)}

                            <!-- Tournai Après-midi -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: bold; color: ${COLORS.tournaiHex}; margin: 18px 0 6px 0; padding-left: 8px; border-left: 3px solid ${COLORS.tournaiHex};">Prévu dans Quinyx gare de Tournai</p>
                            ${formatStatsHtml(presenceTournaiAM)}
                            ${generateInterventionsTable(interventionsAM, 'FTY', 'afternoon', COLORS.tournaiHex)}

                            <!-- Notes footer (identique au PDF) -->
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 28px; background-color: #f0f7ff; border-left: 3px solid ${COLORS.sncbHex};">
                                <tr>
                                    <td style="padding: 12px 14px;">
                                        <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #505050; margin: 3px 0;">• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
                                        <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #505050; margin: 3px 0;">• Interventions PMR pour B-CS : Voir DICOS.</p>
                                        <p style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: bold; color: ${COLORS.sncbHex}; margin: 10px 0 3px 0;">IMPORTANT: L'App DICOS PMR reste la base à consulter</p>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- BAS DE PAGE -->
                    <tr>
                        <td style="padding: 10px 20px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #94a3b8; margin: 0;">Document généré automatiquement par BACO • SNCB</p>
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
