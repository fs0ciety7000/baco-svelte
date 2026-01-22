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
        Users,
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
        sncb: [0, 105, 180], // #0069B4
        sncbHex: '#0069B4',
        mons: [0, 32, 80],   // #002050
        monsHex: '#002050',
        tournai: [153, 138, 190], // #998abe
        tournaiHex: '#998abe', 
        zeroRed: '#be4366',
        zeroRedRGB: [190, 67, 102],
        morningBg: '#d1b4d4',
        afternoonBg: '#ADBC16',  // RGB(173, 188, 22) - UPDATED
        afternoonBgRGB: [173, 188, 22],  // NEW
        presenceBadgeBg: '#e5e7eb',  // NEW - neutral background for badges
        presenceBadgeBgRGB: [229, 231, 235]  // NEW
    };

    const EMAIL_TO = "cedric.thiels@belgiantrain.be;luc.deconinck@belgiantrain.be;b4u.mons@belgiantrain.be;paco.mons@belgiantrain.be;785um.OUMonsPermanence@belgiantrain.be;gare.mons.quai@belgiantrain.be;785ut.OUTournaiPermanence@belgiantrain.be;gare.tournai.quai@belgiantrain.be;gare.braine.le.comte.quai@belgiantrain.be";
    const EMAIL_CC = "mathieu.debaisieux@belgiantrain.be";

    // --- ÉTAT (Svelte 5 Runes) ---
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

    // Regex pour mettre en gras les rôles (HTML uniquement)
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

    // --- EMAIL OUTLOOK ---
    async function copyForOutlook() {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dateSubject = `${day}-${month}-${year}`;
        const formattedDate = d.toLocaleDateString('fr-BE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const formatStatsHtml = (data) => {
            return Object.entries(data).map(([k, v]) => {
                const valColor = v === 0 ? COLORS.zeroRed : '#000000';
                return `<span style="margin: 0 10px; font-weight: bold; padding: 8px 15px; background-color: ${COLORS.presenceBadgeBg}; border-radius: 8px; display: inline-block;">${k.replace('shift_', '').toUpperCase()}: <span style="color: ${valColor};">${v}</span></span>`;
            }).join('');
        };

        const containerStyle = `font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #000; background-color: #fff; padding: 20px;`;
        const headerStyle = `color: ${COLORS.sncbHex}; font-size: 22pt; font-weight: bold; text-align: center; margin-bottom: 5px;`;
        const dateStyle = `color: #000; font-size: 12pt; font-weight: bold; text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${COLORS.sncbHex}; padding-bottom: 10px;`;
        const sectionTitleStyle = (color) => `background-color: ${color}; color: ${color === COLORS.afternoonBg ? '#fff' : '#000'}; padding: 12px 15px; font-weight: bold; font-size: 14pt; margin-top: 30px; margin-bottom: 20px; text-transform: uppercase;`;
        const subTitleStyle = (color) => `color: ${color}; font-weight: bold; font-size: 12pt; margin-top: 20px; margin-bottom: 10px; padding-left: 10px; border-left: 4px solid ${color};`;
        const statStyle = `font-size: 14pt; text-align: center; margin: 20px 0; padding: 15px;`;
        const tableStyle = `width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 15px; margin-bottom: 25px;`;
        const thStyle = (color) => `background-color: ${color}; color: #fff; font-weight: bold; padding: 12px; text-align: left; border: 1px solid ${color};`;
        const tdStyle = `padding: 12px; border: 1px solid #ccc; vertical-align: top;`;
        const noInterventionStyle = `text-align: center; font-style: italic; color: #999; padding: 15px;`;

        const html = `
            <div style="${containerStyle}">
                <img src="cid:logo" alt="SNCB Logo" style="max-width: 200px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;" />
                <div style="${headerStyle}">DEPLACEMENTS PMR</div>
                <div style="${dateStyle}">${formattedDate}</div>

                <div style="${sectionTitleStyle(COLORS.morningBg)}">☀️ PRESTATION MATIN</div>
                
                <div style="${subTitleStyle(COLORS.monsHex)}">📍 Prévu dans Quinyx gare de Mons</div>
                <div style="${statStyle}">${formatStatsHtml(presenceMons)}</div>
                <table style="${tableStyle}">
                    <thead><tr><th style="${thStyle(COLORS.monsHex)} width: 120px;">GARE</th><th style="${thStyle(COLORS.monsHex)}">INTERVENTIONS (FMS)</th></tr></thead>
                    <tbody>${(() => {
                        const stations = getStationsWithInterventions('FMS', 'morning');
                        if (stations.length === 0) return `<tr><td colspan="2" style="${tdStyle} ${noInterventionStyle}">Aucune intervention</td></tr>`;
                        return stations.map((st, i) => `<tr style="background-color:${i%2===0?'#f0f9ff':'#fff'}"><td style="${tdStyle} font-weight:bold; color:${COLORS.monsHex}">${st}</td><td style="${tdStyle}">${getStationText(st, 'FMS', 'morning', true)}</td></tr>`).join('');
                    })()}</tbody>
                </table>

                <div style="${subTitleStyle(COLORS.tournaiHex)}">📍 Prévu dans Quinyx gare de Tournai</div>
                <div style="${statStyle}">${formatStatsHtml(presenceTournai)}</div>
                <table style="${tableStyle}">
                    <thead><tr><th style="${thStyle(COLORS.tournaiHex)} width: 120px;">GARE</th><th style="${thStyle(COLORS.tournaiHex)}">INTERVENTIONS (FTY)</th></tr></thead>
                    <tbody>${(() => {
                        const stations = getStationsWithInterventions('FTY', 'morning');
                        if (stations.length === 0) return `<tr><td colspan="2" style="${tdStyle} ${noInterventionStyle}">Aucune intervention</td></tr>`;
                        return stations.map((st, i) => `<tr style="background-color:${i%2===0?'#faf5ff':'#fff'}"><td style="${tdStyle} font-weight:bold; color:${COLORS.tournaiHex}">${st}</td><td style="${tdStyle}">${getStationText(st, 'FTY', 'morning', true)}</td></tr>`).join('');
                    })()}</tbody>
                </table>

                <div style="${sectionTitleStyle(COLORS.afternoonBg)}">🌙 PRESTATION APRÈS-MIDI</div>

                <div style="${subTitleStyle(COLORS.monsHex)}">📍 Prévu dans Quinyx gare de Mons</div>
                <div style="${statStyle}">${formatStatsHtml(presenceMonsAM)}</div>
                <table style="${tableStyle}">
                    <thead><tr><th style="${thStyle(COLORS.monsHex)} width: 120px;">GARE</th><th style="${thStyle(COLORS.monsHex)}">INTERVENTIONS (FMS)</th></tr></thead>
                    <tbody>${(() => {
                        const stations = getStationsWithInterventions('FMS', 'afternoon');
                        if (stations.length === 0) return `<tr><td colspan="2" style="${tdStyle} ${noInterventionStyle}">Aucune intervention</td></tr>`;
                        return stations.map((st, i) => `<tr style="background-color:${i%2===0?'#f0f9ff':'#fff'}"><td style="${tdStyle} font-weight:bold; color:${COLORS.monsHex}">${st}</td><td style="${tdStyle}">${getStationText(st, 'FMS', 'afternoon', true)}</td></tr>`).join('');
                    })()}</tbody>
                </table>

                <div style="${subTitleStyle(COLORS.tournaiHex)}">📍 Prévu dans Quinyx gare de Tournai</div>
                <div style="${statStyle}">${formatStatsHtml(presenceTournaiAM)}</div>
                <table style="${tableStyle}">
                    <thead><tr><th style="${thStyle(COLORS.tournaiHex)} width: 120px;">GARE</th><th style="${thStyle(COLORS.tournaiHex)}">INTERVENTIONS (FTY)</th></tr></thead>
                    <tbody>${(() => {
                        const stations = getStationsWithInterventions('FTY', 'afternoon');
                        if (stations.length === 0) return `<tr><td colspan="2" style="${tdStyle} ${noInterventionStyle}">Aucune intervention</td></tr>`;
                        return stations.map((st, i) => `<tr style="background-color:${i%2===0?'#faf5ff':'#fff'}"><td style="${tdStyle} font-weight:bold; color:${COLORS.tournaiHex}">${st}</td><td style="${tdStyle}">${getStationText(st, 'FTY', 'afternoon', true)}</td></tr>`).join('');
                    })()}</tbody>
                </table>

                <div style="margin-top: 40px; border-top: 1px solid ${COLORS.sncbHex}; padding-top: 15px; font-size: 10pt; color: #333;">
                    <p style="margin: 5px 0;">• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
                    <p style="margin: 5px 0;">• Interventions PMR pour B-CS : Voir DICOS.</p>
                    <p style="margin: 15px 0 0 0; font-weight: bold; color: ${COLORS.sncbHex}; font-size: 11pt;">📱 L'App DICOS PMR reste la base à consulter</p>
                </div>
            </div>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport Déplacement PMR - ' + formattedDate], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
            toast.success("Copié ! FAITES CTRL+V DANS OUTLOOK.");
            
            // Open Outlook with pre-filled email
            const subject = encodeURIComponent(`Déplacement PMR - ${dateSubject}`);
            const body = encodeURIComponent('Bonjour,\n\nVeuillez trouver ci-dessous le rapport des déplacements PMR.\n\nCordialement');
            window.location.href = `mailto:${EMAIL_TO}?cc=${EMAIL_CC}&subject=${subject}&body=${body}`;
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
        } catch (e) { console.error('Logo loading error:', e); }

        let currentY = 35;
        doc.setTextColor(...COLORS.sncb); doc.setFontSize(22); doc.setFont("helvetica", "bold");
        doc.text("DEPLACEMENTS PMR", 105, 20, { align: 'center' });
        doc.setFontSize(14); doc.setTextColor(0, 0, 0);
        doc.text(formattedDate, 105, 28, { align: 'center' });
        doc.setDrawColor(...COLORS.sncb); doc.setLineWidth(0.5); doc.line(10, 35, 200, 35);
        currentY = 50;

        const drawSection = (title, color) => {
            const rgb = color === COLORS.morningBg ? [209, 180, 212] : COLORS.afternoonBgRGB;
            doc.setFillColor(...rgb); doc.rect(10, currentY, 190, 12, 'F');
            doc.setTextColor(color === COLORS.afternoonBg ? 255 : 0, color === COLORS.afternoonBg ? 255 : 0, color === COLORS.afternoonBg ? 255 : 0); 
            doc.setFontSize(14); doc.setFont("helvetica", "bold");
            doc.text(title, 15, currentY + 8); 
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
                
                // Draw badge background
                doc.setFillColor(...COLORS.presenceBadgeBgRGB);
                doc.roundedRect(x, currentY - 5, 32, 8, 2, 2, 'F');
                
                doc.setTextColor(0,0,0); 
                doc.text(`${label}: `, x + 2, currentY);
                const w = doc.getTextWidth(`${label}: `);
                
                if (val === 0) doc.setTextColor(...COLORS.zeroRedRGB); 
                else doc.setTextColor(0,0,0);
                doc.text(val.toString(), x + w + 2, currentY);
                x += 37;
            });
            currentY += 20;
        };

        const drawTable = (stations, zone, period, colorHead) => {
            if (stations.length === 0) {
                // Display "Aucune intervention" message
                doc.setFontSize(11);
                doc.setTextColor(150, 150, 150);
                doc.setFont("helvetica", "italic");
                doc.text("Aucune intervention", 105, currentY, { align: 'center' });
                currentY += 15;
                return;
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
        const stFMS = getStationsWithInterventions('FMS', 'morning');
        drawTable(stFMS, 'FMS', 'morning', COLORS.mons);

        if (currentY > 240) { doc.addPage(); currentY = 20; }
        drawSub("• Prévu dans Quinyx gare de Tournai", COLORS.tournai);
        drawStats(presenceTournai);
        const stFTY = getStationsWithInterventions('FTY', 'morning');
        drawTable(stFTY, 'FTY', 'morning', COLORS.tournai);

        doc.addPage(); currentY = 20;
        drawSection("PRESTATION APRÈS-MIDI", COLORS.afternoonBg);

        drawSub("• Prévu dans Quinyx gare de Mons", COLORS.mons);
        drawStats(presenceMonsAM);
        const stFMS_AM = getStationsWithInterventions('FMS', 'afternoon');
        drawTable(stFMS_AM, 'FMS', 'afternoon', COLORS.mons);

        if (currentY > 240) { doc.addPage(); currentY = 20; }
        drawSub("• Prévu dans Quinyx gare de Tournai", COLORS.tournai);
        drawStats(presenceTournaiAM);
        const stFTY_AM = getStationsWithInterventions('FTY', 'afternoon');
        drawTable(stFTY_AM, 'FTY', 'afternoon', COLORS.tournai);

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i); doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont("helvetica", "normal");
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
            <div class="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg animate-pulse-soft">
                <Car class="w-10 h-10" />
            </div>
            <div>
                <h1 class="text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Déplacements PMR</h1>
                <p class="text-slate-400 text-sm mt-2 font-medium">Gestion centralisée des prises en charge</p>
            </div>
        </div>

        <div class="relative flex flex-wrap gap-3 p-6">
            <a href="/deplacements/historique" class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105">
                <Train class="w-5 h-5" /> Historique
            </a>
            <button onclick={saveData} disabled={loading} class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50">
                {#if loading}<span class="animate-spin">⏳</span>{:else}<Save class="w-5 h-5" />{/if} Sauvegarder
            </button>
            <button onclick={copyForOutlook} class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105">
                <Mail class="w-5 h-5" /> Copier pour Outlook
            </button>
            <button onclick={generatePDF} class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105">
                <FileDown class="w-5 h-5" /> Télécharger PDF
            </button>
        </div>
    </header>

    <div class="relative group">
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
            <label class="text-xs uppercase font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text mb-3 flex items-center gap-2 tracking-widest"><Calendar class="w-5 h-5 text-blue-400 animate-pulse-soft" /> Date du rapport</label>
            <input type="date" bind:value={date} onchange={loadDailyReport} class="w-full max-w-md bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-5 py-3.5 text-lg font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer hover:border-blue-600" />
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
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="20" 
                                    bind:value={presenceMons[key]} 
                                    class="w-full h-2 bg-blue-900 rounded-lg appearance-none cursor-pointer slider-thumb"
                                />
                                <span class="text-lg font-bold text-blue-100 mt-2">{presenceMons[key]}</span>
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
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="20" 
                                    bind:value={presenceTournai[key]} 
                                    class="w-full h-2 bg-purple-900 rounded-lg appearance-none cursor-pointer slider-thumb"
                                />
                                <span class="text-lg font-bold text-purple-100 mt-2">{presenceTournai[key]}</span>
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
            <button onclick={addRow} class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2"><Plus class="w-4 h-4" /> Ajouter</button>
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
                                    {#each ASSIGNEES as p}
                                        <option value={p} class="bg-slate-800 text-white py-2">{p}</option>
                                    {/each}
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
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="20" 
                                    bind:value={presenceMonsAM[key]} 
                                    class="w-full h-2 bg-blue-900 rounded-lg appearance-none cursor-pointer slider-thumb"
                                />
                                <span class="text-lg font-bold text-blue-100 mt-2">{presenceMonsAM[key]}</span>
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
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="20" 
                                    bind:value={presenceTournaiAM[key]} 
                                    class="w-full h-2 bg-purple-900 rounded-lg appearance-none cursor-pointer slider-thumb"
                                />
                                <span class="text-lg font-bold text-purple-100 mt-2">{presenceTournaiAM[key]}</span>
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
            <button onclick={addRowAM} class="bg-[#ADBC16] hover:bg-[#8a9612] text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2"><Plus class="w-4 h-4" /> Ajouter</button>
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
                                    {#each ASSIGNEES as p}
                                        <option value={p} class="bg-slate-800 text-white py-2">{p}</option>
                                    {/each}
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
    
    /* Custom slider styling */
    .slider-thumb::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
    }
    
    .slider-thumb::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
        border: none;
    }
    
    input[type="number"]::-webkit-inner-spin-button, 
    input[type="number"]::-webkit-outer-spin-button { 
        -webkit-appearance: none; 
        margin: 0; 
    }
    input[type="number"] { -moz-appearance: textfield; }
    
    /* Enhanced select styling */
    select option {
        padding: 10px;
    }
    
    select:focus {
        outline: none;
    }
</style>