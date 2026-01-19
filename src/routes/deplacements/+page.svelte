<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    // CORRECTED: Using the internal toast store
    import { toast } from '$lib/stores/toast';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    
    // --- STATE (Svelte 5 Runes) ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);
    
    // Presence Data
    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    
    // Intervention List
    let interventions = $state([]);
    
    // Station List for Autocomplete
    let stationList = $state([]);

    // --- CONSTANTS ---
    const ASSIGNEES = [
        "ACP TEMP (Blaise)", "CPI BUFFER FTY", "CPI BUFFER FMS", "CPI FMS", 
        "CPI FBC", "CPI FTY", "OPI 1", "OPI 2", "SPI FTY", "SPI FMS", 
        "SPI Buffer FMS", "SPI Buffer FTY", "Team Leader", "MPI", "PA", 
        "OPI 5-13", "OPI 13-21", "PA 10-18", "CPI 10-18", "SPI 10-18"
    ];

    const DEFAULT_ZONES = {
        FMS: ['FMS', 'FSG', 'FGH', 'FJR', 'LVRS', 'FBC', 'FLZ', 'FNG'],
        FTY: ['FTY', 'FMC', 'FLN']
    };

    // --- INITIALIZATION ---
    onMount(async () => {
        await loadStations();
        await loadDailyReport();
    });

    async function loadStations() {
        const { data, error } = await supabase
            .from('ptcar_abbreviations')
            .select('abbreviation, zone_name');
        
        if (data) {
            stationList = data;
        }
    }

    // --- LOGIC ---

    function detectZone(stationName) {
        const s = stationName?.toUpperCase() || '';
        
        // 1. Special Case ATH
        if (s === 'ATH') return 'FMS/FTY'; 

        // 2. Search in Loaded DB
        const found = stationList.find(st => st.abbreviation === s);
        if (found && found.zone_name) return found.zone_name;

        // 3. Fallback
        if (DEFAULT_ZONES.FMS.includes(s)) return 'FMS';
        if (DEFAULT_ZONES.FTY.includes(s)) return 'FTY';

        return 'FMS'; 
    }

    function addRow() {
        interventions = [...interventions, { 
            station: '', 
            pmr_details: '', 
            assigned_to: '', 
            zone: '' 
        }];
    }

    function removeRow(index) {
        interventions = interventions.filter((_, i) => i !== index);
    }

    function handleStationChange(index, value) {
        interventions[index].station = value.toUpperCase();
        const detected = detectZone(value);
        interventions[index].zone = detected;

        if (value.toUpperCase() === 'ATH') {
            toast.info("ATH détecté : Vérifiez la zone (FMS ou FTY)", 3000);
        }
    }

    // --- SUPABASE ACTIONS ---

    async function loadDailyReport() {
        loading = true;
        interventions = [];
        presenceMons = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
        presenceTournai = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };

        try {
            const { data: report } = await supabase
                .from('daily_movements')
                .select('*')
                .eq('date', date)
                .single();

            if (report) {
                presenceMons = report.presence_mons;
                presenceTournai = report.presence_tournai;
                
                const { data: lines } = await supabase
                    .from('movement_interventions')
                    .select('*')
                    .eq('movement_id', report.id)
                    .order('created_at', { ascending: true });
                
                interventions = lines || [];
            }
            
            if (interventions.length === 0) addRow();

        } catch (e) {
            console.error(e);
        } finally {
            loading = false;
        }
    }

    async function saveData() {
        loading = true;
        try {
            // 1. Save Parent Report
            const { data: report, error: errRep } = await supabase
                .from('daily_movements')
                .upsert({ 
                    date, 
                    presence_mons: presenceMons, 
                    presence_tournai: presenceTournai 
                }, { onConflict: 'date' })
                .select()
                .single();

            if (errRep) throw errRep;

            // 2. Save Lines
            await supabase.from('movement_interventions').delete().eq('movement_id', report.id);
            
            const validLines = interventions.filter(i => i.station.trim() !== '');
            const linesToInsert = validLines.map(i => ({
                movement_id: report.id,
                station: i.station,
                zone: i.zone,
                pmr_details: i.pmr_details,
                assigned_to: i.assigned_to
            }));

            if (linesToInsert.length > 0) {
                const { error: errLines } = await supabase.from('movement_interventions').insert(linesToInsert);
                if (errLines) throw errLines;
            }

            toast.success("Rapport sauvegardé !", 3000);
        } catch (e) {
            console.error(e);
            toast.error("Erreur de sauvegarde: " + e.message, 5000);
        } finally {
            loading = false;
        }
    }

    // --- EXPORT ACTIONS ---

    async function copyForOutlook() {
        const html = `
            <div style="font-family: Calibri, sans-serif; color: black;">
                <h3 style="color: #2c3e50;">Rapport PMR du ${new Date(date).toLocaleDateString('fr-BE')}</h3>
                <table style="margin-bottom: 15px; border-collapse: collapse;">
                    <tr>
                        <td style="padding-right:20px"><strong>MONS:</strong> SPI:${presenceMons.spi} OPI:${presenceMons.opi} CPI:${presenceMons.cpi} PA:${presenceMons.pa} 10-18:${presenceMons.shift_10_18}</td>
                        <td><strong>TOURNAI:</strong> SPI:${presenceTournai.spi} OPI:${presenceTournai.opi} CPI:${presenceTournai.cpi} PA:${presenceTournai.pa} 10-18:${presenceTournai.shift_10_18}</td>
                    </tr>
                </table>
                <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #999;">
                    <thead style="background-color: #f2f2f2;">
                        <tr>
                            <th style="text-align:left;">Zone</th>
                            <th style="text-align:left;">Gare</th>
                            <th style="text-align:left;">Détails PMR</th>
                            <th style="text-align:left;">Prise en charge</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${interventions.map(row => `
                            <tr>
                                <td style="text-align:center;">${row.zone}</td>
                                <td><strong>${row.station}</strong></td>
                                <td>${row.pmr_details}</td>
                                <td>${row.assigned_to}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport copié'], { type: 'text/plain' });
            const item = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });
            await navigator.clipboard.write([item]);
            toast.success("Copié pour Outlook !", 3000);
        } catch (err) {
            toast.error("Impossible de copier (Permission refusée ?)", 3000);
        }
    }

    function generatePDF() {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`Rapport Journalier - ${date}`, 14, 15);
        
        doc.setFontSize(10);
        doc.text(`MONS: SPI:${presenceMons.spi} OPI:${presenceMons.opi} CPI:${presenceMons.cpi} PA:${presenceMons.pa} 10-18:${presenceMons.shift_10_18}`, 14, 25);
        doc.text(`TOURNAI: SPI:${presenceTournai.spi} OPI:${presenceTournai.opi} CPI:${presenceTournai.cpi} PA:${presenceTournai.pa} 10-18:${presenceTournai.shift_10_18}`, 14, 30);

        const tableBody = interventions.map(row => [row.zone, row.station, row.pmr_details, row.assigned_to]);
        
        autoTable(doc, {
            startY: 35,
            head: [['Zone', 'Gare', 'Détails PMR', 'Prise en charge']],
            body: tableBody,
            styles: { fontSize: 9 },
            columnStyles: { 
                0: { cellWidth: 20 }, 
                1: { cellWidth: 20, fontStyle: 'bold' },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 50 }
            }
        });

        doc.save(`pmr_${date}.pdf`);
    }
