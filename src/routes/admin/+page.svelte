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

    // Couleurs "Solid" pour PDF et Email (Pas de CSS Vars ici car export externe)
    const EXPORT_COLORS = {
        sncb: '#0069B4',
        mons: '#002050',
        tournai: '#998abe',
        red: '#be4366',
        morning: '#d1b4d4',
        afternoon: '#ADBC16', // Vert/Kaki demandé
        badge: '#e5e7eb'
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

    // --- EMAIL OUTLOOK (FULL TABLE REWRITE) ---
    async function copyForOutlook() {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dateSubject = `${day}-${month}-${year}`;
        const formattedDate = d.toLocaleDateString('fr-BE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Générateur de badges stats en TABLE pour Outlook
        const renderStatsTable = (data) => {
            let cells = '';
            Object.entries(data).forEach(([k, v]) => {
                const valColor = v === 0 ? EXPORT_COLORS.red : '#000000';
                const label = k.replace('shift_', '').toUpperCase();
                cells += `
                    <td align="center" style="padding: 0 10px;">
                        <table border="0" cellspacing="0" cellpadding="0" style="background-color: ${EXPORT_COLORS.badge}; border-radius: 6px;">
                            <tr>
                                <td style="padding: 6px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: bold; color: #333333;">
                                    ${label}: <span style="color: ${valColor}; margin-left: 4px;">${v}</span>
                                </td>
                            </tr>
                        </table>
                    </td>
                `;
            });
            return `<table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 15px auto;"><tr>${cells}</tr></table>`;
        };

        const renderTable = (zone, period) => {
            const stations = getStationsWithInterventions(zone, period);
            const headerColor = zone === 'FMS' ? EXPORT_COLORS.mons : EXPORT_COLORS.tournai;
            
            let rowsHtml = '';
            if (stations.length === 0) {
                rowsHtml = `<tr><td colspan="2" style="padding:15px; text-align:center; color:#777; background-color:#f9f9f9; border:1px solid #ddd; font-style:italic;">Aucune intervention</td></tr>`;
            } else {
                stations.forEach((st, i) => {
                    const bg = i % 2 === 0 ? '#f4f8fb' : '#ffffff';
                    rowsHtml += `
                        <tr>
                            <td style="padding:10px; border:1px solid #ddd; background-color:${bg}; font-weight:bold; color:${headerColor}; width:120px; vertical-align:top;">${st}</td>
                            <td style="padding:10px; border:1px solid #ddd; background-color:${bg}; color:#333; vertical-align:top;">${getStationText(st, zone, period, true)}</td>
                        </tr>
                    `;
                });
            }

            return `
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin-bottom:30px;">
                    <thead>
                        <tr>
                            <th align="left" style="padding:12px; background-color:${headerColor}; color:#fff; font-weight:bold;">GARE</th>
                            <th align="left" style="padding:12px; background-color:${headerColor}; color:#fff; font-weight:bold;">INTERVENTIONS (${zone})</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
        };

        const html = `
            <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
            </head>
            <body style="margin: 0; padding: 20px; font-family: Helvetica, Arial, sans-serif; background-color: #ffffff;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 800px; background-color: #ffffff;">
                    <tr><td align="center" style="color:${EXPORT_COLORS.sncb}; font-size:24px; font-weight:900;">DEPLACEMENTS PMR</td></tr>
                    <tr><td align="center" style="padding-bottom:30px; border-bottom:2px solid ${EXPORT_COLORS.sncb}; font-size:16px; font-weight:bold; color:#000;">${formattedDate}</td></tr>
                    
                    <tr><td height="30" style="font-size:0; line-height:0;">&nbsp;</td></tr>

                    <tr>
                        <td>
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="background-color:${EXPORT_COLORS.morning}; padding:10px 15px; font-size:18px; font-weight:bold; text-transform:uppercase; color:#000;">PRESTATION MATIN</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr><td style="padding-top:20px; color:${EXPORT_COLORS.mons}; font-size:14px; font-weight:bold;">• Prévu dans Quinyx gare de Mons</td></tr>
                    <tr><td>${renderStatsTable(presenceMons)}</td></tr>
                    <tr><td>${renderTable('FMS', 'morning')}</td></tr>

                    <tr><td style="padding-top:10px; color:${EXPORT_COLORS.tournai}; font-size:14px; font-weight:bold;">• Prévu dans Quinyx gare de Tournai</td></tr>
                    <tr><td>${renderStatsTable(presenceTournai)}</td></tr>
                    <tr><td>${renderTable('FTY', 'morning')}</td></tr>

                    <tr><td height="40" style="font-size:0; line-height:0;">&nbsp;</td></tr>

                    <tr>
                        <td>
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="background-color:${EXPORT_COLORS.afternoon}; padding:10px 15px; font-size:18px; font-weight:bold; text-transform:uppercase; color:#fff;">PRESTATION APRÈS-MIDI</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr><td style="padding-top:20px; color:${EXPORT_COLORS.mons}; font-size:14px; font-weight:bold;">• Prévu dans Quinyx gare de Mons</td></tr>
                    <tr><td>${renderStatsTable(presenceMonsAM)}</td></tr>
                    <tr><td>${renderTable('FMS', 'afternoon')}</td></tr>

                    <tr><td style="padding-top:10px; color:${EXPORT_COLORS.tournai}; font-size:14px; font-weight:bold;">• Prévu dans Quinyx gare de Tournai</td></tr>
                    <tr><td>${renderStatsTable(presenceTournaiAM)}</td></tr>
                    <tr><td>${renderTable('FTY', 'afternoon')}</td></tr>

                    <tr>
                        <td style="border-top:2px solid ${EXPORT_COLORS.sncb}; padding-top:20px; font-size:12px; color:#555;">
                            <p style="margin:5px 0;">• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
                            <p style="margin:5px 0;">• Interventions PMR pour B-CS : Voir DICOS.</p>
                            <p style="margin:15px 0 0 0; font-size:14px; font-weight:bold; color:${EXPORT_COLORS.sncb};">IMPORTANT: L'App DICOS PMR reste la base à consulter</p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml })]);
            toast.success("Copié pour Outlook (CTRL+V)");
            window.location.href = `mailto:${EMAIL_TO}?cc=${EMAIL_CC}&subject=${encodeURIComponent(`Déplacement PMR - ${dateSubject}`)}`;
        } catch (err) { toast.error("Erreur : " + err.message); }
    }

    // --- PDF (Reste inchangé car fonctionnel) ---
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
        } catch (e) { }

        let currentY = 35;
        doc.setTextColor(EXPORT_COLORS.sncb); doc.setFontSize(22); doc.setFont("helvetica", "bold");
        doc.text("DEPLACEMENTS PMR", 105, 20, { align: 'center' });
        doc.setFontSize(14); doc.setTextColor(0, 0, 0);
        doc.text(formattedDate, 105, 28, { align: 'center' });
        doc.setDrawColor(EXPORT_COLORS.sncb); doc.setLineWidth(0.5); doc.line(10, 35, 200, 35);
        currentY = 50;

        const drawSection = (title, color) => {
            const isAfternoon = color === EXPORT_COLORS.afternoon;
            // Conversion Hex -> RGB manuel pour jspdf si besoin, mais hex passe souvent
            doc.setFillColor(color); 
            doc.rect(10, currentY, 190, 12, 'F');
            doc.setTextColor(isAfternoon ? 255 : 0, isAfternoon ? 255 : 0, isAfternoon ? 255 : 0);
            doc.setFontSize(14); doc.setFont("helvetica", "bold");
            doc.text(title, 105, currentY + 8, { align: 'center' });
            currentY += 22;
        };

        const drawSub = (title, color) => {
            doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(color);
            doc.text(title, 15, currentY); currentY += 10;
        };

        const drawStats = (dataMap) => {
            const keys = Object.keys(dataMap);
            let x = 20;
            doc.setFontSize(11); doc.setFont("helvetica", "bold");
            keys.forEach((k) => {
                const val = dataMap[k];
                const label = k.replace('shift_', '').toUpperCase();
                doc.setFillColor(EXPORT_COLORS.badge);
                doc.roundedRect(x, currentY - 5, 32, 8, 2, 2, 'F');
                doc.setTextColor(0,0,0); doc.text(`${label}: `, x + 2, currentY);
                const w = doc.getTextWidth(`${label}: `);
                if (val === 0) doc.setTextColor(EXPORT_COLORS.red); else doc.setTextColor(0,0,0);
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
                headStyles: { fillColor: colorHead, textColor: 255, fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold', textColor: colorHead } },
                margin: { left: 10, right: 10 }
            });
            currentY = doc.lastAutoTable.finalY + 25;
        };

        if (currentY > 250) { doc.addPage(); currentY = 20; }
        drawSection("PRESTATION MATIN", EXPORT_COLORS.morning);
        drawSub("• Prévu dans Quinyx gare de Mons", EXPORT_COLORS.mons);
        drawStats(presenceMons);
        drawTable(getStationsWithInterventions('FMS', 'morning'), 'FMS', 'morning', EXPORT_COLORS.mons);

        if (currentY > 240) { doc.addPage(); currentY = 20; }
        drawSub("• Prévu dans Quinyx gare de Tournai", EXPORT_COLORS.tournai);
        drawStats(presenceTournai);
        drawTable(getStationsWithInterventions('FTY', 'morning'), 'FTY', 'morning', EXPORT_COLORS.tournai);

        doc.addPage(); currentY = 20;
        drawSection("PRESTATION APRES-MIDI", EXPORT_COLORS.afternoon);
        drawSub("• Prévu dans Quinyx gare de Mons", EXPORT_COLORS.mons);
        drawStats(presenceMonsAM);
        drawTable(getStationsWithInterventions('FMS', 'afternoon'), 'FMS', 'afternoon', EXPORT_COLORS.mons);

        if (currentY > 240) { doc.addPage(); currentY = 20; }
        drawSub("• Prévu dans Quinyx gare de Tournai", EXPORT_COLORS.tournai);
        drawStats(presenceTournaiAM);
        drawTable(getStationsWithInterventions('FTY', 'afternoon'), 'FTY', 'afternoon', EXPORT_COLORS.tournai);

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont("helvetica", "normal");
            doc.text("• Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.", 15, 272);
            doc.text("• Interventions PMR pour B-CS : Voir DICOS.", 15, 277);
            doc.setFontSize(11); doc.setTextColor(EXPORT_COLORS.sncb); doc.setFont("helvetica", "bold");
            doc.text("IMPORTANT: L'App DICOS PMR reste la base à consulter", 15, 285);
            doc.setFontSize(9); doc.setTextColor(150); doc.setFont("helvetica", "normal");
            doc.text(`Page ${i} / ${pageCount}`, 195, 288, { align: 'right' });
        }
        
        doc.save(`deplacement_pmr_${date}.pdf`);
        toast.success("PDF généré !");
    }
