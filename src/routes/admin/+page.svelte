<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
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
        Briefcase,
        Train
    } from 'lucide-svelte';

    // --- CONFIGURATION ---
    const PRESET_STATIONS_FMS = ['FMS', 'FSG', 'FGH', 'FJR', 'LVRS', 'ATH', 'FBC', 'FLZ', 'FNG'];
    const PRESET_STATIONS_FTY = ['FTY', 'ATH', 'FMC', 'FNG', 'FLZ', 'FLN'];

    const ASSIGNEES = [
        "ACP TEMP (Blaise)", "CPI BUFFER FTY", "CPI BUFFER FMS", "CPI FMS", 
        "CPI FBC", "CPI FTY", "OPI 1", "OPI 2", "SPI FTY", "SPI FMS", 
        "SPI Buffer FMS", "SPI Buffer FTY", "Team Leader", "MPI", "PA", 
        "OPI 5-13", "OPI 13-21", "PA 10-18", "CPI 10-18", "SPI 10-18"
    ];

    const COLORS = {
        sncb: [0, 105, 180],
        sncbHex: '#0069B4',
        mons: [0, 32, 80],
        monsHex: '#002050',
        tournai: [168, 111, 168],
        tournaiHex: '#a86fa8',
        zeroRed: '#be4366',
        zeroRedRGB: [190, 67, 102],
        morningBg: '#d1b4d4', // Couleur PDF Matin
        morningBgRGB: [209, 180, 212],
        afternoonBg: '#ADBC16', // Couleur PDF Après-midi
        afternoonBgRGB: [173, 188, 22],
        presenceBadgeBg: '#e5e7eb',
        presenceBadgeBgRGB: [229, 231, 235]
    };

    const EMAIL_TO = "cedric.thiels@belgiantrain.be;luc.deconinck@belgiantrain.be;b4u.mons@belgiantrain.be;paco.mons@belgiantrain.be;785um.OUMonsPermanence@belgiantrain.be;gare.mons.quai@belgiantrain.be;785ut.OUTournaiPermanence@belgiantrain.be;gare.tournai.quai@belgiantrain.be;gare.braine.le.comte.quai@belgiantrain.be";
    const EMAIL_CC = "mathieu.debaisieux@belgiantrain.be";

    // --- ÉTAT ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);

    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventions = $state([]);

    let presenceMonsAM = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournaiAM = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventionsAM = $state([]);
    let stationList = $state([]);

    // --- INITIALISATION ---
    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlDate = urlParams.get('date');
        if (urlDate) date = urlDate;
        await loadStations();
        await loadDailyReport();
    });

    async function loadStations() {
        const { data } = await supabase.from('ptcar_abbreviations').select('abbreviation, zone_name');
        if (data) stationList = data;
    }

    // --- LOGIQUE ---
    function detectZone(stationName) {
        const s = stationName?.toUpperCase() || '';
        if (PRESET_STATIONS_FTY.includes(s) && !PRESET_STATIONS_FMS.includes(s)) return 'FTY';
        return 'FMS'; 
    }

    function addRow() { interventions = [...interventions, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }]; }
    function removeRow(index) { interventions = interventions.filter((_, i) => i !== index); }
    function handleStationChange(index, value) {
        interventions[index].station = value.toUpperCase();
        interventions[index].zone = detectZone(value);
    }

    function addRowAM() { interventionsAM = [...interventionsAM, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }]; }
    function removeRowAM(index) { interventionsAM = interventionsAM.filter((_, i) => i !== index); }
    function handleStationChangeAM(index, value) {
        interventionsAM[index].station = value.toUpperCase();
        interventionsAM[index].zone = detectZone(value);
    }

    function getStationsWithInterventions(zone, period) {
        const sourceInterventions = period === 'afternoon' ? interventionsAM : interventions;
        const stationsWithData = new Set();
        sourceInterventions.filter(i => i.zone === zone && i.station.trim() !== '').forEach(i => stationsWithData.add(i.station));
        return Array.from(stationsWithData).sort();
    }

    function highlightRoles(text) {
        if (!text) return "";
        const roles = ["ACP", "CPI", "OPI", "SPI", "PA", "Team Leader", "MPI", "10-18"];
        const regex = new RegExp(`\\b(${roles.join('|')})\\b`, 'gi');
        return text.replace(regex, '<b>$1</b>');
    }

    function getStationText(stationCode, zoneFilter = null, period = 'morning', forHtml = false) {
        const sourceInterventions = period === 'afternoon' ? interventionsAM : interventions;
        const matches = sourceInterventions.filter(i => i.station === stationCode && (zoneFilter ? i.zone === zoneFilter : true));
        if (matches.length === 0) return "///";

        return matches.map(m => {
            const details = m.pmr_details ? m.pmr_details : "";
            const assignee = m.assigned_to ? `(${m.assigned_to})` : "";
            let fullText = `${details} ${assignee}`.trim();
            if (forHtml) fullText = highlightRoles(fullText);
            return fullText;
        }).join(forHtml ? '<br/>' : '\n');
    }

    // --- SUPABASE ---
    async function loadDailyReport() {
        loading = true;
        try {
            const { data: report } = await supabase.from('daily_movements').select('*').eq('date', date).single();
            if (report) {
                presenceMons = report.presence_mons || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournai = report.presence_tournai || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceMonsAM = report.presence_mons_am || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournaiAM = report.presence_tournai_am || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
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
                interventions = []; interventionsAM = [];
            }
            if (interventions.length === 0) addRow();
            if (interventionsAM.length === 0) addRowAM();
        } catch (e) { console.error(e); } finally { loading = false; }
    }

    async function saveData() {
        loading = true;
        try {
            const { data: report, error: errRep } = await supabase.from('daily_movements').upsert({
                date, presence_mons: presenceMons, presence_tournai: presenceTournai,
                presence_mons_am: presenceMonsAM, presence_tournai_am: presenceTournaiAM
            }, { onConflict: 'date' }).select().single();
            if (errRep) throw errRep;

            await supabase.from('movement_interventions').delete().eq('movement_id', report.id);
            const validLinesMorning = interventions.filter(i => i.station.trim() !== '').map(i => ({ ...i, movement_id: report.id, period: 'morning' }));
            const validLinesAfternoon = interventionsAM.filter(i => i.station.trim() !== '').map(i => ({ ...i, movement_id: report.id, period: 'afternoon' }));
            const allValidLines = [...validLinesMorning, ...validLinesAfternoon];

            if (allValidLines.length > 0) {
                const { error: errLines } = await supabase.from('movement_interventions').insert(allValidLines);
                if (errLines) throw errLines;
            }
            toast.success("Sauvegardé !");
        } catch (e) { toast.error("Erreur : " + e.message); } finally { loading = false; }
    }

    // --- EMAIL OUTLOOK (FIX: TABLES & INLINE STYLES ONLY) ---
    async function copyForOutlook() {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dateSubject = `${day}-${month}-${year}`;
        const formattedDate = d.toLocaleDateString('fr-BE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Helper pour générer une ligne de statistiques en HTML propre
        const formatStatsHtml = (data) => {
            const badges = Object.entries(data).map(([k, v]) => {
                const valColor = v === 0 ? COLORS.zeroRed : '#000000';
                const label = k.replace('shift_', '').toUpperCase();
                return `
                    <td style="padding: 0 10px; text-align: center;">
                        <div style="background-color: ${COLORS.presenceBadgeBg}; border-radius: 8px; padding: 5px 10px; font-family: Helvetica, Arial, sans-serif; font-size: 13px;">
                            <span style="font-weight: bold; color: #333;">${label}:</span>
                            <span style="font-weight: bold; color: ${valColor}; margin-left: 3px;">${v}</span>
                        </div>
                    </td>
                `;
            }).join('');
            return `<table border="0" cellpadding="0" cellspacing="0" style="margin: 10px auto;"><tr>${badges}</tr></table>`;
        };

        const renderInterventionRows = (zone, period) => {
            const stations = getStationsWithInterventions(zone, period);
            if (stations.length === 0) {
                return `<tr><td colspan="2" style="padding: 15px; border: 1px solid #ddd; background-color: #f9f9f9; text-align: center; color: #777; font-style: italic;">Aucune intervention</td></tr>`;
            }
            return stations.map((st, i) => `
                <tr style="background-color: ${i % 2 === 0 ? '#f4f8fb' : '#ffffff'};">
                    <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: ${COLORS.monsHex}; width: 120px; vertical-align: top;">${st}</td>
                    <td style="padding: 12px; border: 1px solid #ddd; color: #333; vertical-align: top; line-height: 1.4;">${getStationText(st, zone, period, true)}</td>
                </tr>
            `).join('');
        };

        const html = `
            <!DOCTYPE html>
            <html>
            <body style="font-family: Helvetica, Arial, sans-serif; background-color: #ffffff; margin: 0; padding: 20px;">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 800px; margin: 0 auto; background-color: #ffffff;">
                    
                    <tr>
                        <td align="center" style="padding-bottom: 5px;">
                            <h1 style="color: ${COLORS.sncbHex}; font-size: 24px; font-weight: 900; margin: 0; text-transform: uppercase;">DEPLACEMENTS PMR</h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 30px; border-bottom: 2px solid ${COLORS.sncbHex};">
                            <span style="font-size: 16px; font-weight: bold; color: #333;">${formattedDate}</span>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding-top: 30px; padding-bottom: 15px;">
                            <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td bgcolor="${COLORS.morningBg}" style="padding: 10px 15px; border-radius: 4px; color: #000000; font-weight: bold; font-size: 18px; text-transform: uppercase;">
                                        ☀️ PRESTATION MATIN
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding-top: 15px; color: ${COLORS.monsHex}; font-size: 14px; font-weight: bold;">
                            • Prévu dans Quinyx gare de Mons
                        </td>
                    </tr>
                    <tr><td>${formatStatsHtml(presenceMons)}</td></tr>
                    <tr>
                        <td>
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #ddd;">
                                <thead>
                                    <tr>
                                        <th bgcolor="${COLORS.monsHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.monsHex};">GARE</th>
                                        <th bgcolor="${COLORS.monsHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.monsHex};">INTERVENTIONS (FMS)</th>
                                    </tr>
                                </thead>
                                <tbody>${renderInterventionRows('FMS', 'morning')}</tbody>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding-top: 25px; color: ${COLORS.tournaiHex}; font-size: 14px; font-weight: bold;">
                            • Prévu dans Quinyx gare de Tournai
                        </td>
                    </tr>
                    <tr><td>${formatStatsHtml(presenceTournai)}</td></tr>
                    <tr>
                        <td>
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #ddd;">
                                <thead>
                                    <tr>
                                        <th bgcolor="${COLORS.tournaiHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.tournaiHex};">GARE</th>
                                        <th bgcolor="${COLORS.tournaiHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.tournaiHex};">INTERVENTIONS (FTY)</th>
                                    </tr>
                                </thead>
                                <tbody>${renderInterventionRows('FTY', 'morning')}</tbody>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding-top: 40px; padding-bottom: 15px;">
                            <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td bgcolor="${COLORS.afternoonBg}" style="padding: 10px 15px; border-radius: 4px; color: #ffffff; font-weight: bold; font-size: 18px; text-transform: uppercase;">
                                        🌙 PRESTATION APRÈS-MIDI
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding-top: 15px; color: ${COLORS.monsHex}; font-size: 14px; font-weight: bold;">
                            • Prévu dans Quinyx gare de Mons
                        </td>
                    </tr>
                    <tr><td>${formatStatsHtml(presenceMonsAM)}</td></tr>
                    <tr>
                        <td>
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #ddd;">
                                <thead>
                                    <tr>
                                        <th bgcolor="${COLORS.monsHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.monsHex};">GARE</th>
                                        <th bgcolor="${COLORS.monsHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.monsHex};">INTERVENTIONS (FMS)</th>
                                    </tr>
                                </thead>
                                <tbody>${renderInterventionRows('FMS', 'afternoon')}</tbody>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding-top: 25px; color: ${COLORS.tournaiHex}; font-size: 14px; font-weight: bold;">
                            • Prévu dans Quinyx gare de Tournai
                        </td>
                    </tr>
                    <tr><td>${formatStatsHtml(presenceTournaiAM)}</td></tr>
                    <tr>
                        <td>
                            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #ddd;">
                                <thead>
                                    <tr>
                                        <th bgcolor="${COLORS.tournaiHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.tournaiHex};">GARE</th>
                                        <th bgcolor="${COLORS.tournaiHex}" style="padding: 10px; color: #ffffff; text-align: left; font-weight: bold; border: 1px solid ${COLORS.tournaiHex};">INTERVENTIONS (FTY)</th>
                                    </tr>
                                </thead>
                                <tbody>${renderInterventionRows('FTY', 'afternoon')}</tbody>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding-top: 40px; border-top: 2px solid ${COLORS.sncbHex};">
                            <p style="margin: 5px 0; font-size: 12px; color: #555;">• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
                            <p style="margin: 5px 0; font-size: 12px; color: #555;">• Interventions PMR pour B-CS : Voir DICOS.</p>
                            <p style="margin: 15px 0 0 0; font-weight: bold; color: ${COLORS.sncbHex}; font-size: 14px;">📱 L'App DICOS PMR reste la base à consulter</p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml })]);
            toast.success("Copié ! Collez dans Outlook (CTRL+V)");
            window.location.href = `mailto:${EMAIL_TO}?cc=${EMAIL_CC}&subject=${encodeURIComponent(`Déplacement PMR - ${dateSubject}`)}`;
        } catch (err) { toast.error("Erreur : " + err.message); }
    }

    // --- PDF ---
    async function getBase64ImageFromURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image(); img.setAttribute("crossOrigin", "anonymous");
            img.onload = () => {
                const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = reject; img.src = url;
        });
    }

    async function generatePDF() {
        const doc = new jsPDF();
        const formattedDate = new Date(date).toLocaleDateString('fr-BE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        try {
            const logoUrl = window.location.origin + '/Logo_100Y_FR_horiz_blue.png';
            const logoData = await getBase64ImageFromURL(logoUrl);
            doc.addImage(logoData, 'PNG', 10, 10, 50, 0);
        } catch (e) { console.error('Logo error', e); }

        let currentY = 35;
        doc.setTextColor(...COLORS.sncb); doc.setFontSize(22); doc.setFont("helvetica", "bold");
        doc.text("DEPLACEMENTS PMR", 105, 20, { align: 'center' });
        doc.setFontSize(14); doc.setTextColor(0, 0, 0);
        doc.text(formattedDate, 105, 28, { align: 'center' });
        doc.setDrawColor(...COLORS.sncb); doc.setLineWidth(0.5); doc.line(10, 35, 200, 35);
        currentY = 50;

        const drawSection = (title, color) => {
            const rgb = color === COLORS.morningBg ? COLORS.morningBgRGB : COLORS.afternoonBgRGB;
            doc.setFillColor(...rgb); doc.rect(10, currentY, 190, 12, 'F');
            doc.setTextColor(color === COLORS.afternoonBg ? 255 : 0, color === COLORS.afternoonBg ? 255 : 0, color === COLORS.afternoonBg ? 255 : 0);
            doc.setFontSize(14); doc.setFont("helvetica", "bold");
            doc.text(title, 105, currentY + 8, { align: 'center' });
            currentY += 22;
        };

        const drawSub = (title, color) => {
            doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...color);
            doc.text(title, 15, currentY); currentY += 10;
        };

        const drawStats = (dataMap) => {
            const keys = Object.keys(dataMap);
            let x = 20;
            doc.setFontSize(11); doc.setFont("helvetica", "bold");
            
            keys.forEach((k) => {
                const val = dataMap[k];
                const label = k.replace('shift_', '').toUpperCase();
                doc.setFillColor(...COLORS.presenceBadgeBgRGB);
                doc.roundedRect(x, currentY - 5, 32, 8, 2, 2, 'F');
                doc.setTextColor(0,0,0); doc.text(`${label}: `, x + 2, currentY);
                const w = doc.getTextWidth(`${label}: `);
                if (val === 0) doc.setTextColor(...COLORS.zeroRedRGB); else doc.setTextColor(0,0,0);
                doc.text(val.toString(), x + w + 2, currentY);
                x += 37;
            });
            currentY += 20;
        };

        const drawTable = (stations, zone, period, colorHead) => {
            if (stations.length === 0) {
                doc.setFontSize(11); doc.setTextColor(150, 150, 150); doc.setFont("helvetica", "italic");
                doc.text("Aucune intervention", 105, currentY, { align: 'center' });
                currentY += 15; return;
            }
            const rows = stations.map(st => [st, getStationText(st, zone, period, false)]);
            autoTable(doc, {
                startY: currentY, head: [['GARE', `INTERVENTIONS (${zone})`]], body: rows,
                theme: 'striped',
                headStyles: { fillColor: colorHead, textColor: 255, fontStyle: 'bold', minCellHeight: 12, valign: 'middle' },
                bodyStyles: { textColor: 0, minCellHeight: 10, valign: 'middle' },
                columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold', textColor: colorHead } },
                margin: { left: 10, right: 10 }
            });
            currentY = doc.lastAutoTable.finalY + 25;
        };

        if (currentY > 250) { doc.addPage(); currentY = 20; }
        drawSection("PRESTATION MATIN", COLORS.morningBg);
        drawSub("• Prévu dans Quinyx gare de Mons", COLORS.mons);
        drawStats(presenceMons);
        drawTable(getStationsWithInterventions('FMS', 'morning'), 'FMS', 'morning', COLORS.mons);

        if (currentY > 240) { doc.addPage(); currentY = 20; }
        drawSub("• Prévu dans Quinyx gare de Tournai", COLORS.tournai);
        drawStats(presenceTournai);
        drawTable(getStationsWithInterventions('FTY', 'morning'), 'FTY', 'morning', COLORS.tournai);

        doc.addPage(); currentY = 20;
        drawSection("PRESTATION APRES-MIDI", COLORS.afternoonBg);
        drawSub("• Prévu dans Quinyx gare de Mons", COLORS.mons);
        drawStats(presenceMonsAM);
        drawTable(getStationsWithInterventions('FMS', 'afternoon'), 'FMS', 'afternoon', COLORS.mons);

        if (currentY > 240) { doc.addPage(); currentY = 20; }
        drawSub("• Prévu dans Quinyx gare de Tournai", COLORS.tournai);
        drawStats(presenceTournaiAM);
        drawTable(getStationsWithInterventions('FTY', 'afternoon'), 'FTY', 'afternoon', COLORS.tournai);

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont("helvetica", "normal");
            doc.text("• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.", 15, 272);
            doc.text("• Interventions PMR pour B-CS : Voir DICOS.", 15, 277);
            doc.setFontSize(11); doc.setTextColor(...COLORS.sncb); doc.setFont("helvetica", "bold");
            doc.text("IMPORTANT: L'App DICOS PMR reste la base à consulter", 15, 285);
            doc.setFontSize(9); doc.setTextColor(150); doc.setFont("helvetica", "normal");
            doc.text(`Page ${i} / ${pageCount}`, 195, 288, { align: 'right' });
        }
        
        const dSubject = new Date(date);
        const dateStr = `${String(dSubject.getDate()).padStart(2, '0')}-${String(dSubject.getMonth() + 1).padStart(2, '0')}-${dSubject.getFullYear()}`;
        doc.save(`deplacement_pmr_${dateStr}.pdf`);
        toast.success("PDF généré !");
    }
</script>

<div class="space-y-8 p-4 md:p-8 max-w-[1800px] mx-auto pb-32 animate-fade-in">
    <header class="relative flex flex-col md:flex-row md:justify-between md:items-end gap-6 pb-8 overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 rounded-3xl animate-gradient-shift"></div>
        <div class="absolute inset-0 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-sm"></div>

        <div class="relative flex items-center gap-4 p-6">
            <div class="p-4 rounded-2xl text-white shadow-lg animate-pulse-soft" style="background-color: var(--color-primary, #0069B4);">
                <Car class="w-10 h-10" />
            </div>
            <div>
                <h1 class="text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Déplacements PMR</h1>
                <p class="text-slate-400 text-sm mt-2 font-medium">Gestion centralisée des prises en charge</p>
            </div>
        </div>

        <div class="relative flex flex-wrap gap-3 p-6">
            <a href="/deplacements/historique" class="group relative flex items-center gap-2 px-6 py-3 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105" style="background-color: var(--color-surface-200, #334155);">
                <Train class="w-5 h-5" /> Historique
            </a>
            <button onclick={saveData} disabled={loading} class="group relative flex items-center gap-2 px-6 py-3 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50" style="background-color: var(--color-primary, #0069B4);">
                {#if loading}<span class="animate-spin">⏳</span>{:else}<Save class="w-5 h-5" />{/if} Sauvegarder
            </button>
            <button onclick={copyForOutlook} class="group relative flex items-center gap-2 px-6 py-3 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105" style="background-color: var(--color-primary, #0069B4);">
                <Mail class="w-5 h-5" /> Copier pour Outlook
            </button>
            <button onclick={generatePDF} class="group relative flex items-center gap-2 px-6 py-3 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105" style="background-color: var(--color-primary, #0069B4);">
                <FileDown class="w-5 h-5" /> Télécharger PDF
            </button>
        </div>
    </header>

    <div class="relative group">
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
            <label class="text-xs uppercase font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text mb-3 flex items-center gap-2 tracking-widest">
                <Calendar class="w-5 h-5 text-blue-400 animate-pulse-soft" /> Date du rapport
            </label>
            <input 
                type="date" 
                bind:value={date} 
                onchange={loadDailyReport}
                class="datepicker-input w-full max-w-md bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-5 py-3.5 text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer hover:border-blue-600" 
            />
        </div>
    </div>

    <div class="relative group">
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-blue-500/30 rounded-2xl p-8 shadow-2xl">
            <h2 class="text-3xl font-black mb-8 flex items-center gap-3 pb-5 border-b-2 border-gradient-to-r from-blue-500 to-cyan-500">
                <span class="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Prestation matin</span>
            </h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-slate-950/80 border-2 border-blue-500/30 rounded-2xl p-6">
                    <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2"><MapPin class="w-5 h-5 text-blue-400" /> Quinyx gare de Mons</h3>
                    <div class="grid grid-cols-5 gap-3">
                        {#each Object.keys(presenceMons) as key}
                            <div class="bg-slate-900 rounded-xl p-3 border border-blue-500/20 flex flex-col items-center">
                                <span class="text-[10px] uppercase text-blue-300 font-bold mb-2">{key.replace('shift_', '')}</span>
                                <input type="number" min="0" max="20" bind:value={presenceMons[key]} class="w-full bg-transparent text-center text-lg font-bold text-blue-100 outline-none" />
                            </div>
                        {/each}
                    </div>
                </div>
                <div class="bg-slate-950/80 border-2 border-purple-500/30 rounded-2xl p-6">
                    <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2"><MapPin class="w-5 h-5 text-purple-400" /> Quinyx gare de Tournai</h3>
                    <div class="grid grid-cols-5 gap-3">
                        {#each Object.keys(presenceTournai) as key}
                            <div class="bg-slate-900 rounded-xl p-3 border border-purple-500/20 flex flex-col items-center">
                                <span class="text-[10px] uppercase text-purple-300 font-bold mb-2">{key.replace('shift_', '')}</span>
                                <input type="number" min="0" max="20" bind:value={presenceTournai[key]} class="w-full bg-transparent text-center text-lg font-bold text-purple-100 outline-none" />
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="bg-slate-900/90 backdrop-blur-xl border-2 border-blue-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div class="p-5 border-b-2 border-blue-500/30 flex justify-between items-center bg-slate-950/80">
            <h3 class="font-black text-lg flex items-center gap-3 text-blue-300">Interventions MATIN <span class="bg-blue-600 text-white text-sm px-3 py-1 rounded-full">{interventions.length}</span></h3>
            <button onclick={addRow} class="text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2" style="background-color: var(--color-primary, #0069B4);"><Plus class="w-4 h-4" /> Ajouter</button>
        </div>
        <div class="overflow-x-auto p-4">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="text-blue-300 uppercase text-xs font-black bg-slate-950 border-b border-blue-500/30">
                    <tr><th class="px-4 py-3">Zone</th><th class="px-4 py-3">Gare</th><th class="px-4 py-3 w-96">PMR / Mission</th><th class="px-4 py-3 w-48">Prise en charge</th><th class="px-2 py-3"></th></tr>
                </thead>
                <tbody class="divide-y divide-blue-500/10">
                    {#each interventions as row, i}
                        <tr class="hover:bg-blue-500/5">
                            <td class="p-2"><input bind:value={row.zone} class="w-16 bg-slate-950/50 text-center font-mono border border-blue-500/20 rounded-lg py-1 text-blue-200 outline-none" placeholder="-" /></td>
                            <td class="p-2"><input list="stations" value={row.station} oninput={(e) => handleStationChange(i, e.target.value)} class="w-full bg-slate-950/50 border border-blue-500/20 rounded-lg px-2 py-1 font-bold uppercase text-white outline-none" placeholder="GARE" /></td>
                            <td class="p-2"><input bind:value={row.pmr_details} class="w-full bg-slate-950/50 border border-blue-500/20 rounded-lg px-2 py-1 text-slate-200 outline-none" placeholder="Détails..." /></td>
                            <td class="p-2">
                                <select bind:value={row.assigned_to} class="w-full bg-slate-950/50 border-2 border-blue-500/30 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-blue-500 hover:border-blue-400 transition-colors font-medium">
                                    <option value="">-- Sélectionner --</option>
                                    {#each ASSIGNEES as p}<option value={p} class="bg-slate-800 text-white py-2">{p}</option>{/each}
                                </select>
                            </td>
                            <td class="p-2 text-center"><button onclick={() => removeRow(i)} class="text-slate-500 hover:text-red-400 transition-colors"><Trash2 class="w-4 h-4" /></button></td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>

    <div class="relative group">
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-[#ADBC16]/50 rounded-2xl p-8 shadow-2xl">
            <h2 class="text-3xl font-black mb-8 flex items-center gap-3 pb-5 border-b-2" style="border-image: linear-gradient(to right, #ADBC16, #8a9612) 1;">
                <span class="text-[#ADBC16]">Prestation après-midi</span>
            </h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div class="bg-slate-950/80 border-2 border-blue-500/30 rounded-2xl p-6">
                    <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2"><MapPin class="w-5 h-5 text-blue-400" /> Quinyx gare de Mons</h3>
                    <div class="grid grid-cols-5 gap-3">
                        {#each Object.keys(presenceMonsAM) as key}
                            <div class="bg-slate-900 rounded-xl p-3 border border-blue-500/20 flex flex-col items-center">
                                <span class="text-[10px] uppercase text-blue-300 font-bold mb-2">{key.replace('shift_', '')}</span>
                                <input type="number" min="0" max="20" bind:value={presenceMonsAM[key]} class="w-full bg-transparent text-center text-lg font-bold text-blue-100 outline-none" />
                            </div>
                        {/each}
                    </div>
                </div>
                <div class="bg-slate-950/80 border-2 border-purple-500/30 rounded-2xl p-6">
                    <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2"><MapPin class="w-5 h-5 text-purple-400" /> Quinyx gare de Tournai</h3>
                    <div class="grid grid-cols-5 gap-3">
                        {#each Object.keys(presenceTournaiAM) as key}
                            <div class="bg-slate-900 rounded-xl p-3 border border-purple-500/20 flex flex-col items-center">
                                <span class="text-[10px] uppercase text-purple-300 font-bold mb-2">{key.replace('shift_', '')}</span>
                                <input type="number" min="0" max="20" bind:value={presenceTournaiAM[key]} class="w-full bg-transparent text-center text-lg font-bold text-purple-100 outline-none" />
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="bg-slate-900/90 backdrop-blur-xl border-2 border-[#ADBC16]/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div class="p-5 border-b-2 border-[#ADBC16]/50 flex justify-between items-center bg-slate-950/80">
            <h3 class="font-black text-lg flex items-center gap-3 text-[#ADBC16]">Interventions APRÈS-MIDI <span class="bg-[#ADBC16] text-white text-sm px-3 py-1 rounded-full">{interventionsAM.length}</span></h3>
            <button onclick={addRowAM} class="text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2" style="background-color: #ADBC16;"><Plus class="w-4 h-4" /> Ajouter</button>
        </div>
        <div class="overflow-x-auto p-4">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="text-[#ADBC16] uppercase text-xs font-black bg-slate-950 border-b border-[#ADBC16]/50">
                    <tr><th class="px-4 py-3">Zone</th><th class="px-4 py-3">Gare</th><th class="px-4 py-3 w-96">PMR / Mission</th><th class="px-4 py-3 w-48">Prise en charge</th><th class="px-2 py-3"></th></tr>
                </thead>
                <tbody class="divide-y divide-[#ADBC16]/10">
                    {#each interventionsAM as row, i}
                        <tr class="hover:bg-[#ADBC16]/5">
                            <td class="p-2"><input bind:value={row.zone} class="w-16 bg-slate-950/50 text-center font-mono border border-[#ADBC16]/20 rounded-lg py-1 text-[#ADBC16] outline-none" placeholder="-" /></td>
                            <td class="p-2"><input list="stations" value={row.station} oninput={(e) => handleStationChangeAM(i, e.target.value)} class="w-full bg-slate-950/50 border border-[#ADBC16]/20 rounded-lg px-2 py-1 font-bold uppercase text-white outline-none" placeholder="GARE" /></td>
                            <td class="p-2"><input bind:value={row.pmr_details} class="w-full bg-slate-950/50 border border-[#ADBC16]/20 rounded-lg px-2 py-1 text-slate-200 outline-none" placeholder="Détails..." /></td>
                            <td class="p-2">
                                <select bind:value={row.assigned_to} class="w-full bg-slate-950/50 border-2 border-[#ADBC16]/30 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-[#ADBC16] hover:border-[#ADBC16]/70 transition-colors font-medium">
                                    <option value="">-- Sélectionner --</option>
                                    {#each ASSIGNEES as p}<option value={p} class="bg-slate-800 text-white py-2">{p}</option>{/each}
                                </select>
                            </td>
                            <td class="p-2 text-center"><button onclick={() => removeRowAM(i)} class="text-slate-500 hover:text-red-400 transition-colors"><Trash2 class="w-4 h-4" /></button></td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>

    <div class="relative group mt-8">
        <div class="bg-slate-900/90 border-2 border-yellow-500/30 rounded-2xl p-6 shadow-2xl flex items-start gap-4">
            <div class="p-3 bg-yellow-500 rounded-xl shadow-lg"><Briefcase class="w-6 h-6 text-white" /></div>
            <div class="text-sm space-y-2">
                <p class="text-slate-300">Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
                <p class="text-slate-300">Interventions PMR pour B-CS : Voir DICOS.</p>
                <p class="font-black text-yellow-400 mt-2">L'App DICOS PMR reste la base à consulter</p>
            </div>
        </div>
    </div>
</div>

<datalist id="stations">{#each stationList as s}<option value={s.abbreviation} />{/each}</datalist>

<style>
    .animate-fade-in { animation: fadeIn 0.6s ease-out; }
    .animate-pulse-soft { animation: pulseSoft 3s ease-in-out infinite; }
    .animate-gradient-shift { background-size: 200% 200%; animation: gradientShift 15s ease infinite; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulseSoft { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.03); } }
    @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
    
    /* DatePicker Visibility Fix - Force white icon */
    .datepicker-input {
        color-scheme: dark;
    }
    
    .datepicker-input::-webkit-calendar-picker-indicator {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" viewBox="0 0 24 24"><path fill="%23ffffff" d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/></svg>');
        cursor: pointer;
        opacity: 1;
        width: 24px;
        height: 24px;
    }
    
    input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type="number"] { -moz-appearance: textfield; }
    
    select option { padding: 10px; }
    select:focus { outline: none; }
</style>