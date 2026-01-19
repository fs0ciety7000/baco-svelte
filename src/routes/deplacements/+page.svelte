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
    
    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventions = $state([]);
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

    // Helper pour générer le texte groupé par gare (pour export)
    function getStationText(stationCode, zoneFilter = null) {
        const matches = interventions.filter(i => 
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
                presenceMons = report.presence_mons;
                presenceTournai = report.presence_tournai;
                const { data: lines } = await supabase.from('movement_interventions').select('*').eq('movement_id', report.id).order('created_at', { ascending: true });
                interventions = lines || [];
            } else {
                presenceMons = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournai = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                interventions = [];
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
            const { data: report, error: errRep } = await supabase
                .from('daily_movements')
                .upsert({ date, presence_mons: presenceMons, presence_tournai: presenceTournai }, { onConflict: 'date' })
                .select().single();
            if (errRep) throw errRep;

            await supabase.from('movement_interventions').delete().eq('movement_id', report.id);
            const validLines = interventions.filter(i => i.station.trim() !== '').map(i => ({ ...i, movement_id: report.id }));
            
            if (validLines.length > 0) {
                const { error: errLines } = await supabase.from('movement_interventions').insert(validLines);
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
        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; color: #1e293b; background-color: #fff; padding: 20px;">
                <h3 style="color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">
                    Rapport Déplacements - ${new Date(date).toLocaleDateString('fr-BE')}
                </h3>

                <div style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #eff6ff; padding: 10px 15px; border-bottom: 1px solid #dbeafe;">
                        <span style="color: #1d4ed8; font-weight: bold; font-size: 12pt;">PRESTATION MATIN À FMS</span>
                    </div>
                    <div style="padding: 15px;">
                        <div style="margin-bottom: 15px; font-size: 10pt; color: #64748b;">
                            <strong>Effectifs :</strong> SPI:${presenceMons.spi} | OPI:${presenceMons.opi} | CPI:${presenceMons.cpi} | PA:${presenceMons.pa} | 10h-18h:${presenceMons.shift_10_18}
                        </div>
                        <hr style="border: 0; border-top: 1px dashed #cbd5e1; margin: 10px 0;" />
                        <div style="font-weight: bold; margin-bottom: 8px; color: #334155;">Prise en charge :</div>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${PRESET_STATIONS_FMS.map(st => {
                                const txt = getStationText(st, 'FMS');
                                const isEmpty = txt === '///';
                                return `<li style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex;">
                                    <span style="font-weight: bold; width: 60px; color: #475569;">${st}</span>
                                    <span style="color: ${isEmpty ? '#94a3b8' : '#0f172a'}; flex: 1;">${txt}</span>
                                </li>`;
                            }).join('')}
                        </ul>
                    </div>
                </div>

                <div style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #f5f3ff; padding: 10px 15px; border-bottom: 1px solid #ede9fe;">
                        <span style="color: #6d28d9; font-weight: bold; font-size: 12pt;">PRESTATION MATIN À FTY</span>
                    </div>
                    <div style="padding: 15px;">
                        <div style="margin-bottom: 15px; font-size: 10pt; color: #64748b;">
                            <strong>Effectifs :</strong> SPI:${presenceTournai.spi} | OPI:${presenceTournai.opi} | CPI:${presenceTournai.cpi} | PA:${presenceTournai.pa} | 10h-18h:${presenceTournai.shift_10_18}
                        </div>
                        <hr style="border: 0; border-top: 1px dashed #cbd5e1; margin: 10px 0;" />
                        <div style="font-weight: bold; margin-bottom: 8px; color: #334155;">Prise en charge :</div>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${PRESET_STATIONS_FTY.map(st => {
                                const txt = getStationText(st, 'FTY');
                                const isEmpty = txt === '///';
                                return `<li style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex;">
                                    <span style="font-weight: bold; width: 60px; color: #475569;">${st}</span>
                                    <span style="color: ${isEmpty ? '#94a3b8' : '#0f172a'}; flex: 1;">${txt}</span>
                                </li>`;
                            }).join('')}
                        </ul>
                    </div>
                </div>

                <div style="font-size: 9pt; color: #94a3b8; font-style: italic; margin-top: 20px;">
                    * Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.<br/>
                    * Interventions PMR pour B-CS : Voir DICOS.
                </div>
            </div>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport copié. Collez dans un email HTML.'], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
            toast.success("Copié ! Prêt pour Outlook.");
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

        writeText(`Rapport Déplacements - ${date.split('-').reverse().join('-')}`, 16, true);
        y += 5;

        // FMS
        writeText("PRESTATION MATIN À FMS", 12, true, [37, 99, 235]); 
        writeText(`SPI:${presenceMons.spi}  OPI:${presenceMons.opi}  CPI:${presenceMons.cpi}  PA:${presenceMons.pa}  10h-18h:${presenceMons.shift_10_18}`, 10, false, [80,80,80]);
        y += 2;
        writeText("Prise en charge :", 10, true);
        
        doc.setFont("helvetica", "normal");
        PRESET_STATIONS_FMS.forEach(st => {
            const txt = getStationText(st, 'FMS').replace(/<br\/>/g, "\n");
            const plainTxt = `${st}: ${txt}`;
            const split = doc.splitTextToSize(plainTxt, 180);
            doc.text(split, 14, y);
            y += split.length * 5;
        });

        y += 8;
        if(y > 220) { doc.addPage(); y = 15; }

        // FTY
        writeText("PRESTATION MATIN À FTY", 12, true, [124, 58, 237]);
        writeText(`SPI:${presenceTournai.spi}  OPI:${presenceTournai.opi}  CPI:${presenceTournai.cpi}  PA:${presenceTournai.pa}  10h-18h:${presenceTournai.shift_10_18}`, 10, false, [80,80,80]);
        y += 2;
        writeText("Prise en charge :", 10, true);

        doc.setFont("helvetica", "normal");
        PRESET_STATIONS_FTY.forEach(st => {
            const txt = getStationText(st, 'FTY').replace(/<br\/>/g, "\n");
            const plainTxt = `${st}: ${txt}`;
            const split = doc.splitTextToSize(plainTxt, 180);
            doc.text(split, 14, y);
            y += split.length * 5;
        });

        doc.save(`deplacements_${date}.pdf`);
    }
</script>

<div class="space-y-6 p-4 md:p-8 max-w-[1600px] mx-auto pb-32">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 opacity-50 pointer-events-none"></div>
        <div class="relative z-10">
            <h1 class="text-3xl font-bold flex items-center gap-3 text-white">
                <div class="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
                    <Car class="h-6 w-6 text-white" />
                </div>
                <span class="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                    Déplacements PMR
                </span>
            </h1>
            <p class="text-slate-400 text-sm mt-2 ml-1">Gestion centralisée des prises en charge</p>
        </div>
        
        <div class="relative z-10 flex flex-wrap gap-3">
            <button onclick={saveData} disabled={loading} class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed">
                {#if loading}<span class="animate-spin">⏳</span>{:else}<Save class="w-4 h-4" />{/if}
                Sauvegarder
            </button>
            <button onclick={copyForOutlook} class="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 rounded-lg font-medium transition-all">
                <Mail class="w-4 h-4 text-emerald-400" /> 
                <span class="hidden sm:inline">Copier pour</span> Outlook
            </button>
            <button onclick={generatePDF} class="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 rounded-lg font-medium transition-all">
                <FileDown class="w-4 h-4 text-red-400" /> PDF
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        <div class="xl:col-span-1 space-y-6">
            <div class="bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 shadow-lg">
                <label class="text-xs uppercase font-bold text-slate-500 mb-3 flex items-center gap-2 tracking-wider">
                    <Calendar class="w-4 h-4" /> Date du rapport
                </label>
                <input 
                    type="date" 
                    bind:value={date} 
                    onchange={loadDailyReport}
                    class="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer hover:border-slate-700"
                />
            </div>

            <div class="group bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 shadow-lg relative overflow-hidden transition-all hover:border-blue-500/30">
                <div class="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                <h3 class="font-bold text-slate-200 mb-5 flex items-center gap-2">
                    <MapPin class="w-4 h-4 text-blue-400" /> Présence MONS
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    {#each Object.keys(presenceMons) as key}
                        <div class="bg-slate-950/50 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                            <span class="text-[10px] uppercase text-slate-500 font-bold mb-1">{key.replace('shift_', '')}</span>
                            <input type="number" min="0" bind:value={presenceMons[key]} class="w-full bg-transparent text-center text-lg font-bold text-blue-100 outline-none appearance-none" />
                        </div>
                    {/each}
                </div>
            </div>

            <div class="group bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 shadow-lg relative overflow-hidden transition-all hover:border-purple-500/30">
                <div class="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                <h3 class="font-bold text-slate-200 mb-5 flex items-center gap-2">
                    <MapPin class="w-4 h-4 text-purple-400" /> Présence TOURNAI
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    {#each Object.keys(presenceTournai) as key}
                        <div class="bg-slate-950/50 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                            <span class="text-[10px] uppercase text-slate-500 font-bold mb-1">{key.replace('shift_', '')}</span>
                            <input type="number" min="0" bind:value={presenceTournai[key]} class="w-full bg-transparent text-center text-lg font-bold text-purple-100 outline-none appearance-none" />
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <div class="xl:col-span-3">
            <div class="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl flex flex-col h-full min-h-[600px] overflow-hidden">
                <div class="p-4 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
                    <h3 class="font-semibold text-slate-200 flex items-center gap-2 text-sm">
                        <Users class="w-4 h-4 text-slate-400" /> 
                        Liste des interventions
                        <span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs px-2 py-0.5 rounded-full ml-2">{interventions.length}</span>
                    </h3>
                    <button onclick={addRow} class="text-xs bg-slate-800 hover:bg-slate-700 text-white border border-white/10 px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 shadow-sm group">
                        <Plus class="w-3.5 h-3.5 group-hover:text-emerald-400 transition-colors" /> Ajouter une ligne
                    </button>
                </div>

                <div class="overflow-x-auto flex-1 custom-scrollbar">
                    <table class="w-full text-sm text-left border-collapse">
                        <thead class="text-slate-500 uppercase text-[10px] font-bold bg-slate-950/50 sticky top-0 z-10 backdrop-blur-sm">
                            <tr>
                                <th class="px-4 py-3 w-20 text-center font-bold tracking-wider">Zone</th>
                                <th class="px-4 py-3 w-32 font-bold tracking-wider">Gare</th>
                                <th class="px-4 py-3 font-bold tracking-wider flex items-center gap-2"><Briefcase class="w-3 h-3" /> PMR / Mission (Freetext)</th>
                                <th class="px-4 py-3 w-64 font-bold tracking-wider">Prise en charge par</th>
                                <th class="px-2 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            {#each interventions as row, i}
                                <tr class="hover:bg-white/[0.02] group transition-colors">
                                    <td class="p-2">
                                        <div class="flex items-center justify-center">
                                            <input 
                                                bind:value={row.zone} 
                                                class="w-16 bg-slate-950/30 text-center font-mono text-xs uppercase border border-white/5 rounded px-1 py-1 text-slate-300 focus:border-blue-500 focus:text-white outline-none transition-colors" 
                                                placeholder="-" 
                                            />
                                        </div>
                                    </td>
                                    <td class="p-2 relative">
                                        <div class="relative flex items-center">
                                            <Train class="w-3 h-3 text-slate-600 absolute left-2 pointer-events-none" />
                                            <input 
                                                list="stations" 
                                                value={row.station} 
                                                oninput={(e) => handleStationChange(i, e.target.value)} 
                                                class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-blue-500 rounded px-2 py-1.5 pl-7 font-bold uppercase text-white outline-none transition-all placeholder:text-slate-700" 
                                                placeholder="GARE" 
                                            />
                                        </div>
                                    </td>
                                    <td class="p-2">
                                        <input 
                                            bind:value={row.pmr_details} 
                                            class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-blue-500 rounded px-3 py-1.5 text-slate-300 focus:text-white outline-none transition-all placeholder:text-slate-700" 
                                            placeholder="Ex: 2026-01-17 1 CRF vers..." 
                                        />
                                    </td>
                                    <td class="p-2">
                                        <div class="relative">
                                            <select 
                                                bind:value={row.assigned_to} 
                                                class="w-full bg-slate-950/30 border border-transparent hover:border-white/10 focus:border-blue-500 rounded px-2 py-1.5 text-xs sm:text-sm text-slate-300 focus:text-white outline-none cursor-pointer appearance-none transition-all"
                                            >
                                                <option value="" disabled selected class="text-slate-600">- Choisir -</option>
                                                {#each ASSIGNEES as person}
                                                    <option value={person} class="bg-slate-900 text-slate-200">{person}</option>
                                                {/each}
                                            </select>
                                            <div class="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-600">
                                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="p-2 text-center">
                                        <button 
                                            onclick={() => removeRow(i)} 
                                            class="text-slate-600 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 transform hover:scale-110"
                                            title="Supprimer la ligne"
                                        >
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                    
                    {#if interventions.length === 0}
                        <div class="flex flex-col items-center justify-center py-20 text-slate-600">
                            <div class="bg-slate-900/50 p-4 rounded-full mb-3 border border-white/5">
                                <Car class="w-8 h-8 opacity-50" />
                            </div>
                            <p class="text-sm font-medium text-slate-500">Aucune intervention enregistrée</p>
                            <button onclick={addRow} class="text-blue-400 hover:text-blue-300 text-xs mt-2 hover:underline">
                                Ajouter une première ligne
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
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