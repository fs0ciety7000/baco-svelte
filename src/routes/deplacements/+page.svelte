<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import { page } from '$app/stores';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    import {
        Save,
        Mail,
        FileDown,
        Plus,
        Trash2,
        Car,
        Calendar,
        MapPin,
        Users,
        Briefcase,
        Train
    } from 'lucide-svelte';

    // --- ÉTAT (Svelte 5 Runes) ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);

    // Données MATIN
    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventions = $state([]);

    // Données APRÈS-MIDI
    let presenceMonsAM = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournaiAM = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventionsAM = $state([]);

    let stationList = $state([]);

    // --- CONFIGURATION ---
    const PRESET_STATIONS_FMS = ['FMS', 'FSG', 'FGH', 'FJR', 'LVRS', 'ATH', 'FBC', 'FLZ', 'FNG'];
    const PRESET_STATIONS_FTY = ['FTY', 'ATH', 'FMC', 'FNG', 'FLZ', 'FLN'];

    const ASSIGNEES = [
        "ACP TEMP (Blaise)", "CPI BUFFER FTY", "CPI BUFFER FMS", "CPI FMS", 
        "CPI FBC", "CPI FTY", "OPI 1", "OPI 2", "SPI FTY", "SPI FMS", 
        "SPI Buffer FMS", "SPI Buffer FTY", "Team Leader", "MPI", "PA", 
        "OPI 5-13", "OPI 13-21", "PA 10-18", "CPI 10-18", "SPI 10-18"
    ];

    // --- INITIALISATION ---
    onMount(async () => {
        // Vérifier si une date est passée en paramètre d'URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlDate = urlParams.get('date');
        if (urlDate) {
            date = urlDate;
        }

        await loadStations();
        await loadDailyReport();
    });

    async function loadStations() {
        const { data } = await supabase.from('ptcar_abbreviations').select('abbreviation, zone_name');
        if (data) stationList = data;
    }

    // --- COULEURS & CONFIGURATION ---
    const COLORS = {
        sncb: [0, 105, 180], // RGB 0-105-180
        sncbHex: '#0069B4',
        mons: [0, 32, 80],   // Approx CMYK 100-90-20-50 -> Dark Blue
        monsHex: '#002050',
        tournai: [88, 72, 141], // #58488d
        tournaiHex: '#58488d',
        morningHex: '#d1b4d4', // Fond matin
        afternoonHex: '#93ebf8', // Approx CMYK 42-0-2-0 -> Cyan doux
        lightBg: '#f0f9ff'
    };

     // Regex pour mettre en gras les rôles
    function highlightRoles(text) {
        if (!text) return "";
        // Liste des termes à mettre en gras
        const roles = ["ACP", "CPI", "OPI", "SPI", "PA", "Team Leader", "MPI", "10-18"];
        // Création dynamique de la regex : (CPI|OPI|...)
        const regex = new RegExp(`\\b(${roles.join('|')})\\b`, 'gi');
        // Remplacement pour HTML
        return text.replace(regex, '<b>$1</b>');
    }

    // Helper pour récupérer l'image en base64 (pour le PDF)
    async function getBase64ImageFromURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.setAttribute("crossOrigin", "anonymous");
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL("image/png");
                resolve(dataURL);
            };
            img.onerror = error => reject(error);
            img.src = url;
        });
    }


    // --- LOGIQUE ---
    function detectZone(stationName) {
        const s = stationName?.toUpperCase() || '';
        if (PRESET_STATIONS_FTY.includes(s) && !PRESET_STATIONS_FMS.includes(s)) return 'FTY';
        return 'FMS'; 
    }

    function addRow() {
        interventions = [...interventions, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }];
    }

    function removeRow(index) {
        interventions = interventions.filter((_, i) => i !== index);
    }

    function handleStationChange(index, value) {
        interventions[index].station = value.toUpperCase();
        interventions[index].zone = detectZone(value);
    }

    // Fonctions pour l'après-midi
    function addRowAM() {
        interventionsAM = [...interventionsAM, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }];
    }

    function removeRowAM(index) {
        interventionsAM = interventionsAM.filter((_, i) => i !== index);
    }

    function handleStationChangeAM(index, value) {
        interventionsAM[index].station = value.toUpperCase();
        interventionsAM[index].zone = detectZone(value);
    }

  // Helper mis à jour pour récupérer le texte (avec option HTML pour Outlook)
    function getStationText(stationCode, zoneFilter = null, period = 'morning', forHtml = false) {
        const sourceInterventions = period === 'afternoon' ? interventionsAM : interventions;
        const matches = sourceInterventions.filter(i =>
            i.station === stationCode &&
            (zoneFilter ? i.zone === zoneFilter : true)
        );
        if (matches.length === 0) return "///";

        return matches.map(m => {
            const details = m.pmr_details ? m.pmr_details : "";
            const assignee = m.assigned_to ? `(${m.assigned_to})` : "";
            let fullText = `${details} ${assignee}`.trim();
            
            if (forHtml) {
                fullText = highlightRoles(fullText);
            }
            return fullText;
        }).join(forHtml ? '<br/>' : '\n'); // Saut de ligne HTML ou texte brut
    }

    // Helper pour récupérer les gares qui ont réellement des interventions
    function getStationsWithInterventions(zone, period) {
        const sourceInterventions = period === 'afternoon' ? interventionsAM : interventions;
        const stationsWithData = new Set();

        sourceInterventions
            .filter(i => i.zone === zone && i.station.trim() !== '')
            .forEach(i => stationsWithData.add(i.station));

        return Array.from(stationsWithData).sort();
    }

    // --- SUPABASE ---
    async function loadDailyReport() {
        loading = true;
        try {
            const { data: report } = await supabase.from('daily_movements').select('*').eq('date', date).single();
            if (report) {
                // Données matin
                presenceMons = report.presence_mons || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournai = report.presence_tournai || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };

                // Données après-midi
                presenceMonsAM = report.presence_mons_am || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournaiAM = report.presence_tournai_am || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };

                // Interventions (matin et après-midi)
                const { data: lines } = await supabase.from('movement_interventions').select('*').eq('movement_id', report.id).order('created_at', { ascending: true });
                if (lines) {
                    interventions = lines.filter(l => l.period === 'morning' || !l.period) || [];
                    interventionsAM = lines.filter(l => l.period === 'afternoon') || [];
                }
            } else {
                presenceMons = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournai = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceMonsAM = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournaiAM = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                interventions = [];
                interventionsAM = [];
            }
            if (interventions.length === 0) addRow();
            if (interventionsAM.length === 0) addRowAM();
        } catch (e) {
            console.error(e);
        } finally {
            loading = false;
        }
    }

    async function saveData() {
        loading = true;
        try {
            const { data: report, error: errRep } = await supabase
                .from('daily_movements')
                .upsert({
                    date,
                    presence_mons: presenceMons,
                    presence_tournai: presenceTournai,
                    presence_mons_am: presenceMonsAM,
                    presence_tournai_am: presenceTournaiAM
                }, { onConflict: 'date' })
                .select().single();
            if (errRep) throw errRep;

            // Supprimer toutes les interventions existantes
            await supabase.from('movement_interventions').delete().eq('movement_id', report.id);

            // Préparer les interventions du matin et de l'après-midi
            const validLinesMorning = interventions
                .filter(i => i.station.trim() !== '')
                .map(i => ({ ...i, movement_id: report.id, period: 'morning' }));

            const validLinesAfternoon = interventionsAM
                .filter(i => i.station.trim() !== '')
                .map(i => ({ ...i, movement_id: report.id, period: 'afternoon' }));

            const allValidLines = [...validLinesMorning, ...validLinesAfternoon];

            if (allValidLines.length > 0) {
                const { error: errLines } = await supabase.from('movement_interventions').insert(allValidLines);
                if (errLines) throw errLines;
            }
            toast.success("Rapport sauvegardé avec succès !");
        } catch (e) {
            toast.error("Erreur : " + e.message);
        } finally {
            loading = false;
        }
    }


   // --- EXPORT OUTLOOK (Amélioré) ---
    async function copyForOutlook() {
        const formattedDate = new Date(date).toLocaleDateString('fr-BE', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        // Styles communs
        const titleStyle = `color: #ffffff; padding: 12px 20px; font-weight: 900; font-size: 14pt; border-radius: 8px 8px 0 0;`;
        const subTitleStyle = `margin-top: 20px; margin-bottom: 10px; font-size: 11pt; color: ${COLORS.sncbHex}; font-weight: bold; border-left: 4px solid ${COLORS.sncbHex}; padding-left: 10px;`;
        const tableStyle = `width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10pt; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-top: 15px;`;
        const thStyle = `padding: 12px; font-weight: 900; color: white; text-align: left;`;

        const html = `
            <div style="font-family: 'Segoe UI', sans-serif; font-size: 11pt; color: #1e293b; background-color: #f8fafc; padding: 20px;">
                
                <div style="background-color: ${COLORS.sncbHex}; padding: 25px; border-radius: 12px; margin-bottom: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">
                        🚂 DÉPLACEMENTS PMR
                    </h1>
                    <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 16px;">${formattedDate}</p>
                </div>

                <div style="margin-bottom: 40px; background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <h2 style="color: ${COLORS.sncbHex}; border-bottom: 3px solid ${COLORS.morningHex}; padding-bottom: 10px; margin-top: 0;">
                        ☀️ PRESTATION MATIN
                    </h2>

                    <div style="${subTitleStyle} border-color: ${COLORS.monsHex}; color: ${COLORS.monsHex};">
                        📍 Prévu dans Quinyx gare de Mons
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                         ${Object.entries(presenceMons).map(([k, v]) => 
                            `<span style="background: ${COLORS.monsHex}; color: white; padding: 5px 10px; border-radius: 4px; font-size: 9pt;">
                                <b>${k.replace('shift_', '').toUpperCase()}:</b> ${v}
                            </span>`
                         ).join('')}
                    </div>

                    <table style="${tableStyle}">
                        <thead>
                            <tr style="background-color: ${COLORS.monsHex};">
                                <th style="${thStyle} width: 100px;">GARE</th>
                                <th style="${thStyle}">INTERVENTIONS (Zone FMS)</th>
                            </tr>
                        </thead>
                        <tbody>
                             ${(() => {
                                const stations = getStationsWithInterventions('FMS', 'morning');
                                if (stations.length === 0) return `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #888; background: #f9f9f9;">Aucune intervention</td></tr>`;
                                return stations.map((st, i) => `
                                    <tr style="background-color: ${i % 2 === 0 ? COLORS.lightBg : '#ffffff'};">
                                        <td style="padding: 12px; font-weight: bold; color: ${COLORS.monsHex}; border-bottom: 1px solid #eee;">${st}</td>
                                        <td style="padding: 12px; color: #333; line-height: 1.5; border-bottom: 1px solid #eee;">
                                            ${getStationText(st, 'FMS', 'morning', true)}
                                        </td>
                                    </tr>`).join('');
                            })()}
                        </tbody>
                    </table>

                    <div style="${subTitleStyle} margin-top: 35px; border-color: ${COLORS.tournaiHex}; color: ${COLORS.tournaiHex};">
                        📍 Prévu dans Quinyx gare de Tournai
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                         ${Object.entries(presenceTournai).map(([k, v]) => 
                            `<span style="background: ${COLORS.tournaiHex}; color: white; padding: 5px 10px; border-radius: 4px; font-size: 9pt;">
                                <b>${k.replace('shift_', '').toUpperCase()}:</b> ${v}
                            </span>`
                         ).join('')}
                    </div>

                    <table style="${tableStyle}">
                        <thead>
                            <tr style="background-color: ${COLORS.tournaiHex};">
                                <th style="${thStyle} width: 100px;">GARE</th>
                                <th style="${thStyle}">INTERVENTIONS (Zone FTY)</th>
                            </tr>
                        </thead>
                        <tbody>
                             ${(() => {
                                const stations = getStationsWithInterventions('FTY', 'morning');
                                if (stations.length === 0) return `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #888; background: #f9f9f9;">Aucune intervention</td></tr>`;
                                return stations.map((st, i) => `
                                    <tr style="background-color: ${i % 2 === 0 ? '#faf5ff' : '#ffffff'};">
                                        <td style="padding: 12px; font-weight: bold; color: ${COLORS.tournaiHex}; border-bottom: 1px solid #eee;">${st}</td>
                                        <td style="padding: 12px; color: #333; line-height: 1.5; border-bottom: 1px solid #eee;">
                                            ${getStationText(st, 'FTY', 'morning', true)}
                                        </td>
                                    </tr>`).join('');
                            })()}
                        </tbody>
                    </table>
                </div>

                <div style="margin-bottom: 30px; background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <h2 style="color: ${COLORS.sncbHex}; border-bottom: 3px solid ${COLORS.afternoonHex}; padding-bottom: 10px; margin-top: 0;">
                        🌙 PRESTATION APRÈS-MIDI
                    </h2>

                    <div style="${subTitleStyle} border-color: ${COLORS.monsHex}; color: ${COLORS.monsHex};">
                        📍 Prévu dans Quinyx gare de Mons
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                         ${Object.entries(presenceMonsAM).map(([k, v]) => 
                            `<span style="background: ${COLORS.monsHex}; color: white; padding: 5px 10px; border-radius: 4px; font-size: 9pt;">
                                <b>${k.replace('shift_', '').toUpperCase()}:</b> ${v}
                            </span>`
                         ).join('')}
                    </div>

                    <table style="${tableStyle}">
                        <thead>
                            <tr style="background-color: ${COLORS.monsHex};">
                                <th style="${thStyle} width: 100px;">GARE</th>
                                <th style="${thStyle}">INTERVENTIONS (Zone FMS)</th>
                            </tr>
                        </thead>
                        <tbody>
                             ${(() => {
                                const stations = getStationsWithInterventions('FMS', 'afternoon');
                                if (stations.length === 0) return `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #888; background: #f9f9f9;">Aucune intervention</td></tr>`;
                                return stations.map((st, i) => `
                                    <tr style="background-color: ${i % 2 === 0 ? COLORS.lightBg : '#ffffff'};">
                                        <td style="padding: 12px; font-weight: bold; color: ${COLORS.monsHex}; border-bottom: 1px solid #eee;">${st}</td>
                                        <td style="padding: 12px; color: #333; line-height: 1.5; border-bottom: 1px solid #eee;">
                                            ${getStationText(st, 'FMS', 'afternoon', true)}
                                        </td>
                                    </tr>`).join('');
                            })()}
                        </tbody>
                    </table>

                    <div style="${subTitleStyle} margin-top: 35px; border-color: ${COLORS.tournaiHex}; color: ${COLORS.tournaiHex};">
                        📍 Prévu dans Quinyx gare de Tournai
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                         ${Object.entries(presenceTournaiAM).map(([k, v]) => 
                            `<span style="background: ${COLORS.tournaiHex}; color: white; padding: 5px 10px; border-radius: 4px; font-size: 9pt;">
                                <b>${k.replace('shift_', '').toUpperCase()}:</b> ${v}
                            </span>`
                         ).join('')}
                    </div>

                    <table style="${tableStyle}">
                        <thead>
                            <tr style="background-color: ${COLORS.tournaiHex};">
                                <th style="${thStyle} width: 100px;">GARE</th>
                                <th style="${thStyle}">INTERVENTIONS (Zone FTY)</th>
                            </tr>
                        </thead>
                        <tbody>
                             ${(() => {
                                const stations = getStationsWithInterventions('FTY', 'afternoon');
                                if (stations.length === 0) return `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #888; background: #f9f9f9;">Aucune intervention</td></tr>`;
                                return stations.map((st, i) => `
                                    <tr style="background-color: ${i % 2 === 0 ? '#faf5ff' : '#ffffff'};">
                                        <td style="padding: 12px; font-weight: bold; color: ${COLORS.tournaiHex}; border-bottom: 1px solid #eee;">${st}</td>
                                        <td style="padding: 12px; color: #333; line-height: 1.5; border-bottom: 1px solid #eee;">
                                            ${getStationText(st, 'FTY', 'afternoon', true)}
                                        </td>
                                    </tr>`).join('');
                            })()}
                        </tbody>
                    </table>
                </div>

                <div style="background-color: #fefce8; border-left: 5px solid #eab308; padding: 15px; color: #854d0e; font-size: 10pt;">
                    <p style="margin: 5px 0;"><b>• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</b></p>
                    <p style="margin: 5px 0;"><b>• Interventions PMR pour B-CS : Voir DICOS.</b></p>
                    <p style="margin: 10px 0 0 0; font-weight: bold;">📱 L'App DICOS PMR reste la base à consulter</p>
                </div>
            </div>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport Déplacements PMR - ' + formattedDate], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
            toast.success("HTML copié ! Collez-le dans un nouveau mail Outlook.");
        } catch (err) {
            toast.error("Erreur : " + err.message);
        }
    }


     // --- PDF IMPROVED (Harmonisé) ---
    async function generatePDF() {
        const doc = new jsPDF();
        const formattedDate = new Date(date).toLocaleDateString('fr-BE', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        // Charger le logo
        try {
            const logoUrl = window.location.origin + '/Logo_100Y_FR_horiz_blue.png'; // Assurez-vous que le fichier est dans static/
            const logoData = await getBase64ImageFromURL(logoUrl);
            doc.addImage(logoData, 'PNG', 10, 10, 40, 0); // Ajuster taille/position
        } catch (e) {
            console.warn("Logo non chargé:", e);
        }

        let currentY = 25;

        // Titre Principal (Couleur SNCB)
        doc.setTextColor(...COLORS.sncb); // RGB 0, 105, 180
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("DEPLACEMENTS PMR", 105, 20, { align: 'center' });
        
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(formattedDate, 105, 28, { align: 'center' });
        
        // Ligne de séparation sous le titre
        doc.setDrawColor(...COLORS.sncb);
        doc.setLineWidth(0.5);
        doc.line(10, 32, 200, 32);

        currentY = 45;

        // --- Fonctions de construction ---
        const drawSectionTitle = (text, colorHex) => {
             // Convert hex to RGB for setFillColor is needed if not using '#...'
             // Mais jspdf accepte hex dans certaines versions, sinon on utilise les arrays définis plus haut
             const rgb = colorHex === COLORS.morningHex ? [209, 180, 212] : 
                         colorHex === COLORS.afternoonHex ? [147, 235, 248] : COLORS.sncb;

             // Fond bande titre
             doc.setFillColor(...rgb);
             doc.rect(10, currentY, 190, 10, 'F');
             
             // Texte
             doc.setTextColor(0, 0, 0); // Texte noir pour lisibilité sur pastel
             if (colorHex === COLORS.sncbHex) doc.setTextColor(255, 255, 255); // Blanc sur bleu foncé
             
             doc.setFontSize(12);
             doc.setFont("helvetica", "bold");
             doc.text(text, 15, currentY + 7);
             currentY += 18; // Padding après titre
        };

        const drawSubSection = (title, color) => {
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...color);
            doc.text(title, 15, currentY);
            currentY += 6; // Petit saut
        };

        const drawPresenceTable = (dataMap, startX, colorHead) => {
            const keys = Object.keys(dataMap);
            const values = Object.values(dataMap).map(v => v.toString());
            const headers = keys.map(k => k.replace('shift_', '').toUpperCase());

            autoTable(doc, {
                startY: currentY,
                head: [headers],
                body: [values],
                theme: 'grid',
                headStyles: { fillColor: colorHead, textColor: 255, fontStyle: 'bold', halign: 'center' },
                bodyStyles: { halign: 'center', textColor: 0 },
                margin: { left: startX },
                tableWidth: 90
            });
        };

        const drawInterventionTable = (stations, zone, period, colorHead) => {
            const rows = stations.map(st => {
                 // Note: PDF ne gère pas le bold HTML via autoTable simple. 
                 // On passe le texte brut.
                const txt = getStationText(st, zone, period, false); 
                return [st, txt];
            });

            autoTable(doc, {
                startY: currentY,
                head: [['GARE', `INTERVENTIONS (${zone})`]],
                body: rows,
                theme: 'striped',
                headStyles: { fillColor: colorHead, textColor: 255, fontStyle: 'bold' },
                bodyStyles: { textColor: 50 },
                columnStyles: {
                    0: { cellWidth: 25, fontStyle: 'bold', textColor: colorHead },
                    1: { cellWidth: 'auto' }
                },
                margin: { left: 10, right: 10 }
            });
            currentY = doc.lastAutoTable.finalY + 15; // Padding après tableau
        };

        // --- SECTION MATIN ---
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        drawSectionTitle("PRESTATION MATIN", COLORS.morningHex); // Couleur #d1b4d4

        // Mons Matin
        drawSubSection("• Prévu dans Quinyx gare de Mons", COLORS.mons);
        let yBeforeTable = currentY;
        drawPresenceTable(presenceMons, 10, COLORS.mons); // Table gauche
        
        // Tournai Matin
        let finalY_Mons = doc.lastAutoTable.finalY;
        currentY = yBeforeTable; // Reset Y pour mettre à droite
        // On affiche le titre Tournai décalé à droite manuellement ou on garde la structure verticale ?
        // Pour la structure PDF, il est souvent plus propre de mettre les deux petits tableaux côte à côte.
        
        // Titre Tournai (positionné à droite)
        doc.text("• Prévu dans Quinyx gare de Tournai", 110, yBeforeTable - 6);
        drawPresenceTable(presenceTournai, 110, COLORS.tournai); // Table droite

        currentY = Math.max(finalY_Mons, doc.lastAutoTable.finalY) + 12; // Espace après présences

        // Interventions Matin
        // FMS
        const stFMS = getStationsWithInterventions('FMS', 'morning');
        if (stFMS.length > 0) {
            drawInterventionTable(stFMS, 'FMS', 'morning', COLORS.mons);
        }
        // FTY
        const stFTY = getStationsWithInterventions('FTY', 'morning');
        if (stFTY.length > 0) {
            // Check page break
             if (currentY > 250) { doc.addPage(); currentY = 20; }
            drawInterventionTable(stFTY, 'FTY', 'morning', COLORS.tournai);
        }

        if (stFMS.length === 0 && stFTY.length === 0) {
            doc.setFont("helvetica", "italic");
            doc.setTextColor(150);
            doc.text("Aucune intervention planifiée", 105, currentY, {align:'center'});
            currentY += 20;
        }


        // --- SECTION APRÈS-MIDI ---
        // Saut de page pour clarté
        doc.addPage(); 
        currentY = 20;
        
        drawSectionTitle("PRESTATION APRÈS-MIDI", COLORS.afternoonHex); // CMYK converti

        // Mons AM
        drawSubSection("• Prévu dans Quinyx gare de Mons", COLORS.mons);
        yBeforeTable = currentY;
        drawPresenceTable(presenceMonsAM, 10, COLORS.mons);

        // Tournai AM
        finalY_Mons = doc.lastAutoTable.finalY;
        currentY = yBeforeTable;
        doc.text("• Prévu dans Quinyx gare de Tournai", 110, yBeforeTable - 6);
        drawPresenceTable(presenceTournaiAM, 110, COLORS.tournai);

        currentY = Math.max(finalY_Mons, doc.lastAutoTable.finalY) + 12;

        // Interventions AM
        const stFMS_AM = getStationsWithInterventions('FMS', 'afternoon');
        if (stFMS_AM.length > 0) {
            drawInterventionTable(stFMS_AM, 'FMS', 'afternoon', COLORS.mons);
        }
        const stFTY_AM = getStationsWithInterventions('FTY', 'afternoon');
        if (stFTY_AM.length > 0) {
             if (currentY > 250) { doc.addPage(); currentY = 20; }
            drawInterventionTable(stFTY_AM, 'FTY', 'afternoon', COLORS.tournai);
        }

        // --- FOOTER ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            // Ligne footer
            doc.setDrawColor(...COLORS.sncb);
            doc.setLineWidth(0.5);
            doc.line(10, 275, 200, 275);
            
            doc.setFontSize(8);
            doc.setTextColor(80);
            doc.setFont("helvetica", "bold");
            doc.text("• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.", 10, 280);
            doc.text("• Interventions PMR pour B-CS : Voir DICOS.", 10, 284);
            doc.setTextColor(...COLORS.sncb);
            doc.text("IMPORTANT: L'App DICOS PMR reste la base à consulter", 10, 289);

            doc.setTextColor(150);
            doc.text(`Page ${i} / ${pageCount}`, 195, 289, { align: 'right' });
        }

        doc.save(`deplacements_pmr_${date}.pdf`);
        toast.success("PDF généré (Couleurs harmonisées) !");
    }
