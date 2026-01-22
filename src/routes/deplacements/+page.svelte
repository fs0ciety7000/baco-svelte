<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import jsPDF from 'jspdf';
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

    // Helper pour générer le texte groupé par gare (pour export)
    function getStationText(stationCode, zoneFilter = null, period = 'morning') {
        const sourceInterventions = period === 'afternoon' ? interventionsAM : interventions;
        const matches = sourceInterventions.filter(i =>
            i.station === stationCode &&
            (zoneFilter ? i.zone === zoneFilter : true)
        );

        if (matches.length === 0) return "///";

        return matches.map(m => {
            const details = m.pmr_details ? m.pmr_details : "";
            const assignee = m.assigned_to ? `(${m.assigned_to})` : "";
            return `${details} ${assignee}`.trim();
        }).join('<br/>      ');
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

    // --- EXPORT OUTLOOK (HTML Clean) ---
    async function copyForOutlook() {
        const formattedDate = new Date(date).toLocaleDateString('fr-BE');

        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; color: #1e293b; background-color: #fff; padding: 20px;">
                <h3 style="color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">
                    Bonjour, voici les déplacements PMR pour ${formattedDate}
                </h3>

                <!-- PRESTATION MATIN FMS -->
                <div style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #eff6ff; padding: 10px 15px; border-bottom: 1px solid #dbeafe;">
                        <span style="color: #1d4ed8; font-weight: bold; font-size: 12pt;">Prestation matin à FMS</span>
                    </div>
                    <div style="padding: 15px;">
                        <div style="margin-bottom: 15px; font-size: 10pt; color: #64748b;">
                            <strong>Prévu dans Quinyx gare de Mons :</strong> SPI:${presenceMons.spi} | OPI:${presenceMons.opi} | CPI:${presenceMons.cpi} | PA:${presenceMons.pa} | 10h-18h:${presenceMons.shift_10_18}
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                            <tbody>
                                ${PRESET_STATIONS_FMS.map(st => {
                                    const txt = getStationText(st, 'FMS', 'morning');
                                    return `<tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 6px 8px; font-weight: bold; width: 80px; color: #475569;">${st}</td>
                                        <td style="padding: 6px 8px; color: #0f172a;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- PRESTATION MATIN FTY -->
                <div style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #f5f3ff; padding: 10px 15px; border-bottom: 1px solid #ede9fe;">
                        <span style="color: #6d28d9; font-weight: bold; font-size: 12pt;">Prestation matin à FTY</span>
                    </div>
                    <div style="padding: 15px;">
                        <div style="margin-bottom: 15px; font-size: 10pt; color: #64748b;">
                            <strong>Prévu dans Quinyx gare de Tournai :</strong> SPI:${presenceTournai.spi} | CPI:${presenceTournai.cpi} | PA:${presenceTournai.pa} | 10h-18h:${presenceTournai.shift_10_18}
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                            <tbody>
                                ${PRESET_STATIONS_FTY.map(st => {
                                    const txt = getStationText(st, 'FTY', 'morning');
                                    return `<tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 6px 8px; font-weight: bold; width: 80px; color: #475569;">${st}</td>
                                        <td style="padding: 6px 8px; color: #0f172a;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- PRESTATION APRÈS-MIDI FMS -->
                <div style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #eff6ff; padding: 10px 15px; border-bottom: 1px solid #dbeafe;">
                        <span style="color: #1d4ed8; font-weight: bold; font-size: 12pt;">Prestation après-midi à FMS</span>
                    </div>
                    <div style="padding: 15px;">
                        <div style="margin-bottom: 15px; font-size: 10pt; color: #64748b;">
                            <strong>Prévu dans Quinyx gare de Mons :</strong> SPI:${presenceMonsAM.spi} | OPI:${presenceMonsAM.opi} | CPI:${presenceMonsAM.cpi} | PA:${presenceMonsAM.pa} | 10h-18h:${presenceMonsAM.shift_10_18}
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                            <tbody>
                                ${PRESET_STATIONS_FMS.map(st => {
                                    const txt = getStationText(st, 'FMS', 'afternoon');
                                    return `<tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 6px 8px; font-weight: bold; width: 80px; color: #475569;">${st}</td>
                                        <td style="padding: 6px 8px; color: #0f172a;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- PRESTATION APRÈS-MIDI FTY -->
                <div style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #f5f3ff; padding: 10px 15px; border-bottom: 1px solid #ede9fe;">
                        <span style="color: #6d28d9; font-weight: bold; font-size: 12pt;">Prestation après-midi à FTY</span>
                    </div>
                    <div style="padding: 15px;">
                        <div style="margin-bottom: 15px; font-size: 10pt; color: #64748b;">
                            <strong>Prévu dans Quinyx gare de Tournai :</strong> SPI:${presenceTournaiAM.spi} | CPI:${presenceTournaiAM.cpi} | PA:${presenceTournaiAM.pa} | 10h-18h:${presenceTournaiAM.shift_10_18}
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                            <tbody>
                                ${PRESET_STATIONS_FTY.map(st => {
                                    const txt = getStationText(st, 'FTY', 'afternoon');
                                    return `<tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 6px 8px; font-weight: bold; width: 80px; color: #475569;">${st}</td>
                                        <td style="padding: 6px 8px; color: #0f172a;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style="font-size: 9pt; color: #94a3b8; font-style: italic; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                    Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.<br/>
                    Interventions PMR pour B-CS : Voir DICOS.<br/><br/>
                    <strong>L'App DICOS PMR reste la base à consulter</strong>
                </div>
            </div>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport Déplacements PMR - ' + formattedDate], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
            toast.success("HTML copié ! Collez-le dans un nouveau mail Outlook (Ctrl+V)");

            // Optionnel : Ouvrir Outlook avec un mailto basique
            const subject = encodeURIComponent(`Déplacements PMR - ${formattedDate}`);
            window.open(`mailto:?subject=${subject}`, '_blank');
        } catch (err) {
            toast.error("Erreur : " + err.message);
        }
    }

    // --- PDF ---
    function generatePDF() {
        const doc = new jsPDF();
        let y = 15;

        const writeText = (txt, size, bold = false, color = [0,0,0], x = 14) => {
            doc.setFontSize(size);
            doc.setFont("helvetica", bold ? "bold" : "normal");
            doc.setTextColor(...color);
            doc.text(txt, x, y);
            y += size/2 + 2;
        };

        const checkPageBreak = () => {
            if (y > 250) {
                doc.addPage();
                y = 15;
            }
        };

        writeText(`Bonjour, voici les déplacements PMR pour`, 14, true);
        writeText(date.split('-').reverse().join('-'), 16, true, [37, 99, 235]);
        y += 5;

        // === MATIN FMS ===
        writeText("Prestation matin à FMS", 12, true, [37, 99, 235]);
        writeText(`Prévu dans Quinyx gare de Mons : SPI:${presenceMons.spi} | OPI:${presenceMons.opi} | CPI:${presenceMons.cpi} | PA:${presenceMons.pa} | 10h-18h:${presenceMons.shift_10_18}`, 9, false, [80,80,80]);
        y += 2;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        PRESET_STATIONS_FMS.forEach(st => {
            const txt = getStationText(st, 'FMS', 'morning').replace(/<br\/>/g, "\n").replace(/<br \/>/g, "\n");
            const plainTxt = `${st}: ${txt}`;
            const split = doc.splitTextToSize(plainTxt, 180);
            doc.text(split, 14, y);
            y += split.length * 4.5;
            checkPageBreak();
        });

        y += 8;
        checkPageBreak();

        // === MATIN FTY ===
        writeText("Prestation matin à FTY", 12, true, [124, 58, 237]);
        writeText(`Prévu dans Quinyx gare de Tournai : SPI:${presenceTournai.spi} | CPI:${presenceTournai.cpi} | PA:${presenceTournai.pa} | 10h-18h:${presenceTournai.shift_10_18}`, 9, false, [80,80,80]);
        y += 2;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        PRESET_STATIONS_FTY.forEach(st => {
            const txt = getStationText(st, 'FTY', 'morning').replace(/<br\/>/g, "\n").replace(/<br \/>/g, "\n");
            const plainTxt = `${st}: ${txt}`;
            const split = doc.splitTextToSize(plainTxt, 180);
            doc.text(split, 14, y);
            y += split.length * 4.5;
            checkPageBreak();
        });

        y += 8;
        checkPageBreak();

        // === APRÈS-MIDI FMS ===
        writeText("Prestation après-midi à FMS", 12, true, [37, 99, 235]);
        writeText(`Prévu dans Quinyx gare de Mons : SPI:${presenceMonsAM.spi} | OPI:${presenceMonsAM.opi} | CPI:${presenceMonsAM.cpi} | PA:${presenceMonsAM.pa} | 10h-18h:${presenceMonsAM.shift_10_18}`, 9, false, [80,80,80]);
        y += 2;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        PRESET_STATIONS_FMS.forEach(st => {
            const txt = getStationText(st, 'FMS', 'afternoon').replace(/<br\/>/g, "\n").replace(/<br \/>/g, "\n");
            const plainTxt = `${st}: ${txt}`;
            const split = doc.splitTextToSize(plainTxt, 180);
            doc.text(split, 14, y);
            y += split.length * 4.5;
            checkPageBreak();
        });

        y += 8;
        checkPageBreak();

        // === APRÈS-MIDI FTY ===
        writeText("Prestation après-midi à FTY", 12, true, [124, 58, 237]);
        writeText(`Prévu dans Quinyx gare de Tournai : SPI:${presenceTournaiAM.spi} | CPI:${presenceTournaiAM.cpi} | PA:${presenceTournaiAM.pa} | 10h-18h:${presenceTournaiAM.shift_10_18}`, 9, false, [80,80,80]);
        y += 2;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        PRESET_STATIONS_FTY.forEach(st => {
            const txt = getStationText(st, 'FTY', 'afternoon').replace(/<br\/>/g, "\n").replace(/<br \/>/g, "\n");
            const plainTxt = `${st}: ${txt}`;
            const split = doc.splitTextToSize(plainTxt, 180);
            doc.text(split, 14, y);
            y += split.length * 4.5;
            checkPageBreak();
        });

        y += 10;
        checkPageBreak();

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "italic");
        doc.text("Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.", 14, y);
        y += 4;
        doc.text("Interventions PMR pour B-CS : Voir DICOS.", 14, y);
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.text("L'App DICOS PMR reste la base à consulter", 14, y);

        doc.save(`deplacements_pmr_${date}.pdf`);
    }
</script>

<div class="space-y-6 p-4 md:p-8 max-w-[1800px] mx-auto pb-32">

    <!-- Header -->
    <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6">
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Car class="w-8 h-8" />
            </div>
            <div>
                <h1 class="text-3xl font-bold text-gray-200">Déplacements PMR</h1>
                <p class="text-gray-500 text-sm mt-1">Gestion centralisée des prises en charge</p>
            </div>
        </div>

        <div class="flex flex-wrap gap-3">
            <button onclick={saveData} disabled={loading} class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                {#if loading}<span class="animate-spin">⏳</span>{:else}<Save class="w-4 h-4" />{/if}
                Sauvegarder
            </button>
            <button onclick={copyForOutlook} class="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-all shadow-lg">
                <Mail class="w-4 h-4" />
                Copier pour Outlook
            </button>
            <button onclick={generatePDF} class="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-all shadow-lg">
                <FileDown class="w-4 h-4" /> Télécharger PDF
            </button>
        </div>
    </header>

    <!-- Date Selector -->
    <div class="bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 shadow-lg">
        <label class="text-xs uppercase font-bold text-slate-400 mb-3 flex items-center gap-2 tracking-wider">
            <Calendar class="w-4 h-4" /> Date du rapport
        </label>
        <input
            type="date"
            bind:value={date}
            onchange={loadDailyReport}
            class="w-full max-w-xs bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer hover:border-slate-700"
        />
    </div>

    <!-- PRESTATION MATIN -->
    <div class="bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 shadow-lg">
        <h2 class="text-2xl font-bold text-blue-400 mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
            <div class="p-2 bg-blue-500/10 rounded-lg">
                <MapPin class="w-5 h-5" />
            </div>
            Prestation matin
        </h2>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Présence MONS Matin -->
            <div class="bg-slate-950/30 border border-blue-500/20 rounded-xl p-5">
                <h3 class="font-bold text-slate-200 mb-4 flex items-center gap-2 text-sm">
                    <MapPin class="w-4 h-4 text-blue-400" /> Prévu dans Quinyx gare de Mons
                </h3>
                <div class="grid grid-cols-5 gap-2">
                    {#each Object.keys(presenceMons) as key}
                        <div class="bg-slate-900/50 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                            <span class="text-[9px] uppercase text-slate-500 font-bold mb-1">{key.replace('shift_', '')}</span>
                            <input type="number" min="0" bind:value={presenceMons[key]} class="w-full bg-transparent text-center text-base font-bold text-blue-100 outline-none appearance-none" />
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Présence TOURNAI Matin -->
            <div class="bg-slate-950/30 border border-purple-500/20 rounded-xl p-5">
                <h3 class="font-bold text-slate-200 mb-4 flex items-center gap-2 text-sm">
                    <MapPin class="w-4 h-4 text-purple-400" /> Prévu dans Quinyx gare de Tournai
                </h3>
                <div class="grid grid-cols-5 gap-2">
                    {#each Object.keys(presenceTournai) as key}
                        <div class="bg-slate-900/50 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                            <span class="text-[9px] uppercase text-slate-500 font-bold mb-1">{key.replace('shift_', '')}</span>
                            <input type="number" min="0" bind:value={presenceTournai[key]} class="w-full bg-transparent text-center text-base font-bold text-purple-100 outline-none appearance-none" />
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>

    <!-- Interventions Matin -->
    <div class="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div class="p-4 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
            <h3 class="font-semibold text-slate-200 flex items-center gap-2 text-sm">
                <Users class="w-4 h-4 text-slate-400" />
                Interventions MATIN
                <span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs px-2 py-0.5 rounded-full ml-2">{interventions.length}</span>
            </h3>
            <button onclick={addRow} class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 shadow-sm">
                <Plus class="w-3.5 h-3.5" /> Ajouter une ligne
            </button>
        </div>

        <div class="overflow-x-auto flex-1 custom-scrollbar">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="text-slate-400 uppercase text-[10px] font-bold bg-slate-950/50 sticky top-0 z-10">
                    <tr>
                        <th class="px-4 py-3 w-20 text-center">Zone</th>
                        <th class="px-4 py-3 w-32">Gare</th>
                        <th class="px-4 py-3">PMR / Mission</th>
                        <th class="px-4 py-3 w-64">Prise en charge par</th>
                        <th class="px-2 py-3 w-12"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                    {#each interventions as row, i}
                        <tr class="hover:bg-white/[0.02] group transition-colors">
                            <td class="p-2">
                                <input
                                    bind:value={row.zone}
                                    class="w-16 bg-slate-950/30 text-center font-mono text-xs uppercase border border-white/5 rounded px-1 py-1 text-slate-300 focus:border-blue-500 outline-none"
                                    placeholder="-"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    list="stations"
                                    value={row.station}
                                    oninput={(e) => handleStationChange(i, e.target.value)}
                                    class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-blue-500 rounded px-2 py-1.5 font-bold uppercase text-white outline-none"
                                    placeholder="GARE"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    bind:value={row.pmr_details}
                                    class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-blue-500 rounded px-3 py-1.5 text-slate-300 outline-none"
                                    placeholder="Ex: 2026-01-20-0081 1 NV IN E 1708 à 08H31"
                                />
                            </td>
                            <td class="p-2">
                                <select
                                    bind:value={row.assigned_to}
                                    class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-blue-500 rounded px-2 py-1.5 text-xs text-slate-300 outline-none cursor-pointer"
                                >
                                    <option value="">- Choisir -</option>
                                    {#each ASSIGNEES as person}
                                        <option value={person}>{person}</option>
                                    {/each}
                                </select>
                            </td>
                            <td class="p-2 text-center">
                                <button
                                    onclick={() => removeRow(i)}
                                    class="text-slate-600 hover:text-red-400 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
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

    <!-- PRESTATION APRÈS-MIDI -->
    <div class="bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 shadow-lg">
        <h2 class="text-2xl font-bold text-purple-400 mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
            <div class="p-2 bg-purple-500/10 rounded-lg">
                <MapPin class="w-5 h-5" />
            </div>
            Prestation après-midi
        </h2>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Présence MONS Après-midi -->
            <div class="bg-slate-950/30 border border-blue-500/20 rounded-xl p-5">
                <h3 class="font-bold text-slate-200 mb-4 flex items-center gap-2 text-sm">
                    <MapPin class="w-4 h-4 text-blue-400" /> Prévu dans Quinyx gare de Mons
                </h3>
                <div class="grid grid-cols-5 gap-2">
                    {#each Object.keys(presenceMonsAM) as key}
                        <div class="bg-slate-900/50 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                            <span class="text-[9px] uppercase text-slate-500 font-bold mb-1">{key.replace('shift_', '')}</span>
                            <input type="number" min="0" bind:value={presenceMonsAM[key]} class="w-full bg-transparent text-center text-base font-bold text-blue-100 outline-none appearance-none" />
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Présence TOURNAI Après-midi -->
            <div class="bg-slate-950/30 border border-purple-500/20 rounded-xl p-5">
                <h3 class="font-bold text-slate-200 mb-4 flex items-center gap-2 text-sm">
                    <MapPin class="w-4 h-4 text-purple-400" /> Prévu dans Quinyx gare de Tournai
                </h3>
                <div class="grid grid-cols-5 gap-2">
                    {#each Object.keys(presenceTournaiAM) as key}
                        <div class="bg-slate-900/50 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                            <span class="text-[9px] uppercase text-slate-500 font-bold mb-1">{key.replace('shift_', '')}</span>
                            <input type="number" min="0" bind:value={presenceTournaiAM[key]} class="w-full bg-transparent text-center text-base font-bold text-purple-100 outline-none appearance-none" />
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>

    <!-- Interventions Après-midi -->
    <div class="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div class="p-4 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
            <h3 class="font-semibold text-slate-200 flex items-center gap-2 text-sm">
                <Users class="w-4 h-4 text-slate-400" />
                Interventions APRÈS-MIDI
                <span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs px-2 py-0.5 rounded-full ml-2">{interventionsAM.length}</span>
            </h3>
            <button onclick={addRowAM} class="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 shadow-sm">
                <Plus class="w-3.5 h-3.5" /> Ajouter une ligne
            </button>
        </div>

        <div class="overflow-x-auto flex-1 custom-scrollbar">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="text-slate-400 uppercase text-[10px] font-bold bg-slate-950/50 sticky top-0 z-10">
                    <tr>
                        <th class="px-4 py-3 w-20 text-center">Zone</th>
                        <th class="px-4 py-3 w-32">Gare</th>
                        <th class="px-4 py-3">PMR / Mission</th>
                        <th class="px-4 py-3 w-64">Prise en charge par</th>
                        <th class="px-2 py-3 w-12"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                    {#each interventionsAM as row, i}
                        <tr class="hover:bg-white/[0.02] group transition-colors">
                            <td class="p-2">
                                <input
                                    bind:value={row.zone}
                                    class="w-16 bg-slate-950/30 text-center font-mono text-xs uppercase border border-white/5 rounded px-1 py-1 text-slate-300 focus:border-purple-500 outline-none"
                                    placeholder="-"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    list="stations"
                                    value={row.station}
                                    oninput={(e) => handleStationChangeAM(i, e.target.value)}
                                    class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-purple-500 rounded px-2 py-1.5 font-bold uppercase text-white outline-none"
                                    placeholder="GARE"
                                />
                            </td>
                            <td class="p-2">
                                <input
                                    bind:value={row.pmr_details}
                                    class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-purple-500 rounded px-3 py-1.5 text-slate-300 outline-none"
                                    placeholder="Ex: 2026-01-21-0080 1NV IN E4868 à 18h59"
                                />
                            </td>
                            <td class="p-2">
                                <select
                                    bind:value={row.assigned_to}
                                    class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-purple-500 rounded px-2 py-1.5 text-xs text-slate-300 outline-none cursor-pointer"
                                >
                                    <option value="">- Choisir -</option>
                                    {#each ASSIGNEES as person}
                                        <option value={person}>{person}</option>
                                    {/each}
                                </select>
                            </td>
                            <td class="p-2 text-center">
                                <button
                                    onclick={() => removeRowAM(i)}
                                    class="text-slate-600 hover:text-red-400 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
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

    <!-- Footer note -->
    <div class="bg-slate-900/30 border border-yellow-500/20 rounded-xl p-4 text-sm text-slate-400 italic">
        <p class="mb-1">* Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
        <p class="mb-1">* Interventions PMR pour B-CS : Voir DICOS.</p>
        <p class="font-bold text-yellow-400/90 mt-2">L'App DICOS PMR reste la base à consulter</p>
    </div>

</div>

<datalist id="stations">
    {#each stationList as s}<option value={s.abbreviation} />{/each}
</datalist>

<style>
    /* Scrollbar minimaliste pour le tableau */
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.5);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }
</style>