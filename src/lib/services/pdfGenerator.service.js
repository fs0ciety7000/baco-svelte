/**
 * Service de génération PDF pour les déplacements PMR
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { COLORS } from '$lib/utils/deplacements.constants.js';
import {
    formatDate,
    getStationsWithInterventions,
    getStationText,
    getBase64ImageFromURL
} from '$lib/utils/deplacements.helpers.js';

/**
 * Génère un PDF pour le rapport de déplacements
 * @param {Object} data - Données du rapport
 * @returns {Promise<void>}
 */
export async function generatePDF({
    date,
    presenceMons,
    presenceTournai,
    presenceMonsAM,
    presenceTournaiAM,
    interventions,
    interventionsAM
}) {
    const doc = new jsPDF();
    const formattedDate = formatDate(date);
    let currentY = 50;

    // Charger et ajouter le logo SNCB
    try {
        const logoUrl = window.location.origin + '/Logo_100Y_FR_horiz_blue.png';
        const logoData = await getBase64ImageFromURL(logoUrl);
        doc.addImage(logoData, 'PNG', 10, 10, 50, 0);
    } catch (error) {
        console.error('Erreur lors du chargement du logo:', error);
    }

    // Titre principal
    doc.setTextColor(...COLORS.sncb);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("DÉPLACEMENTS PMR", 105, 20, { align: 'center' });

    // Date
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(formattedDate.display, 105, 30, { align: 'center' });

    // Ligne de séparation
    doc.setDrawColor(...COLORS.sncb);
    doc.setLineWidth(0.8);
    doc.line(10, 38, 200, 38);

    /**
     * Dessine un en-tête de section
     */
    const drawSection = (title, backgroundColor) => {
        const rgb = backgroundColor === COLORS.morningBg
            ? COLORS.morningBgRGB
            : COLORS.afternoonBgRGB;

        // Rectangle de fond
        doc.setFillColor(...rgb);
        doc.roundedRect(10, currentY, 190, 14, 3, 3, 'F');

        // Texte
        doc.setTextColor(backgroundColor === COLORS.afternoonBg ? 78 : 107, 53, backgroundColor === COLORS.afternoonBg ? 15 : 168);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(title, 105, currentY + 9, { align: 'center' });

        currentY += 25;
    };

    /**
     * Dessine un sous-titre
     */
    const drawSubTitle = (title, color) => {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...color);
        doc.text(title, 15, currentY);
        currentY += 12;
    };

    /**
     * Dessine les badges de présence
     */
    const drawStats = (presenceData) => {
        const entries = Object.entries(presenceData);
        let x = 20;

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");

        entries.forEach(([key, value]) => {
            const label = key.replace('shift_', '').toUpperCase();

            // Badge background
            doc.setFillColor(...COLORS.presenceBadgeBgRGB);
            doc.roundedRect(x, currentY - 6, 34, 10, 2, 2, 'F');

            // Label
            doc.setTextColor(0, 0, 0);
            doc.text(`${label}: `, x + 2, currentY);
            const labelWidth = doc.getTextWidth(`${label}: `);

            // Valeur (rouge si 0)
            if (value === 0) {
                doc.setTextColor(...COLORS.zeroRedRGB);
            } else {
                doc.setTextColor(0, 0, 0);
            }
            doc.text(value.toString(), x + labelWidth + 2, currentY);

            x += 38;
        });

        currentY += 22;
    };

    /**
     * Dessine un tableau d'interventions
     */
    const drawTable = (stations, zone, period, headerColor) => {
        if (stations.length === 0) {
            doc.setFontSize(11);
            doc.setTextColor(150, 150, 150);
            doc.setFont("helvetica", "italic");
            doc.text("Aucune intervention prévue", 105, currentY, { align: 'center' });
            currentY += 18;
            return;
        }

        const sourceInterventions = period === 'afternoon' ? interventionsAM : interventions;
        const rows = stations.map(station => [
            station,
            getStationText(sourceInterventions, station, zone, false)
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [['GARE', `INTERVENTIONS (${zone})`]],
            body: rows,
            theme: 'striped',
            headStyles: {
                fillColor: headerColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 11,
                minCellHeight: 14,
                valign: 'middle',
                halign: 'left'
            },
            bodyStyles: {
                textColor: [0, 0, 0],
                fontSize: 10,
                minCellHeight: 12,
                valign: 'middle'
            },
            columnStyles: {
                0: {
                    cellWidth: 38,
                    fontStyle: 'bold',
                    textColor: headerColor,
                    fontSize: 11
                },
                1: {
                    cellWidth: 'auto'
                }
            },
            margin: { left: 10, right: 10 },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            }
        });

        currentY = doc.lastAutoTable.finalY + 28;
    };

    /**
     * Vérifie si besoin de nouvelle page
     */
    const checkPageBreak = (spaceNeeded = 40) => {
        if (currentY > 280 - spaceNeeded) {
            doc.addPage();
            currentY = 20;
        }
    };

    // ========== PRESTATION MATIN ==========
    checkPageBreak(60);
    drawSection("☀️ PRESTATION MATIN", COLORS.morningBg);

    // Mons Matin
    drawSubTitle("📍 Prévu dans Quinyx gare de Mons", COLORS.mons);
    drawStats(presenceMons);
    const stationsFMSMorning = getStationsWithInterventions(interventions, 'FMS', 'morning');
    drawTable(stationsFMSMorning, 'FMS', 'morning', COLORS.mons);

    // Tournai Matin
    checkPageBreak(60);
    drawSubTitle("📍 Prévu dans Quinyx gare de Tournai", COLORS.tournai);
    drawStats(presenceTournai);
    const stationsFTYMorning = getStationsWithInterventions(interventions, 'FTY', 'morning');
    drawTable(stationsFTYMorning, 'FTY', 'morning', COLORS.tournai);

    // ========== PRESTATION APRÈS-MIDI ==========
    doc.addPage();
    currentY = 20;
    drawSection("🌙 PRESTATION APRÈS-MIDI", COLORS.afternoonBg);

    // Mons Après-midi
    drawSubTitle("📍 Prévu dans Quinyx gare de Mons", COLORS.mons);
    drawStats(presenceMonsAM);
    const stationsFMSAfternoon = getStationsWithInterventions(interventionsAM, 'FMS', 'afternoon');
    drawTable(stationsFMSAfternoon, 'FMS', 'afternoon', COLORS.mons);

    // Tournai Après-midi
    checkPageBreak(60);
    drawSubTitle("📍 Prévu dans Quinyx gare de Tournai", COLORS.tournai);
    drawStats(presenceTournaiAM);
    const stationsFTYAfternoon = getStationsWithInterventions(interventionsAM, 'FTY', 'afternoon');
    drawTable(stationsFTYAfternoon, 'FTY', 'afternoon', COLORS.tournai);

    // ========== FOOTER SUR TOUTES LES PAGES ==========
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // Notes
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.setFont("helvetica", "normal");
        doc.text("• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.", 15, 272);
        doc.text("• Interventions PMR pour B-CS : Voir DICOS.", 15, 277);

        // Important
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.sncb);
        doc.setFont("helvetica", "bold");
        doc.text("IMPORTANT: L'App DICOS PMR reste la base à consulter", 15, 285);

        // Numéro de page
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.setFont("helvetica", "normal");
        doc.text(`Page ${i} / ${pageCount}`, 195, 288, { align: 'right' });
    }

    // Sauvegarder le PDF
    const filename = `deplacement_pmr_${formattedDate.filename}.pdf`;
    doc.save(filename);

    return { success: true, filename };
}