</script>

<div class="space-y-8 p-4 md:p-8 max-w-[1800px] mx-auto pb-32 animate-fade-in">

    <!-- Header avec dégradé -->
    <header class="relative flex flex-col md:flex-row md:justify-between md:items-end gap-6 pb-8 overflow-hidden">
        <!-- Fond dégradé animé -->
        <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 rounded-3xl animate-gradient-shift"></div>
        <div class="absolute inset-0 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-sm"></div>

        <div class="relative flex items-center gap-4 p-6">
            <div class="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/50 animate-pulse-soft">
                <Car class="w-10 h-10" />
            </div>
            <div>
                <h1 class="text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Déplacements PMR
                </h1>
                <p class="text-slate-400 text-sm mt-2 font-medium">Gestion centralisée des prises en charge</p>
            </div>
        </div>

        <div class="relative flex flex-wrap gap-3 p-6">
            <a
                href="/deplacements/historique"
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-slate-500/50 hover:shadow-xl hover:shadow-slate-500/70 hover:scale-105"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Train class="w-5 h-5" />
                Historique
            </a>
            <button
                onclick={saveData}
                disabled={loading}
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                {#if loading}<span class="animate-spin">⏳</span>{:else}<Save class="w-5 h-5" />{/if}
                Sauvegarder
            </button>
            <button
                onclick={copyForOutlook}
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/70 hover:scale-105"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Mail class="w-5 h-5" />
                Copier pour Outlook
            </button>
            <button
                onclick={generatePDF}
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-red-500/50 hover:shadow-xl hover:shadow-red-500/70 hover:scale-105"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <FileDown class="w-5 h-5" />
                Télécharger PDF
            </button>
        </div>
    </header>

    <!-- Date Selector avec effet -->
    <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur-lg opacity-25 group-hover:opacity-50 transition duration-500"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
            <label class="text-xs uppercase font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text mb-3 flex items-center gap-2 tracking-widest">
                <Calendar class="w-5 h-5 text-blue-400 animate-pulse-soft" /> Date du rapport
            </label>
            <input
                type="date"
                bind:value={date}
                onchange={loadDailyReport}
                class="w-full max-w-md bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-5 py-3.5 text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-300 cursor-pointer hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/30"
            />
        </div>
    </div>

    <!-- PRESTATION MATIN avec dégradés -->
    <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-blue-500/30 rounded-2xl p-8 shadow-2xl">
            <h2 class="text-3xl font-black mb-8 flex items-center gap-3 pb-5 border-b-2 border-gradient-to-r from-blue-500 to-cyan-500">
                <div class="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg shadow-blue-500/50 animate-pulse-soft">
                    <MapPin class="w-6 h-6 text-white" />
                </div>
                <span class="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Prestation matin</span>
            </h2>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Présence MONS Matin -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-blue-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-blue-400" />
                            <span class="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">
                                Quinyx gare de Mons
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceMons) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-blue-900/30 hover:to-blue-800/30 rounded-xl p-3 border-2 border-blue-500/20 hover:border-blue-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30">
                                    <span class="text-[10px] uppercase text-blue-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceMons[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-blue-100 outline-none appearance-none hover:text-blue-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Présence TOURNAI Matin -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-500 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-purple-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-purple-400" />
                            <span class="bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent">
                                Quinyx gare de Tournai
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceTournai) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-purple-900/30 hover:to-pink-900/30 rounded-xl p-3 border-2 border-purple-500/20 hover:border-purple-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30">
                                    <span class="text-[10px] uppercase text-purple-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceTournai[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-purple-100 outline-none appearance-none hover:text-purple-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Interventions Matin -->
    <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 rounded-3xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-xl border-2 border-blue-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div class="p-5 border-b-2 border-blue-500/30 flex justify-between items-center bg-gradient-to-r from-slate-950/80 to-blue-950/30">
                <h3 class="font-black text-lg flex items-center gap-3">
                    <div class="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg shadow-lg">
                        <Users class="w-5 h-5 text-white" />
                    </div>
                    <span class="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">Interventions MATIN</span>
                    <span class="bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-2 border-blue-400/50 text-sm px-3 py-1 rounded-full font-bold shadow-lg">{interventions.length}</span>
                </h3>
                <button
                    onclick={addRow}
                    class="group/btn relative bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:scale-105"
                >
                    <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                    <Plus class="w-4 h-4 relative z-10" /> <span class="relative z-10">Ajouter</span>
                </button>
            </div>

            <div class="overflow-x-auto flex-1 custom-scrollbar">
                <table class="w-full text-sm text-left border-collapse">
                    <thead class="text-blue-300 uppercase text-xs font-black bg-gradient-to-r from-slate-950 to-blue-950/50 sticky top-0 z-10 border-b-2 border-blue-500/30">
                        <tr>
                            <th class="px-4 py-4 w-20 text-center">Zone</th>
                            <th class="px-4 py-4 w-32">Gare</th>
                            <th class="px-4 py-4">PMR / Mission</th>
                            <th class="px-4 py-4 w-64">Prise en charge par</th>
                            <th class="px-2 py-4 w-12"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-blue-500/10">
                        {#each interventions as row, i}
                            <tr class="hover:bg-blue-500/5 group/row transition-all duration-200 hover:shadow-lg">
                                <td class="p-3">
                                    <input
                                        bind:value={row.zone}
                                        class="w-16 bg-slate-950/50 text-center font-mono text-sm uppercase border-2 border-blue-500/20 hover:border-blue-400/50 rounded-lg px-2 py-2 text-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                                        placeholder="-"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        list="stations"
                                        value={row.station}
                                        oninput={(e) => handleStationChange(i, e.target.value)}
                                        class="w-full bg-slate-950/50 border-2 border-blue-500/20 hover:border-blue-400/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg px-3 py-2 font-bold uppercase text-white outline-none transition-all"
                                        placeholder="GARE"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        bind:value={row.pmr_details}
                                        class="w-full bg-slate-950/50 border-2 border-blue-500/20 hover:border-blue-400/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg px-3 py-2 text-slate-200 outline-none transition-all"
                                        placeholder="Ex: 2026-01-20-0081 1 NV IN E 1708 à 08H31"
                                    />
                                </td>
                                <td class="p-3">
                                    <select
                                        bind:value={row.assigned_to}
                                        class="w-full bg-slate-950/50 border-2 border-blue-500/20 hover:border-blue-400/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer transition-all font-medium"
                                    >
                                        <option value="">- Choisir -</option>
                                        {#each ASSIGNEES as person}
                                            <option value={person}>{person}</option>
                                        {/each}
                                    </select>
                                </td>
                                <td class="p-3 text-center">
                                    <button
                                        onclick={() => removeRow(i)}
                                        class="text-slate-600 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all opacity-0 group-hover/row:opacity-100 hover:scale-110 border border-transparent hover:border-red-500/30"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- PRESTATION APRÈS-MIDI avec dégradés -->
    <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-purple-500/30 rounded-2xl p-8 shadow-2xl">
            <h2 class="text-3xl font-black mb-8 flex items-center gap-3 pb-5 border-b-2 border-gradient-to-r from-purple-500 to-pink-500">
                <div class="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg shadow-purple-500/50 animate-pulse-soft">
                    <MapPin class="w-6 h-6 text-white" />
                </div>
                <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Prestation après-midi</span>
            </h2>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Présence MONS Après-midi -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-blue-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-blue-400" />
                            <span class="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">
                                Quinyx gare de Mons
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceMonsAM) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-blue-900/30 hover:to-blue-800/30 rounded-xl p-3 border-2 border-blue-500/20 hover:border-blue-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30">
                                    <span class="text-[10px] uppercase text-blue-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceMonsAM[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-blue-100 outline-none appearance-none hover:text-blue-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Présence TOURNAI Après-midi -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-500 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-purple-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-purple-400" />
                            <span class="bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent">
                                Quinyx gare de Tournai
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceTournaiAM) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-purple-900/30 hover:to-pink-900/30 rounded-xl p-3 border-2 border-purple-500/20 hover:border-purple-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30">
                                    <span class="text-[10px] uppercase text-purple-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceTournaiAM[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-purple-100 outline-none appearance-none hover:text-purple-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Interventions Après-midi -->
    <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 rounded-3xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-xl border-2 border-purple-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div class="p-5 border-b-2 border-purple-500/30 flex justify-between items-center bg-gradient-to-r from-slate-950/80 to-purple-950/30">
                <h3 class="font-black text-lg flex items-center gap-3">
                    <div class="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg shadow-lg">
                        <Users class="w-5 h-5 text-white" />
                    </div>
                    <span class="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">Interventions APRÈS-MIDI</span>
                    <span class="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-2 border-purple-400/50 text-sm px-3 py-1 rounded-full font-bold shadow-lg">{interventionsAM.length}</span>
                </h3>
                <button
                    onclick={addRowAM}
                    class="group/btn relative bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 font-bold shadow-lg shadow-purple-500/50 hover:shadow-xl hover:scale-105"
                >
                    <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                    <Plus class="w-4 h-4 relative z-10" /> <span class="relative z-10">Ajouter</span>
                </button>
            </div>

            <div class="overflow-x-auto flex-1 custom-scrollbar">
                <table class="w-full text-sm text-left border-collapse">
                    <thead class="text-purple-300 uppercase text-xs font-black bg-gradient-to-r from-slate-950 to-purple-950/50 sticky top-0 z-10 border-b-2 border-purple-500/30">
                        <tr>
                            <th class="px-4 py-4 w-20 text-center">Zone</th>
                            <th class="px-4 py-4 w-32">Gare</th>
                            <th class="px-4 py-4">PMR / Mission</th>
                            <th class="px-4 py-4 w-64">Prise en charge par</th>
                            <th class="px-2 py-4 w-12"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-purple-500/10">
                        {#each interventionsAM as row, i}
                            <tr class="hover:bg-purple-500/5 group/row transition-all duration-200 hover:shadow-lg">
                                <td class="p-3">
                                    <input
                                        bind:value={row.zone}
                                        class="w-16 bg-slate-950/50 text-center font-mono text-sm uppercase border-2 border-purple-500/20 hover:border-purple-400/50 rounded-lg px-2 py-2 text-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none transition-all"
                                        placeholder="-"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        list="stations"
                                        value={row.station}
                                        oninput={(e) => handleStationChangeAM(i, e.target.value)}
                                        class="w-full bg-slate-950/50 border-2 border-purple-500/20 hover:border-purple-400/50 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 rounded-lg px-3 py-2 font-bold uppercase text-white outline-none transition-all"
                                        placeholder="GARE"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        bind:value={row.pmr_details}
                                        class="w-full bg-slate-950/50 border-2 border-purple-500/20 hover:border-purple-400/50 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 rounded-lg px-3 py-2 text-slate-200 outline-none transition-all"
                                        placeholder="Ex: 2026-01-21-0080 1NV IN E4868 à 18h59"
                                    />
                                </td>
                                <td class="p-3">
                                    <select
                                        bind:value={row.assigned_to}
                                        class="w-full bg-slate-950/50 border-2 border-purple-500/20 hover:border-purple-400/50 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer transition-all font-medium"
                                    >
                                        <option value="">- Choisir -</option>
                                        {#each ASSIGNEES as person}
                                            <option value={person}>{person}</option>
                                        {/each}
                                    </select>
                                </td>
                                <td class="p-3 text-center">
                                    <button
                                        onclick={() => removeRowAM(i)}
                                        class="text-slate-600 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all opacity-0 group-hover/row:opacity-100 hover:scale-110 border border-transparent hover:border-red-500/30"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Footer note avec design amélioré -->
    <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-yellow-600 via-orange-500 to-yellow-600 rounded-2xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
        <div class="relative bg-gradient-to-br from-slate-900/90 to-yellow-900/20 border-2 border-yellow-500/30 rounded-2xl p-6 shadow-2xl">
            <div class="flex items-start gap-4">
                <div class="p-3 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl shadow-lg flex-shrink-0">
                    <Briefcase class="w-6 h-6 text-white" />
                </div>
                <div class="text-sm space-y-2">
                    <p class="text-slate-300 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                        Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.
                    </p>
                    <p class="text-slate-300 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                        Interventions PMR pour B-CS : Voir DICOS.
                    </p>
                    <p class="font-black text-transparent bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-400 bg-clip-text mt-4 text-base flex items-center gap-2">
                        <span class="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                        L'App DICOS PMR reste la base à consulter
                    </p>
                </div>
            </div>
        </div>
    </div>

</div>

<datalist id="stations">
    {#each stationList as s}<option value={s.abbreviation} />{/each}
</datalist>

<style>
    /* Scrollbar moderne avec dégradés */
    .custom-scrollbar::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.5);
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(59, 130, 246, 0.5), rgba(147, 51, 234, 0.5));
        border-radius: 10px;
        border: 2px solid rgba(15, 23, 42, 0.5);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(59, 130, 246, 0.8), rgba(147, 51, 234, 0.8));
    }

    /* Animation de fade-in pour toute la page */
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .animate-fade-in {
        animation: fadeIn 0.6s ease-out;
    }

    /* Animation de pulse douce */
    @keyframes pulseSoft {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.85;
            transform: scale(1.03);
        }
    }

    .animate-pulse-soft {
        animation: pulseSoft 3s ease-in-out infinite;
    }

    /* Animation de dégradé qui se déplace */
    @keyframes gradientShift {
        0% {
            background-position: 0% 50%;
        }
        50% {
            background-position: 100% 50%;
        }
        100% {
            background-position: 0% 50%;
        }
    }

    .animate-gradient-shift {
        background-size: 200% 200%;
        animation: gradientShift 15s ease infinite;
    }

    /* Masquer les flèches des inputs number */
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    input[type="number"] {
        -moz-appearance: textfield;
    }

    /* Effet de brillance au survol */
    @keyframes shine {
        to {
            background-position: 200% center;
        }
    }
</style>