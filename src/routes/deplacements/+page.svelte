<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import jsPDF from 'jspdf';
    import { Save, Mail, FileDown, Plus, Trash2, Car, Calendar, MapPin, Users, ClipboardCopy } from 'lucide-svelte';

    // --- ÉTAT (Svelte 5 Runes) ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);
    
    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventions = $state([]);
    let stationList = $state([]);

    // --- CONSTANTES DE CONFIGURATION (Ordre du PDF) ---
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

    // --- LOGIQUE MÉTIER ---
    function detectZone(stationName) {
        const s = stationName?.toUpperCase() || '';
        // ATH est spécial car dans les deux listes, par défaut on peut le laisser neutre ou FMS
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

    // Récupère le texte pour une gare donnée (export)
    function getStationText(stationCode, zoneFilter = null) {
        // Trouve toutes les interventions pour cette gare
        const matches = interventions.filter(i => 
            i.station === stationCode && 
            (zoneFilter ? i.zone === zoneFilter : true)
        );

        if (matches.length === 0) return "///";

        return matches.map(m => {
            const details = m.pmr_details ? m.pmr_details : "";
            const assignee = m.assigned_to ? `(${m.assigned_to})` : "";
            return `${details} ${assignee}`.trim();
        }).join('\n      '); // Saut de ligne avec indentation si plusieurs PMR même gare
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
                // Reset
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

    // --- EXPORT OUTLOOK (Format Texte/HTML Riche) ---
    async function copyForOutlook() {
        // Construction HTML qui imite le PDF
        let html = `
            <div style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: black; line-height: 1.4;">
                <h3 style="color: #2c3e50; border-bottom: 2px solid #3498db; margin-bottom: 10px;">
                    📅 Rapport Déplacements - ${new Date(date).toLocaleDateString('fr-BE')}
                </h3>

                <div style="margin-bottom: 20px;">
                    <strong style="font-size: 12pt; color: #2980b9;">Prestation matin à FMS :</strong><br/>
                    <em>Prévu dans Quinyx gare de Mons :</em><br/>
                    <strong>SPI:</strong> ${presenceMons.spi} &nbsp;|&nbsp; 
                    <strong>OPI:</strong> ${presenceMons.opi} &nbsp;|&nbsp; 
                    <strong>CPI:</strong> ${presenceMons.cpi} &nbsp;|&nbsp; 
                    <strong>PA:</strong> ${presenceMons.pa} &nbsp;|&nbsp; 
                    <strong>10h-18h:</strong> ${presenceMons.shift_10_18}<br/><br/>
                    
                    <strong>Prise en charge :</strong><br/>
                    <ul style="list-style-type: none; padding-left: 0; margin-top: 5px;">
                        ${PRESET_STATIONS_FMS.map(st => `
                            <li style="margin-bottom: 4px; padding-left: 10px; border-left: 3px solid #eee;">
                                <strong>${st}:</strong> ${getStationText(st, 'FMS')}
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div style="margin-bottom: 20px; border-top: 1px dashed #ccc; padding-top: 10px;">
                    <strong style="font-size: 12pt; color: #8e44ad;">Prestation matin à FTY :</strong><br/>
                    <em>Prévu dans Quinyx gare de Tournai :</em><br/>
                    <strong>SPI:</strong> ${presenceTournai.spi} &nbsp;|&nbsp; 
                    <strong>OPI:</strong> ${presenceTournai.opi} &nbsp;|&nbsp; 
                    <strong>CPI:</strong> ${presenceTournai.cpi} &nbsp;|&nbsp; 
                    <strong>PA:</strong> ${presenceTournai.pa} &nbsp;|&nbsp; 
                    <strong>10h-18h:</strong> ${presenceTournai.shift_10_18}<br/><br/>
                    
                    <strong>Prise en charge :</strong><br/>
                    <ul style="list-style-type: none; padding-left: 0; margin-top: 5px;">
                        ${PRESET_STATIONS_FTY.map(st => `
                            <li style="margin-bottom: 4px; padding-left: 10px; border-left: 3px solid #eee;">
                                <strong>${st}:</strong> ${getStationText(st, 'FTY')}
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div style="color: #7f8c8d; font-size: 10pt; margin-top: 15px;">
                    <p>Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</p>
                    <p>Interventions PMR pour B-CS : Voir DICOS.</p>
                </div>
            </div>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport copié au format texte'], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
            toast.success("Rapport copié ! Collez-le dans Outlook.");
        } catch (err) {
            toast.error("Erreur de copie: " + err.message);
        }
    }

    // --- GENERATION PDF (Style Strict) ---
    function generatePDF() {
        const doc = new jsPDF();
        let y = 15; // Curseur vertical

        // Helper pour écrire du texte et descendre
        const writeLine = (text, fontSize = 10, isBold = false, color = [0, 0, 0], indent = 14) => {
            doc.setFontSize(fontSize);
            doc.setFont("helvetica", isBold ? "bold" : "normal");
            doc.setTextColor(...color);
            doc.text(text, indent, y);
            y += (fontSize / 2) + 2;
        };

        // Header
        writeLine(`Rapport Journalier - ${date.split('-').reverse().join('-')}`, 16, true);
        y += 5;

        // --- BLOC FMS ---
        writeLine("Prestation matin à FMS:", 12, true, [0, 0, 0]);
        writeLine("Prévu dans Quinyx gare de Mons:", 10, false, [100, 100, 100]);
        
        // Ligne Compteurs FMS (dessinée manuellement pour l'alignement)
        doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont("helvetica", "bold");
        doc.text(`SPI: ${presenceMons.spi}   OPI: ${presenceMons.opi}   CPI: ${presenceMons.cpi}   PA: ${presenceMons.pa}   10h-18h: ${presenceMons.shift_10_18}`, 14, y);
        y += 8;

        writeLine("Prise en charge:", 11, true);
        
        // Liste Gares FMS
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        PRESET_STATIONS_FMS.forEach(station => {
            const text = getStationText(station, 'FMS');
            // Gestion multi-lignes basique si le texte est très long
            const splitText = doc.splitTextToSize(`${station}: ${text}`, 180);
            doc.text(splitText, 14, y);
            y += (splitText.length * 5);
        });

        y += 5; // Espace

        // --- BLOC FTY ---
        // Vérifier si on doit passer à la page suivante
        if (y > 250) { doc.addPage(); y = 15; }

        writeLine("Prestation matin à FTY:", 12, true);
        writeLine("Prévu dans Quinyx gare de Tournai:", 10, false, [100, 100, 100]);

        // Ligne Compteurs FTY
        doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
        doc.text(`SPI: ${presenceTournai.spi}   OPI: ${presenceTournai.opi}   CPI: ${presenceTournai.cpi}   PA: ${presenceTournai.pa}   10h-18h: ${presenceTournai.shift_10_18}`, 14, y);
        y += 8;

        writeLine("Prise en charge:", 11, true);

        // Liste Gares FTY
        doc.setFont("helvetica", "normal");
        PRESET_STATIONS_FTY.forEach(station => {
            const text = getStationText(station, 'FTY');
            const splitText = doc.splitTextToSize(`${station}: ${text}`, 180);
            doc.text(splitText, 14, y);
            y += (splitText.length * 5);
        });

        y += 10;
        
        // --- FOOTER NOTES ---
        doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "italic");
        doc.text("Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR", 14, y);
        y += 5;
        doc.text("Interventions PMR pour B-CS: Voir DICOS", 14, y);

        doc.save(`rapport_pmr_${date}.pdf`);
    }
</script>

<div class="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto pb-32">
    
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border rounded-xl p-5 shadow-sm">
        <div>
            <h1 class="text-2xl font-bold flex items-center gap-3">
                <div class="p-2 bg-primary/10 rounded-lg text-primary"><Car class="h-6 w-6" /></div>
                Déplacements & PMR
            </h1>
            <p class="text-muted-foreground text-sm mt-1">Gestion des prises en charge journalières</p>
        </div>
        <div class="flex flex-wrap gap-2">
            <button onclick={saveData} disabled={loading} class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                <Save class="w-4 h-4 mr-2" /> {loading ? '...' : 'Sauvegarder'}
            </button>
            <button onclick={copyForOutlook} class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                <Mail class="w-4 h-4 mr-2 text-blue-500" /> Copier Mail
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

            <div class="bg-card border rounded-xl p-5 shadow-sm relative overflow-hidden">
                <div class="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full pointer-events-none"></div>
                <h3 class="font-semibold mb-4 text-card-foreground flex items-center gap-2">
                    <MapPin class="w-4 h-4 text-blue-500" /> Présence MONS
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    {#each Object.keys(presenceMons) as key}
                        <div class="space-y-1">
                            <label class="text-[10px] uppercase text-muted-foreground font-bold">{key.replace('shift_', '')}</label>
                            <input type="number" min="0" bind:value={presenceMons[key]} class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-center font-mono focus:ring-1 focus:ring-blue-500" />
                        </div>
                    {/each}
                </div>
            </div>

            <div class="bg-card border rounded-xl p-5 shadow-sm relative overflow-hidden">
                <div class="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 rounded-bl-full pointer-events-none"></div>
                <h3 class="font-semibold mb-4 text-card-foreground flex items-center gap-2">
                    <MapPin class="w-4 h-4 text-purple-500" /> Présence TOURNAI
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    {#each Object.keys(presenceTournai) as key}
                        <div class="space-y-1">
                            <label class="text-[10px] uppercase text-muted-foreground font-bold">{key.replace('shift_', '')}</label>
                            <input type="number" min="0" bind:value={presenceTournai[key]} class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-center font-mono focus:ring-1 focus:ring-purple-500" />
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <div class="xl:col-span-3">
            <div class="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[600px]">
                <div class="p-4 border-b flex justify-between items-center bg-muted/30">
                    <h3 class="font-semibold text-card-foreground flex items-center gap-2">
                        <Users class="w-4 h-4" /> Détail des interventions
                        <span class="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full border">{interventions.length}</span>
                    </h3>
                    <button onclick={addRow} class="text-xs bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 shadow-sm">
                        <Plus class="w-3 h-3" /> Ajouter ligne
                    </button>
                </div>

                <div class="overflow-x-auto flex-1">
                    <table class="w-full text-sm text-left border-collapse">
                        <thead class="text-muted-foreground uppercase text-[10px] font-bold bg-muted/10 border-b">
                            <tr>
                                <th class="px-4 py-3 w-24 text-center">Zone</th>
                                <th class="px-4 py-3 w-32">Gare</th>
                                <th class="px-4 py-3">PMR / Mission</th>
                                <th class="px-4 py-3 w-64">Prise en charge</th>
                                <th class="px-2 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            {#each interventions as row, i}
                                <tr class="hover:bg-muted/40 group transition-colors">
                                    <td class="p-2">
                                        <div class="flex items-center justify-center">
                                            <input 
                                                bind:value={row.zone} 
                                                class="w-16 bg-transparent text-center font-mono text-xs uppercase border border-transparent hover:border-border rounded focus:outline-none focus:border-primary px-1 py-1" 
                                                placeholder="ZONE" 
                                            />
                                        </div>
                                    </td>
                                    <td class="p-2">
                                        <input 
                                            list="stations" 
                                            value={row.station} 
                                            oninput={(e) => handleStationChange(i, e.target.value)} 
                                            class="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1.5 font-bold uppercase focus:outline-none transition-all placeholder:font-normal" 
                                            placeholder="GARE..." 
                                        />
                                    </td>
                                    <td class="p-2">
                                        <input 
                                            bind:value={row.pmr_details} 
                                            class="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1.5 focus:outline-none transition-all placeholder:text-muted-foreground/50" 
                                            placeholder="Ex: 2026-01-17 1 CRF..." 
                                        />
                                    </td>
                                    <td class="p-2">
                                        <select 
                                            bind:value={row.assigned_to} 
                                            class="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1.5 focus:outline-none cursor-pointer text-xs sm:text-sm text-foreground/90"
                                        >
                                            <option value="" disabled selected class="text-muted-foreground">- Choisir -</option>
                                            {#each ASSIGNEES as person}
                                                <option value={person}>{person}</option>
                                            {/each}
                                        </select>
                                    </td>
                                    <td class="p-2 text-center">
                                        <button 
                                            onclick={() => removeRow(i)} 
                                            class="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100"
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
                        <div class="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
                            <div class="bg-muted/20 p-4 rounded-full mb-3">
                                <Car class="w-8 h-8 stroke-1" />
                            </div>
                            <p class="text-sm font-medium">Aucune intervention enregistrée</p>
                            <p class="text-xs">Commencez par ajouter une ligne ou chargez une date existante.</p>
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