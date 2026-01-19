<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast'; // Votre store toast interne
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    import { Save, Mail, FileDown, Plus, Trash2, Car, Calendar, MapPin, Users } from 'lucide-svelte';

    // --- ÉTAT ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);
    
    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventions = $state([]);
    let stationList = $state([]); // Pour l'autocomplete

    // --- CONSTANTES ---
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

    // --- INITIALISATION ---
    onMount(async () => {
        await loadStations();
        await loadDailyReport();
    });

    async function loadStations() {
        const { data } = await supabase.from('ptcar_abbreviations').select('abbreviation, zone_name');
        if (data) stationList = data;
    }

    // --- LOGIQUE MÉTIER ---
    function detectZone(stationName) {
        const s = stationName?.toUpperCase() || '';
        if (s === 'ATH') return 'FMS/FTY';
        const found = stationList.find(st => st.abbreviation === s);
        if (found && found.zone_name) return found.zone_name;
        if (DEFAULT_ZONES.FMS.includes(s)) return 'FMS';
        if (DEFAULT_ZONES.FTY.includes(s)) return 'FTY';
        return 'FMS';
    }

    function addRow() {
        interventions = [...interventions, { station: '', pmr_details: '', assigned_to: '', zone: '' }];
    }

    function removeRow(index) {
        interventions = interventions.filter((_, i) => i !== index);
    }

    function handleStationChange(index, value) {
        interventions[index].station = value.toUpperCase();
        interventions[index].zone = detectZone(value);
        if (value.toUpperCase() === 'ATH') toast.info("ATH détecté : Vérifiez la zone (FMS ou FTY)", 3000);
    }

    // --- SUPABASE ---
    async function loadDailyReport() {
        loading = true;
        interventions = [];
        presenceMons = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
        presenceTournai = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };

        try {
            const { data: report } = await supabase.from('daily_movements').select('*').eq('date', date).single();
            if (report) {
                presenceMons = report.presence_mons;
                presenceTournai = report.presence_tournai;
                const { data: lines } = await supabase.from('movement_interventions').select('*').eq('movement_id', report.id).order('created_at', { ascending: true });
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
            toast.success("Rapport sauvegardé avec succès !", 3000);
        } catch (e) {
            toast.error("Erreur : " + e.message, 5000);
        } finally {
            loading = false;
        }
    }

    // --- EXPORT ---
    async function copyForOutlook() {
        const html = `
            <div style="font-family: Calibri, sans-serif; color: black;">
                <h3 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px;">🚗 Rapport Déplacements - ${new Date(date).toLocaleDateString('fr-BE')}</h3>
                <div style="background: #f8f9fa; padding: 10px; margin-bottom: 15px; border-radius: 5px;">
                    <p style="margin: 5px 0;"><strong>🏢 MONS :</strong> SPI:${presenceMons.spi} | OPI:${presenceMons.opi} | CPI:${presenceMons.cpi} | PA:${presenceMons.pa} | 10-18:${presenceMons.shift_10_18}</p>
                    <p style="margin: 5px 0;"><strong>🏢 TOURNAI :</strong> SPI:${presenceTournai.spi} | OPI:${presenceTournai.opi} | CPI:${presenceTournai.cpi} | PA:${presenceTournai.pa} | 10-18:${presenceTournai.shift_10_18}</p>
                </div>
                <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #ddd; font-size: 14px;">
                    <thead style="background-color: #2c3e50; color: white;">
                        <tr>
                            <th style="width: 60px;">Zone</th>
                            <th style="width: 80px;">Gare</th>
                            <th>Détails PMR</th>
                            <th style="width: 180px;">Prise en charge</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${interventions.map(row => `
                            <tr>
                                <td style="text-align:center; font-weight:bold; color: #555;">${row.zone}</td>
                                <td style="text-align:center; font-weight:bold;">${row.station}</td>
                                <td>${row.pmr_details}</td>
                                <td style="color: #2980b9; font-weight:500;">${row.assigned_to}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
        
        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport copié'], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
            toast.success("Copié pour Outlook !");
        } catch (err) {
            toast.error("Erreur copie : " + err.message);
        }
    }

    function generatePDF() {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.setTextColor(40); doc.text(`Rapport Déplacements - ${date}`, 14, 20);
        
        doc.setFontSize(11); doc.setTextColor(100);
        doc.text(`MONS: SPI:${presenceMons.spi} OPI:${presenceMons.opi} CPI:${presenceMons.cpi} PA:${presenceMons.pa} 10-18:${presenceMons.shift_10_18}`, 14, 30);
        doc.text(`TOURNAI: SPI:${presenceTournai.spi} OPI:${presenceTournai.opi} CPI:${presenceTournai.cpi} PA:${presenceTournai.pa} 10-18:${presenceTournai.shift_10_18}`, 14, 36);

        autoTable(doc, {
            startY: 45,
            head: [['Zone', 'Gare', 'Détails PMR', 'Prise en charge']],
            body: interventions.map(r => [r.zone, r.station, r.pmr_details, r.assigned_to]),
            theme: 'grid',
            headStyles: { fillColor: [44, 62, 80] },
            columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 25, fontStyle: 'bold' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 50 } }
        });
        doc.save(`deplacements_${date}.pdf`);
    }