</script>

<div class="space-y-6 p-4 md:p-8 max-w-[1600px] mx-auto pb-24">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
        <div>
            <h1 class="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                Déplacements & PMR
            </h1>
            <p class="text-slate-400 text-sm">Gestion des prises en charge journalières</p>
        </div>
        <div class="flex flex-wrap gap-2">
            <button onclick={saveData} disabled={loading} class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
                {#if loading}<span class="animate-spin">⏳</span>{:else}💾{/if} Sauvegarder
            </button>
            <button onclick={copyForOutlook} class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border border-slate-600">
                📧 Outlook
            </button>
            <button onclick={generatePDF} class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border border-slate-600">
                📄 PDF
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        <div class="xl:col-span-1 space-y-6">
            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
                <label class="block text-sm font-medium mb-3 text-slate-300">Date du rapport</label>
                <input 
                    type="date" 
                    bind:value={date} 
                    onchange={loadDailyReport}
                    class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
            </div>

            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden group">
                <div class="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>
                <h3 class="font-bold text-slate-200 mb-4 flex items-center gap-2">
                    <span class="w-2 h-6 bg-blue-500 rounded-full"></span>
                    Présence MONS
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    {#each Object.keys(presenceMons) as key}
                        <div class="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
                            <label class="text-[10px] uppercase text-slate-500 block mb-1 font-bold tracking-wider">{key.replace('shift_', '')}</label>
                            <input type="number" min="0" bind:value={presenceMons[key]} class="w-full bg-transparent text-lg font-bold text-slate-200 text-center outline-none" />
                        </div>
                    {/each}
                </div>
            </div>

            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden group">
                <div class="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>
                <h3 class="font-bold text-slate-200 mb-4 flex items-center gap-2">
                    <span class="w-2 h-6 bg-purple-500 rounded-full"></span>
                    Présence TOURNAI
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    {#each Object.keys(presenceTournai) as key}
                        <div class="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
                            <label class="text-[10px] uppercase text-slate-500 block mb-1 font-bold tracking-wider">{key.replace('shift_', '')}</label>
                            <input type="number" min="0" bind:value={presenceTournai[key]} class="w-full bg-transparent text-lg font-bold text-slate-200 text-center outline-none" />
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <div class="xl:col-span-3">
            <div class="bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl overflow-hidden min-h-[600px] flex flex-col">
                <div class="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center backdrop-blur-md sticky top-0 z-10">
                    <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                        📋 Liste des interventions
                        <span class="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">{interventions.length}</span>
                    </h3>
                    <button onclick={addRow} class="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-md transition-all flex items-center gap-1">
                        <span>+</span> Ajouter ligne
                    </button>
                </div>

                <div class="overflow-x-auto flex-1">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-slate-950 text-slate-400 uppercase text-xs font-semibold sticky top-0">
                            <tr>
                                <th class="px-4 py-3 w-24">Zone</th>
                                <th class="px-4 py-3 w-32">Gare</th>
                                <th class="px-4 py-3">Détails PMR (Freetext)</th>
                                <th class="px-4 py-3 w-64">Prise en charge</th>
                                <th class="px-2 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800/50">
                            {#each interventions as row, i}
                                <tr class="hover:bg-slate-800/30 group transition-colors">
                                    <td class="p-2">
                                        <input 
                                            bind:value={row.zone} 
                                            class="w-full bg-transparent text-center font-mono text-xs uppercase text-slate-400 focus:text-blue-300 outline-none" 
                                            placeholder="ZONE"
                                            readonly
                                        />
                                    </td>
                                    
                                    <td class="p-2">
                                        <div class="relative">
                                            <input 
                                                list="station-list"
                                                value={row.station}
                                                oninput={(e) => handleStationChange(i, e.target.value)}
                                                class="w-full bg-slate-950/50 border border-transparent hover:border-slate-700 focus:border-blue-500 rounded px-3 py-1.5 font-bold uppercase text-slate-200 outline-none transition-all" 
                                                placeholder="Gare..."
                                            />
                                        </div>
                                    </td>

                                    <td class="p-2">
                                        <input 
                                            bind:value={row.pmr_details} 
                                            class="w-full bg-slate-950/50 border border-transparent hover:border-slate-700 focus:border-blue-500 rounded px-3 py-1.5 text-slate-300 placeholder-slate-600 outline-none transition-all" 
                                            placeholder="Ex: 2025-12-31-0019 1 CRF..."
                                        />
                                    </td>

                                    <td class="p-2">
                                        <select 
                                            bind:value={row.assigned_to} 
                                            class="w-full bg-slate-950/50 border border-transparent hover:border-slate-700 focus:border-blue-500 rounded px-3 py-1.5 text-slate-300 outline-none cursor-pointer appearance-none transition-all"
                                        >
                                            <option value="" disabled selected class="text-slate-500">- Choisir -</option>
                                            {#each ASSIGNEES as person}
                                                <option value={person}>{person}</option>
                                            {/each}
                                        </select>
                                    </td>

                                    <td class="p-2 text-center">
                                        <button onclick={() => removeRow(i)} class="text-slate-600 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100" title="Supprimer">
                                            ✖
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                
                {#if interventions.length === 0}
                    <div class="flex-1 flex flex-col items-center justify-center text-slate-600 italic p-8">
                        <span class="text-4xl mb-2 opacity-20">📭</span>
                        Aucune intervention enregistrée pour cette date.
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<datalist id="station-list">
    {#each stationList as st}
        <option value={st.abbreviation}>{st.abbreviation}</option>
    {/each}
</datalist>

<style>
    /* Custom scrollbar matching other pages */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    ::-webkit-scrollbar-track {
        background: #0f172a; 
    }
    ::-webkit-scrollbar-thumb {
        background: #334155; 
        border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: #475569; 
    }
</style>