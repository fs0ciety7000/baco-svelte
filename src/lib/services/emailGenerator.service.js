/**
 * Service de génération d'email pour les déplacements PMR
 * Génère un HTML optimisé pour Outlook, fidèle au rendu PDF
 */

import { COLORS, EMAIL_CONFIG } from '$lib/utils/deplacements.constants.js';
import {
    formatDate,
    getStationsWithInterventions
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
 * Génère les badges compacts de présence (secondaires, discrets)
 * @param {Object} presenceData - Données de présence
 * @returns {string} HTML des badges
 */
function formatStatsHtml(presenceData) {
    const entries = Object.entries(presenceData);
    const badges = entries.map(([key, value]) => {
        const valColor = value === 0 ? COLORS.zeroRed : '#374151';
        const label = key.replace('shift_', '').toUpperCase();
        return `
            <td style="padding: 0 3px;">
                <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td style="background-color: #f3f4f6; padding: 4px 9px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #6b7280; white-space: nowrap;">
                            ${label}&nbsp;<span style="font-weight: bold; color: ${valColor};">${value}</span>
                        </td>
                    </tr>
                </table>
            </td>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 10px 0 20px 0;">
            <tr>${badges}</tr>
        </table>
    `;
}

/**
 * Formate chaque ligne d'intervention avec mise en avant du rôle assigné.
 * - pmr_details : texte principal, gras, noir
 * - assigned_to  : rôle, gras, couleur de zone (très visible)
 */
function formatInterventionLines(interventions, stationCode, zone, accentColor) {
    const matches = interventions.filter(i => i.station === stationCode && i.zone === zone);
    if (matches.length === 0) {
        return `<span style="font-family: Arial, Helvetica, sans-serif; color: #9ca3af; font-style: italic; font-size: 12px;">///</span>`;
    }

    return matches.map((m, idx) => {
        const details = (m.pmr_details || '').trim();
        const assignee = (m.assigned_to || '').trim();
        const marginBottom = idx < matches.length - 1 ? '14px' : '0';
        return `
            <div style="margin-bottom: ${marginBottom}; line-height: 1.45;">
                <span style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 600; color: #111827;">${details || '—'}</span>${assignee
                    ? `&nbsp;<span style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; color: ${accentColor};">(${assignee})</span>`
                    : ''}
            </div>
        `;
    }).join('');
}

/**
 * Génère un tableau d'interventions avec hiérarchie visuelle claire.
 * Interventions (grandes, grasses) > station (petite, discrète).
 */
function generateInterventionsTable(interventions, zone, color) {
    const stations = getStationsWithInterventions(interventions, zone);

    if (stations.length === 0) {
        return `
            <p style="font-family: Arial, Helvetica, sans-serif; font-style: italic; color: #9ca3af; font-size: 12px; text-align: center; margin: 4px 0 18px 0;">Aucune intervention prévue</p>
        `;
    }

    const rows = stations.map((station, index) => {
        const bgColor = index % 2 === 0 ? '#f9fafb' : '#ffffff';
        return `
            <tr style="background-color: ${bgColor};">
                <td style="padding: 14px 12px; font-family: Arial, Helvetica, sans-serif; font-weight: 700; color: ${color}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; vertical-align: top; width: 64px;">
                    ${station}
                </td>
                <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
                    ${formatInterventionLines(interventions, station, zone, color)}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e5e7eb;">
            <thead>
                <tr>
                    <th style="background-color: ${color}; padding: 7px 12px; text-align: left; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; width: 64px;">GARE</th>
                    <th style="background-color: ${color}; padding: 7px 12px; text-align: left; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">INTERVENTIONS — ${zone}</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

/**
 * Génère le HTML complet de l'email.
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
        ? `<img src="${logoBase64}" alt="Logo SNCB" style="width: 40px; height: auto; display: block;" />`
        : `<span style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: ${COLORS.sncbHex};">SNCB</span>`;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Déplacements PMR - ${formattedDate.subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
        <tr>
            <td align="center" style="padding: 24px 10px;">

                <!-- Conteneur principal -->
                <table cellpadding="0" cellspacing="0" border="0" width="660" style="background-color: #ffffff; max-width: 660px;">

                    <!-- EN-TÊTE : logo petit, puis titre et date empilés dessous -->
                    <tr>
                        <td style="padding: 24px 28px 16px 28px;">
                            ${logoImg}
                            <div style="margin-top: 12px; font-family: Arial, Helvetica, sans-serif; font-size: 19px; font-weight: bold; color: ${COLORS.sncbHex}; text-transform: uppercase; letter-spacing: 1px;">DÉPLACEMENTS PMR</div>
                            <div style="margin-top: 4px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #6b7280;">${formattedDate.display}</div>
                        </td>
                    </tr>

                    <!-- Ligne de séparation bleue -->
                    <tr>
                        <td style="padding: 0 28px;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="border-top: 2px solid ${COLORS.sncbHex}; font-size: 0; line-height: 0; height: 2px;">&nbsp;</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- CONTENU -->
                    <tr>
                        <td style="padding: 32px 28px;">

                            <!-- ══ PRESTATION MATIN ══ -->
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                    <td style="background-color: ${COLORS.morningBg}; padding: 8px 14px; text-align: center;">
                                        <span style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: bold; color: #5b21b6; text-transform: uppercase; letter-spacing: 1px;">PRESTATION MATIN</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Mons Matin -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 600; color: #6b7280; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 8px; border-left: 2px solid #d1d5db;">Quinyx — Mons</p>
                            ${formatStatsHtml(presenceMons)}
                            ${generateInterventionsTable(interventions, 'FMS', COLORS.monsHex)}

                            <!-- Tournai Matin -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 600; color: #6b7280; margin: 32px 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 8px; border-left: 2px solid #d1d5db;">Quinyx — Tournai</p>
                            ${formatStatsHtml(presenceTournai)}
                            ${generateInterventionsTable(interventions, 'FTY', COLORS.tournaiHex)}

                            <!-- Séparateur matin / après-midi -->
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 48px 0 0 0;">
                                <tr>
                                    <td style="border-top: 1px solid #e5e7eb; font-size: 0; line-height: 0; height: 1px;">&nbsp;</td>
                                </tr>
                            </table>

                            <!-- ══ PRESTATION APRÈS-MIDI ══ -->
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0 24px 0;">
                                <tr>
                                    <td style="background-color: ${COLORS.afternoonBg}; padding: 8px 14px; text-align: center;">
                                        <span style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: bold; color: #4e350f; text-transform: uppercase; letter-spacing: 1px;">PRESTATION APRÈS-MIDI</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Mons Après-midi -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 600; color: #6b7280; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 8px; border-left: 2px solid #d1d5db;">Quinyx — Mons</p>
                            ${formatStatsHtml(presenceMonsAM)}
                            ${generateInterventionsTable(interventionsAM, 'FMS', COLORS.monsHex)}

                            <!-- Tournai Après-midi -->
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 600; color: #6b7280; margin: 32px 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; padding-left: 8px; border-left: 2px solid #d1d5db;">Quinyx — Tournai</p>
                            ${formatStatsHtml(presenceTournaiAM)}
                            ${generateInterventionsTable(interventionsAM, 'FTY', COLORS.tournaiHex)}

                            <!-- Notes footer -->
                            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 44px; background-color: #f0f7ff; border-left: 3px solid ${COLORS.sncbHex};">
                                <tr>
                                    <td style="padding: 12px 14px;">
                                        <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #6b7280; margin: 3px 0;">• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
                                        <p style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #6b7280; margin: 3px 0;">• Interventions PMR pour B-CS : Voir DICOS.</p>
                                        <p style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: bold; color: ${COLORS.sncbHex}; margin: 10px 0 3px 0;">IMPORTANT: L'App DICOS PMR reste la base à consulter</p>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- BAS DE PAGE -->
                    <tr>
                        <td style="padding: 10px 28px; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #9ca3af; margin: 0;">Document généré automatiquement par BACO • SNCB</p>
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

    try {
        logoBase64 = await getBase64Image('/Logo_100Y_FR_horiz_blue.png');
    } catch (e) {
        console.warn("Impossible de charger le logo pour l'email", e);
    }

    const html = generateEmailHtml(data, logoBase64);
    const formattedDate = formatDate(data.date);

    try {
        const blobHtml = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': blobHtml
            })
        ]);

        const subject = encodeURIComponent(`Déplacements ${formattedDate.subject}`);
        const mailtoUrl = `mailto:${EMAIL_CONFIG.to}?cc=${EMAIL_CONFIG.cc}&subject=${subject}`;
        window.location.href = mailtoUrl;

        return { success: true };
    } catch (error) {
        console.error('Erreur lors de la copie:', error);
        throw error;
    }
}