</script>

<div class="space-y-6 p-6 max-w-[1600px] mx-auto pb-24">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border rounded-xl p-5 shadow-sm">
        <div>
            <h1 class="text-2xl font-bold flex items-center gap-3">
                <div class="p-2 bg-primary/10 rounded-lg text-primary"><Car class="h-6 w-6" /></div>
                Déplacements & PMR
            </h1>
            <p class="text-muted-foreground text-sm mt-1">Gestion des prises en charge et rapport journalier</p>
        </div>
        <div class="flex flex-wrap gap-2">
            <button onclick={saveData} disabled={loading} class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                <Save class="w-4 h-4 mr-2" /> {loading ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
            <button onclick={copyForOutlook} class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                <Mail class="w-4 h-4 mr-2 text-blue-500" /> Outlook
            </button>
            <button onclick={generatePDF} class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                <FileDown class="w-4 h-4 mr-2 text-red-500" /> PDF
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div class="xl:col-span-1 space-y-6">
            <div class="bg-card border rounded-xl p-5 shadow-sm">
                <label class="text-sm font-medium mb-3 block text-card-foreground flex items-center gap-2">
                    <Calendar class="w-4 h-4" /> Date du rapport
                </label>
                <input 
                    type="date" 
                    bind:value={date} 
                    onchange={loadDailyReport}
                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>

            {#each [{label: 'Mons', data: presenceMons, color: 'text-blue-500'}, {label: 'Tournai', data: presenceTournai, color: 'text-purple-500'}] as p}
                <div class="bg-card border rounded-xl p-5 shadow-sm">
                    <h3 class="font-semibold mb-4 text-card-foreground flex items-center gap-2">
                        <MapPin class="w-4 h-4 {p.color}" /> Présence {p.label}
                    </h3>
                    <div class="grid grid-cols-2 gap-3">
                        {#each Object.keys(p.data) as key}
                            <div class="relative group">
                                <label class="text-[10px] uppercase text-muted-foreground font-bold absolute -top-2 left-2 bg-card px-1">{key.replace('shift_', '')}</label>
                                <input type="number" min="0" bind:value={p.data[key]} class="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm text-center font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>

        <div class="xl:col-span-3">
            <div class="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[500px]">
                <div class="p-4 border-b flex justify-between items-center bg-muted/40 rounded-t-xl">
                    <h3 class="font-semibold text-card-foreground flex items-center gap-2">
                        <Users class="w-4 h-4" /> Interventions
                        <span class="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{interventions.length}</span>
                    </h3>
                    <button onclick={addRow} class="text-xs bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1">
                        <Plus class="w-3 h-3" /> Ajouter
                    </button>
                </div>

                <div class="overflow-x-auto flex-1 p-1">
                    <table class="w-full text-sm text-left border-collapse">
                        <thead class="text-muted-foreground uppercase text-[10px] font-bold bg-muted/20">
                            <tr>
                                <th class="px-4 py-3 w-20 text-center">Zone</th>
                                <th class="px-4 py-3 w-32">Gare</th>
                                <th class="px-4 py-3">PMR (Freetext)</th>
                                <th class="px-4 py-3 w-56">Prise en charge</th>
                                <th class="px-2 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            {#each interventions as row, i}
                                <tr class="hover:bg-muted/30 group transition-colors">
                                    <td class="p-2">
                                        <input readonly bind:value={row.zone} class="w-full bg-transparent text-center font-mono text-xs uppercase text-muted-foreground focus:outline-none cursor-default" placeholder="-" />
                                    </td>
                                    <td class="p-2 relative">
                                        <input list="stations" value={row.station} oninput={(e) => handleStationChange(i, e.target.value)} class="w-full bg-transparent border-b border-transparent focus:border-primary rounded-none px-2 py-1 font-bold uppercase focus:outline-none transition-all" placeholder="GARE" />
                                    </td>
                                    <td class="p-2">
                                        <input bind:value={row.pmr_details} class="w-full bg-transparent border border-transparent hover:border-input focus:border-primary rounded px-3 py-1.5 focus:outline-none transition-all" placeholder="Ex: 2025-12-31 1 CRF..." />
                                    </td>
                                    <td class="p-2">
                                        <select bind:value={row.assigned_to} class="w-full bg-transparent border-none text-muted-foreground focus:text-foreground focus:ring-0 cursor-pointer text-xs sm:text-sm">
                                            <option value="" disabled selected>- Choisir -</option>
                                            {#each ASSIGNEES as person}
                                                <option value={person}>{person}</option>
                                            {/each}
                                        </select>
                                    </td>
                                    <td class="p-2 text-center">
                                        <button onclick={() => removeRow(i)} class="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover:bg-red-500/10">
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                    {#if interventions.length === 0}
                        <div class="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-50">
                            <Car class="w-12 h-12 mb-2 stroke-1" />
                            <p>Aucune intervention. Cliquez sur "Ajouter".</p>
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