</script>

<div class="space-y-8 p-4 md:p-8 max-w-[1800px] mx-auto pb-32 animate-fade-in">
    <header class="relative flex flex-col md:flex-row md:justify-between md:items-end gap-6 pb-8 overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 rounded-3xl animate-gradient-shift"></div>
        <div class="absolute inset-0 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-sm"></div>

        <div class="relative flex items-center gap-4 p-6">
            <div class="p-4 rounded-2xl text-white shadow-lg animate-pulse-soft" style="background-color: var(--color-primary);">
                <Car class="w-10 h-10" />
            </div>
            <div>
                <h1 class="text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Déplacements PMR</h1>
                <p class="text-slate-400 text-sm mt-2 font-medium">Gestion centralisée des prises en charge</p>
            </div>
        </div>

        <div class="relative flex flex-wrap gap-3 p-6">
            <a href="/deplacements/historique" class="btn-action bg-slate-700 hover:bg-slate-600">
                <Train class="w-5 h-5" /> Historique
            </a>
            <button onclick={saveData} disabled={loading} class="btn-action primary">
                {#if loading}<span class="animate-spin">⏳</span>{:else}<Save class="w-5 h-5" />{/if} Sauvegarder
            </button>
            <button onclick={copyForOutlook} class="btn-action primary">
                <Mail class="w-5 h-5" /> Copier pour Outlook
            </button>
            <button onclick={generatePDF} class="btn-action primary">
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
                                <input type="number" min="0" max="20" bind:value={presenceMons[key]} class="input-number" />
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
                                <input type="number" min="0" max="20" bind:value={presenceTournai[key]} class="input-number" />
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
            <button onclick={addRow} class="btn-action primary compact"><Plus class="w-4 h-4" /> Ajouter</button>
        </div>
        <div class="overflow-x-auto p-4">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="text-blue-300 uppercase text-xs font-black bg-slate-950 border-b border-blue-500/30">
                    <tr><th class="px-4 py-3">Zone</th><th class="px-4 py-3">Gare</th><th class="px-4 py-3 w-96">PMR / Mission</th><th class="px-4 py-3 w-48">Prise en charge</th><th class="px-2 py-3"></th></tr>
                </thead>
                <tbody class="divide-y divide-blue-500/10">
                    {#each interventions as row, i}
                        <tr class="hover:bg-blue-500/5">
                            <td class="p-2"><input bind:value={row.zone} class="input-table w-16 text-center text-blue-200" placeholder="-" /></td>
                            <td class="p-2"><input list="stations" value={row.station} oninput={(e) => handleStationChange(i, e.target.value)} class="input-table font-bold uppercase text-white" placeholder="GARE" /></td>
                            <td class="p-2"><input bind:value={row.pmr_details} class="input-table text-slate-200" placeholder="Détails..." /></td>
                            <td class="p-2">
                                <select bind:value={row.assigned_to} class="input-table text-slate-200">
                                    <option value="">--</option>
                                    {#each ASSIGNEES as p}<option value={p} class="bg-slate-800">{p}</option>{/each}
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
                                <input type="number" min="0" max="20" bind:value={presenceMonsAM[key]} class="input-number" />
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
                                <input type="number" min="0" max="20" bind:value={presenceTournaiAM[key]} class="input-number" />
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
            <button onclick={addRowAM} class="btn-action compact text-white bg-[#ADBC16] hover:bg-[#8a9612]"><Plus class="w-4 h-4" /> Ajouter</button>
        </div>
        <div class="overflow-x-auto p-4">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="text-[#ADBC16] uppercase text-xs font-black bg-slate-950 border-b border-[#ADBC16]/50">
                    <tr><th class="px-4 py-3">Zone</th><th class="px-4 py-3">Gare</th><th class="px-4 py-3 w-96">PMR / Mission</th><th class="px-4 py-3 w-48">Prise en charge</th><th class="px-2 py-3"></th></tr>
                </thead>
                <tbody class="divide-y divide-[#ADBC16]/10">
                    {#each interventionsAM as row, i}
                        <tr class="hover:bg-[#ADBC16]/5">
                            <td class="p-2"><input bind:value={row.zone} class="input-table w-16 text-center text-[#ADBC16]" placeholder="-" /></td>
                            <td class="p-2"><input list="stations" value={row.station} oninput={(e) => handleStationChangeAM(i, e.target.value)} class="input-table font-bold uppercase text-white" placeholder="GARE" /></td>
                            <td class="p-2"><input bind:value={row.pmr_details} class="input-table text-slate-200" placeholder="Détails..." /></td>
                            <td class="p-2">
                                <select bind:value={row.assigned_to} class="input-table text-slate-200">
                                    <option value="">--</option>
                                    {#each ASSIGNEES as p}<option value={p} class="bg-slate-800">{p}</option>{/each}
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
    /* UTILS */
    .animate-fade-in { animation: fadeIn 0.6s ease-out; }
    .animate-pulse-soft { animation: pulseSoft 3s ease-in-out infinite; }
    .animate-gradient-shift { background-size: 200% 200%; animation: gradientShift 15s ease infinite; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulseSoft { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.03); } }
    @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    /* COMPONENTS */
    .btn-action {
        display: flex; align-items: center; gap: 0.5rem;
        padding: 0.75rem 1.5rem; border-radius: 0.75rem;
        color: white; font-weight: bold; transition: all 0.2s;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .btn-action:hover { transform: scale(1.05); }
    .btn-action.compact { padding: 0.5rem 1rem; font-size: 0.875rem; }
    .btn-action.primary { background-color: var(--color-primary, #0069B4); }
    .btn-action.primary:hover { filter: brightness(1.1); }

    .input-number {
        width: 100%; background: transparent; text-align: center;
        font-size: 1.125rem; font-weight: bold; color: inherit; outline: none;
    }
    .input-table {
        width: 100%; background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 0.5rem; padding: 0.5rem;
        outline: none; transition: border-color 0.2s;
    }
    .input-table:focus { border-color: var(--color-primary, #0069B4); }

    /* FIX DATEPICKER ICON */
    .datepicker-input { color-scheme: dark; }
    
    input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type="number"] { -moz-appearance: textfield; }
</style>