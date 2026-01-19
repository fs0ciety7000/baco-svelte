<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from 'svelte-sonner';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    
    // --- ÉTATS (Svelte 5 Runes) ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);
    
    // Données de présence
    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    
    // Liste des interventions
    let interventions = $state([]);
    
    // Liste des gares chargées depuis Supabase (pour l'autocomplete)
    let stationList = $state([]);

    // --- CONSTANTES ---
    const ASSIGNEES = [
        "ACP TEMP (Blaise)", "CPI BUFFER FTY", "CPI BUFFER FMS", "CPI FMS", 
        "CPI FBC", "CPI FTY", "OPI 1", "OPI 2", "SPI FTY", "SPI FMS", 
        "SPI Buffer FMS", "SPI Buffer FTY", "Team Leader", "MPI", "PA", 
        "OPI 5-13", "OPI 13-21", "PA 10-18", "CPI 10-18", "SPI 10-18"
    ];

    // Zones par défaut (fallback si pas en DB)
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
        // On récupère les codes (abbreviations) et les zones
        const { data, error } = await supabase
            .from('ptcar_abbreviations')
            .select('abbreviation, zone_name'); // Adaptez 'zone_name' selon votre colonne réelle
        
        if (data) {
            stationList = data;
        }
    }

    // --- LOGIQUE METIER ---

    function detectZone(stationName) {
        const s = stationName?.toUpperCase() || '';
        
        // 1. Cas spécial ATH (souvent double zone)
        if (s === 'ATH') return 'FMS/FTY'; 

        // 2. Chercher dans la DB chargée
        const found = stationList.find(st => st.abbreviation === s);
        if (found && found.zone_name) return found.zone_name;

        // 3. Fallback sur les listes par défaut
        if (DEFAULT_ZONES.FMS.includes(s)) return 'FMS';
        if (DEFAULT_ZONES.FTY.includes(s)) return 'FTY';

        return 'FMS'; // Valeur par défaut finale
    }

    function addRow() {
        interventions = [...interventions, { 
            station: '', 
            pmr_details: '', 
            assigned_to: '', // Vide par défaut pour forcer le choix
            zone: '' 
        }];
    }

    function removeRow(index) {
        interventions = interventions.filter((_, i) => i !== index);
    }

    // Mise à jour intelligente lors de la frappe de la gare
    function handleStationChange(index, value) {
        interventions[index].station = value.toUpperCase();
        
        // Mise à jour auto de la zone
        const detected = detectZone(value);
        interventions[index].zone = detected;

        // Petit feedback si ATH
        if (value.toUpperCase() === 'ATH') {
            toast.info("ATH détecté : Vérifiez la zone (FMS ou FTY)", { duration: 2000 });
        }
    }

    // --- SUPABASE (Load & Save) ---

    async function loadDailyReport() {
        loading = true;
        // Reset
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
            // 1. Sauvegarder le rapport parent
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

            // 2. Nettoyer et réinsérer les lignes
            await supabase.from('movement_interventions').delete().eq('movement_id', report.id);
            
            // Filtrer les lignes vides
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

            toast.success("Sauvegardé !");
        } catch (e) {
            toast.error("Erreur : " + e.message);
        } finally {
            loading = false;
        }
    }

    // --- ACTIONS EMAIL / PDF ---

    async function copyForOutlook() {
        // Construction HTML spécifique pour Outlook (Tableaux simples)
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
                            <th style="text-align:left; width: 60px;">Zone</th>
                            <th style="text-align:left; width: 80px;">Gare</th>
                            <th style="text-align:left;">Détails PMR</th>
                            <th style="text-align:left; width: 150px;">Prise en charge</th>
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
            toast.success("Copié pour Outlook !");
        } catch (err) {
            toast.error("Erreur de copie");
        }
    }

    function generatePDF() {
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(16);
        doc.text(`Rapport Journalier - ${date}`, 14, 15);
        
        // Présences
        doc.setFontSize(10);
        doc.text(`MONS: SPI:${presenceMons.spi} OPI:${presenceMons.opi} CPI:${presenceMons.cpi} PA:${presenceMons.pa} 10-18:${presenceMons.shift_10_18}`, 14, 25);
        doc.text(`TOURNAI: SPI:${presenceTournai.spi} OPI:${presenceTournai.opi} CPI:${presenceTournai.cpi} PA:${presenceTournai.pa} 10-18:${presenceTournai.shift_10_18}`, 14, 30);

        // Tableau
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

<div class="p-6 max-w-7xl mx-auto space-y-6 pb-20">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div>
            <h1 class="text-2xl font-bold">Déplacements & PMR</h1>
            <p class="text-sm text-muted-foreground">Gestion journalière des prises en charge</p>
        </div>
        <div class="flex flex-wrap gap-2">
            <button onclick={saveData} disabled={loading} class="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
                {#if loading}⏳{:else}💾{/if} Sauvegarder
            </button>
            <button onclick={copyForOutlook} class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
                📧 Outlook
            </button>
            <button onclick={generatePDF} class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2">
                📄 PDF
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-card border rounded-lg p-4 shadow-sm">
            <label class="block text-sm font-medium mb-2">Date du rapport</label>
            <input 
                type="date" 
                bind:value={date} 
                onchange={loadDailyReport}
                class="w-full bg-background border rounded px-3 py-2 text-foreground focus:ring-2 focus:ring-primary"
            />
        </div>

        {#each [{title: 'Mons', data: presenceMons}, {title: 'Tournai', data: presenceTournai}] as place}
            <div class="bg-card border rounded-lg p-4 shadow-sm">
                <h3 class="font-semibold mb-2 text-sm uppercase tracking-wide border-b pb-1">Présence {place.title}</h3>
                <div class="grid grid-cols-5 gap-1">
                    {#each Object.keys(place.data) as key}
                        <div class="text-center">
                            <span class="text-[10px] text-muted-foreground uppercase">{key.replace('shift_', '')}</span>
                            <input type="number" min="0" bind:value={place.data[key]} class="w-full text-center text-sm bg-secondary/30 border-0 rounded py-1" />
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    </div>

    <div class="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div class="p-3 bg-muted/30 border-b flex justify-between items-center">
            <h3 class="font-semibold text-sm">Liste des interventions</h3>
            <button onclick={addRow} class="text-xs bg-secondary hover:bg-secondary/80 border px-3 py-1 rounded transition-colors">
                + Ajouter ligne
            </button>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
                <thead class="bg-muted/50 text-muted-foreground uppercase text-xs">
                    <tr>
                        <th class="px-3 py-2 w-24">Zone</th>
                        <th class="px-3 py-2 w-32">Gare</th>
                        <th class="px-3 py-2">Détails PMR (Freetext)</th>
                        <th class="px-3 py-2 w-64">Prise en charge</th>
                        <th class="px-2 py-2 w-10"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    {#each interventions as row, i}
                        <tr class="hover:bg-muted/10 group transition-colors">
                            <td class="p-2">
                                <input 
                                    bind:value={row.zone} 
                                    class="w-full bg-transparent border-b border-transparent focus:border-primary focus:outline-none text-center font-mono text-xs uppercase" 
                                    placeholder="ZONE"
                                />
                            </td>
                            
                            <td class="p-2 relative">
                                <input 
                                    list="station-list"
                                    value={row.station}
                                    oninput={(e) => handleStationChange(i, e.target.value)}
                                    class="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 font-bold uppercase" 
                                    placeholder="Gare..."
                                />
                            </td>

                            <td class="p-2">
                                <input 
                                    bind:value={row.pmr_details} 
                                    class="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1" 
                                    placeholder="Ex: 2025-12-31-0019 1 CRF..."
                                />
                            </td>

                            <td class="p-2">
                                <select 
                                    bind:value={row.assigned_to} 
                                    class="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 cursor-pointer"
                                >
                                    <option value="" disabled selected class="text-muted-foreground">- Choisir -</option>
                                    {#each ASSIGNEES as person}
                                        <option value={person}>{person}</option>
                                    {/each}
                                </select>
                            </td>

                            <td class="p-2 text-center">
                                <button onclick={() => removeRow(i)} class="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title="Supprimer">
                                    ✖
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        
        {#if interventions.length === 0}
            <div class="p-8 text-center text-muted-foreground italic">
                Aucune intervention enregistrée pour cette date.
            </div>
        {/if}
    </div>
</div>

<datalist id="station-list">
    {#each stationList as st}
        <option value={st.abbreviation}>{st.abbreviation}</option>
    {/each}
</datalist>