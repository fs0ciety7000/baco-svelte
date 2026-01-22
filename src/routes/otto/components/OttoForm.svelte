<script>
    import { fade, slide, fly } from 'svelte/transition';
    import { Loader2, MapPin, Plus, MinusCircle, User, CheckCircle, X, Mail, ClipboardCopy, Check, Printer, LockOpen, Save, FileText, Bus, Hash } from 'lucide-svelte';
    import { GeoService } from '$lib/services/geo.service.js';
    import { OttoReportsService } from '$lib/services/ottoReports.service.js';
    import { toast } from '$lib/stores/toast.js';
    import Map from '$lib/components/ui/map/Map.svelte';

    // --- PROPS ---
    let { 
        form = $bindable(), 
        societes = [], 
        chauffeurs = [], 
        referenceData = { lines: [], stops: [], raw: [] },
        isLocked, 
        currentUser,
        onSave, 
        onUnlock, 
        onBack 
    } = $props();

    // --- LOCAL STATE ---
    let societeInputValue = $state("");
    let isComputingRoute = $state(false);
    let currentRoute = $state(null);
    let currentMarkers = $state([]);
    let showEmailExport = $state(false);
    let emailBody = $state("");
    let hasCopied = $state(false);

      // --- DERIVED STATE (TRI INTELLIGENT) ---
    // Calcul des arrêts intermédiaires triés par logique de ligne
    let availableStops = $derived.by(() => {
        // 1. Récupérer tous les arrêts des lignes sélectionnées
        let candidates = (referenceData.raw || [])
            .filter(r => form.lignes.includes(r.ligne_nom));

        // 2. Trouver les objets "Station" correspondant à l'Origine et Destination actuelles
        const startObj = candidates.find(r => r.gare === form.origine);
        const endObj = candidates.find(r => r.gare === form.destination);

        // CAS A : Origine ET Destination sont définies (et sont sur la même ligne)
        if (startObj && endObj && startObj.ligne_nom === endObj.ligne_nom) {
            // On détermine le sens : 1 (Croissant) ou -1 (Décroissant)
            const isAscending = startObj.ordre < endObj.ordre;

            return candidates
                .filter(r => r.ligne_nom === startObj.ligne_nom) // Filtrer sur la bonne ligne
                .filter(r => {
                    // Garder uniquement les gares STRICTEMENT ENTRE l'origine et la destination
                    if (isAscending) return r.ordre > startObj.ordre && r.ordre < endObj.ordre;
                    return r.ordre < startObj.ordre && r.ordre > endObj.ordre;
                })
                .sort((a, b) => isAscending ? a.ordre - b.ordre : b.ordre - a.ordre) // Trier dans le sens du trajet
                .map(r => `${r.gare} (${r.ligne_nom})`);
        }

        // CAS B : Seulement Origine définie
        if (startObj) {
            // On trie par "Proximité" : Les gares les plus proches (avant ou après) apparaissent en premier
            return candidates
                .filter(r => r.gare !== form.origine && r.ligne_nom === startObj.ligne_nom)
                .sort((a, b) => Math.abs(a.ordre - startObj.ordre) - Math.abs(b.ordre - startObj.ordre))
                .map(r => `${r.gare} (${r.ligne_nom})`);
        }

        // CAS C : Rien de spécial, tri par ordre de ligne classique
        return candidates
            .sort((a, b) => a.ordre - b.ordre) // Tri géographique par défaut
            .map(r => `${r.gare} (${r.ligne_nom})`);
    });
    // --- HELPERS STYLES ---
    const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500/50 outline-none transition-all placeholder-gray-600";
    const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1 flex items-center gap-1";

    // --- EFFECTS ---
    $effect(() => {
        if (form.societe_id && societes.length > 0) {
            const selected = societes.find(s => s.id === form.societe_id);
            if (selected && selected.nom !== societeInputValue) {
                societeInputValue = selected.nom;
            }
        }
    });

    // Calcul d'itinéraire (Debounced via timeout interne)
    let searchTimeout;
    $effect(() => {
        if (form.origine && form.destination) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(calculateRoute, 1000);
        } else {
            currentRoute = null;
        }
    });

    // --- MAP LOGIC ---
    async function calculateRoute() {
        if (currentRoute?.properties?.start === form.origine && currentRoute?.properties?.end === form.destination) return;
        
        isComputingRoute = true;
        try {
            const startCoords = await GeoService.getGareCoordinates(form.origine);
            const endCoords = await GeoService.getGareCoordinates(form.destination);

            let waypoints = [];
            let newMarkers = [];

            if (startCoords) {
                newMarkers.push({ lngLat: startCoords, label: `Départ: ${form.origine}`, type: 'start' });
                waypoints.push(startCoords);
            }

            if (!form.is_direct && form.arrets.length > 0) {
                for (const stop of form.arrets) {
                    const stopName = stop.split('(')[0].trim();
                    const coords = await GeoService.getGareCoordinates(stopName);
                    if (coords) {
                        newMarkers.push({ lngLat: coords, label: stopName, type: 'stop' });
                        waypoints.push(coords);
                    }
                }
            }

            if (endCoords) {
                newMarkers.push({ lngLat: endCoords, label: `Arrivée: ${form.destination}`, type: 'end' });
                waypoints.push(endCoords);
            }

            if (startCoords && endCoords) {
                const geometry = await GeoService.fetchRouteOSRM(waypoints);
                currentMarkers = newMarkers;
                currentRoute = {
                    type: "Feature",
                    geometry: geometry,
                    properties: { start: form.origine, end: form.destination }
                };
            }
        } finally {
            isComputingRoute = false;
        }
    }

    // --- FORM ACTIONS ---
    function handleSocieteChange(e) {
        const val = e.target.value;
        societeInputValue = val;
        const match = societes.find(s => s.nom.toLowerCase() === val.toLowerCase());
        
        if (match) {
             form.societe_id = match.id;
        } else if (val === "") {
             form.societe_id = null;
        }
    }

    function addBus() {
        const last = form.bus_data.at(-1) || {};
        form.bus_data = [...form.bus_data, { 
            plaque: '', heure_prevue: last.heure_prevue || '', 
            heure_confirmee: '', heure_demob: last.heure_demob || '', 
            chauffeur_id: null, is_specific_route: false 
        }];
    }

    function removeBus(idx) {
        if (form.bus_data.length > 1) {
            form.bus_data = form.bus_data.filter((_, i) => i !== idx);
        }
    }

    function toggleLine(line) {
        if (form.lignes.includes(line)) form.lignes = form.lignes.filter(l => l !== line);
        else form.lignes = [...form.lignes, line];
    }

    function toggleStop(stop) {
        if (form.arrets.includes(stop)) form.arrets = form.arrets.filter(s => s !== stop);
        else form.arrets = [...form.arrets, stop];
    }

    // --- EXPORTS ---
    async function handlePDF() {
        const society = societes.find(s => s.id === form.societe_id);
        await OttoReportsService.generateCommandePDF(form, society, currentUser, chauffeurs);
    }

    function prepareEmail() {
        const society = societes.find(s => s.id === form.societe_id);
        emailBody = `Bonjour, voici le réquisitoire pour le trajet de ce ${new Date(form.date_commande).toLocaleDateString('fr-BE')} entre ${form.origine || '?'} et ${form.destination || '?'} - ${form.relation} (${form.is_direct ? 'Direct' : 'Omnibus'})

Merci pour vos services,

Cordialement,

${form.validator?.full_name || currentUser?.full_name || 'Équipe PACO'}
PACO Sud-Ouest`;
        showEmailExport = true;
    }
    
    function sendEmailLink() {
        const society = societes.find(s => s.id === form.societe_id);
        const emailTo = society?.email || "";
        const subject = encodeURIComponent(`Réquisitoire Bus - ${form.relation} - ${new Date(form.date_commande).toLocaleDateString('fr-BE')}`);
        window.location.href = `mailto:${emailTo}?subject=${subject}&body=${encodeURIComponent(emailBody)}`;
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(emailBody);
            hasCopied = true;
            toast.success("Copié !");
            setTimeout(() => hasCopied = false, 2000);
        } catch(e) { toast.error("Erreur copie"); }
    }
</script>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-8" in:fade>
    <div class="xl:col-span-2 space-y-6">
        
        <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
            <h3 class="text-sm font-bold text-orange-400 uppercase tracking-wide mb-4 flex items-center gap-2"><FileText size={16}/> Mission</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2"><label class={labelClass}>Motif</label><input type="text" bind:value={form.motif} disabled={isLocked} class={inputClass} placeholder="Ex: Dérangement L.96..."></div>
                <div><label class={labelClass}>Date</label><input type="date" bind:value={form.date_commande} disabled={isLocked} class="{inputClass} dark:[color-scheme:dark]"></div>
                <div><label class={labelClass}>Heure d'appel</label><input type="time" bind:value={form.heure_appel}  disabled={isLocked} class="{inputClass} dark:[color-scheme:dark]"></div>
                <div><label class={labelClass}>Réf. Relation (TC)</label><input type="text" bind:value={form.relation} disabled={isLocked} class={inputClass} placeholder="TC_123456"></div>
                <div>
                    <label class={labelClass}>Société</label>
                    <div class="relative group">
                       <input type="text" list="list_societes" bind:value={societeInputValue} oninput={handleSocieteChange} disabled={isLocked} class="{inputClass} pr-8" placeholder="Rechercher...">
                       <datalist id="list_societes">{#each societes as soc}<option value={soc.nom}>{soc.nom}</option>{/each}</datalist>
                       {#if form.societe_id}<div class="absolute right-3 top-2.5 text-orange-400 pointer-events-none"><CheckCircle size={16} /></div>{/if}
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-sm font-bold text-blue-400 uppercase tracking-wide flex items-center gap-2"><MapPin size={16}/> Parcours</h3>
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                        <input type="checkbox" bind:checked={form.is_direct} disabled={isLocked} class="hidden">
                        <span class="text-[10px] font-bold {form.is_direct ? 'text-orange-400' : 'text-gray-500'}">DIRECT</span>
                        <div class="relative w-8 h-4 bg-gray-700 rounded-full transition-colors"><div class="absolute top-1 left-1 w-2 h-2 bg-white rounded-full transition-transform {form.is_direct ? '' : 'translate-x-4'}"></div></div>
                        <span class="text-[10px] font-bold {!form.is_direct ? 'text-yellow-400' : 'text-gray-500'}">OMNIBUS</span>
                    </label>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <div><label class={labelClass}>Origine</label><input type="text" list="stations" bind:value={form.origine} disabled={isLocked} class={inputClass} placeholder="Gare"></div>
                <div><label class={labelClass}>Destination</label><input type="text" list="stations" bind:value={form.destination} disabled={isLocked} class={inputClass} placeholder="Gare"></div>
                <datalist id="stations">{#each referenceData.stops as st} <option value={st} /> {/each}</datalist>
            </div>

            <div class="w-full h-64 rounded-xl overflow-hidden border border-white/10 relative z-0 mt-4 shadow-inner bg-[#16181d]">
                {#if isComputingRoute}
                    <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-10 text-orange-400">
                        <Loader2 size={32} class="animate-spin mb-2" />
                    </div>
                {/if}
                {#if currentRoute}
                    <Map route={currentRoute} markers={currentMarkers} className="w-full h-full" />
                {:else}
                    <div class="w-full h-full flex items-center justify-center text-gray-600 opacity-40"><MapPin size={32} /></div>
                {/if}
            </div>

             <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                <div><label class={labelClass}>Voyageurs</label><input type="number" bind:value={form.nombre_voyageurs} disabled={isLocked} class={inputClass}></div>
                <div><label class={labelClass}>PMR</label><input type="number" bind:value={form.nombre_pmr} disabled={isLocked} class={inputClass}></div>
                <div><label class={labelClass}>Capacité</label><input type="number" bind:value={form.capacite_bus} disabled={isLocked} class={inputClass}></div>
            </div>
        </div>

        <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
             <div class="flex justify-between items-center mb-4">
                <h3 class="text-sm font-bold text-green-400 uppercase tracking-wide flex items-center gap-2"><Bus size={16}/> Véhicules</h3>
                {#if !isLocked}
                    <button onclick={addBus} class="text-xs bg-green-500/20 text-green-400 px-3 py-1.5 rounded-lg border border-green-500/30 flex items-center gap-1 font-bold"><Plus size={14}/> Ajouter</button>
                {/if}
            </div>
            
            <div class="space-y-4">
                {#each form.bus_data as bus, i}
                    <div class="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                        <div class="flex justify-between items-center px-4 py-2 bg-black/20 border-b border-white/5">
                            <span class="text-xs font-mono font-bold text-orange-400">BUS #{i+1}</span>
                            <button onclick={() => removeBus(i)} disabled={isLocked} class="text-gray-500 hover:text-red-400 p-1"><MinusCircle size={16}/></button>
                        </div>
                        <div class="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div><label class="text-[10px] text-gray-500 font-bold block">PLAQUE</label><input type="text" bind:value={bus.plaque} disabled={isLocked} class="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-sm text-white uppercase"></div>
                            <div><label class="text-[10px] text-gray-500 font-bold block">PREVUE</label><input type="time" bind:value={bus.heure_prevue} disabled={isLocked} class="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-sm text-white dark:[color-scheme:dark]"></div>
                            <div><label class="text-[10px] text-green-500/70 font-bold block">CONFIRMÉE</label><input type="time" bind:value={bus.heure_confirmee} disabled={isLocked} class="w-full bg-black/30 border border-green-900/30 rounded-lg px-2 py-1 text-sm text-green-300 dark:[color-scheme:dark]"></div>
                            <div><label class="text-[10px] text-purple-400 font-bold block">DÉMOB.</label><input type="time" bind:value={bus.heure_demob} disabled={isLocked} class="w-full bg-black/30 border border-purple-500/30 rounded-lg px-2 py-1 text-sm text-purple-300 dark:[color-scheme:dark]"></div>
                            <div>
                                <label class="text-[10px] text-blue-400 font-bold block">CHAUFFEUR</label>
                                <select bind:value={bus.chauffeur_id} disabled={isLocked} class="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-sm text-white">
                                    <option value={null}>--</option>
                                    {#each chauffeurs as chauf}<option value={chauf.id}>{chauf.nom}</option>{/each}
                                </select>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </div>

    <div class="space-y-6">
        <div class="bg-black/20 border border-white/5 rounded-2xl p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
            <h3 class="text-sm font-bold text-purple-400 uppercase tracking-wide mb-4 sticky top-0 bg-[#16181d] py-2 z-10 flex items-center gap-2"><Hash size={16}/> Lignes</h3>
            <div class="flex flex-wrap gap-2">
                {#each referenceData.lines as line}
                    <button onclick={() => !isLocked && toggleLine(line)} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {form.lignes.includes(line) ? 'bg-purple-600 text-white border-purple-500' : 'bg-white/5 border-white/10 text-gray-400'}">{line}</button>
                {/each}
            </div>
        </div>

        {#if !form.is_direct && form.lignes.length > 0}
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 max-h-[400px] overflow-y-auto custom-scrollbar" transition:slide>
                <h3 class="text-sm font-bold text-yellow-400 uppercase tracking-wide mb-4 sticky top-0 bg-[#16181d] py-2 z-10 flex items-center gap-2"><MapPin size={16}/> Arrêts</h3>
                <div class="space-y-1">
                    {#each availableStops as stop}
                        <button onclick={() => !isLocked && toggleStop(stop)} class="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-3 transition-colors {form.arrets.includes(stop) ? 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20' : 'hover:bg-white/5 text-gray-400'}">
                            <div class="w-4 h-4 border rounded flex items-center justify-center border-white/30">{#if form.arrets.includes(stop)}<Check size={10}/>{/if}</div>
                            {stop}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>

<div class="fixed bottom-4 left-4 right-4 z-50 flex flex-wrap justify-end items-center gap-4 p-4 border border-white/10 bg-[#0f1115]/90 backdrop-blur-2xl shadow-2xl rounded-2xl" in:fly={{ y: 20 }}>
    <label class="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer mr-auto {isLocked ? 'opacity-50 pointer-events-none' : ''}">
        <input type="checkbox" bind:checked={form.is_mail_sent} disabled={isLocked} class="hidden peer">
        <div class="w-4 h-4 border border-gray-500 rounded peer-checked:bg-emerald-500 peer-checked:border-emerald-500 flex items-center justify-center text-black"><Check size={12} class={form.is_mail_sent?'block':'hidden'}/></div>
        <span class="text-xs font-bold {form.is_mail_sent ? 'text-emerald-400' : 'text-gray-400'} uppercase">Mail envoyé</span>
    </label>

    <button onclick={prepareEmail} class="px-5 py-2.5 rounded-full text-sm font-bold text-blue-400 bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 flex items-center gap-2"><Mail size={16} /> E-mail</button>
    <button onclick={handlePDF} class="px-5 py-2.5 rounded-full text-sm font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 flex items-center gap-2"><Printer size={16} /> PDF</button>

    {#if isLocked}
        <button onclick={onUnlock} class="px-6 py-2.5 rounded-full text-sm font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 flex items-center gap-2"><LockOpen size={16} /> Déverrouiller</button>
    {:else}
        <button onclick={() => onSave('brouillon')} class="px-6 py-2.5 rounded-full text-sm font-medium text-gray-400 bg-white/5 border border-white/5 hover:bg-white/10 flex items-center gap-2"><Save size={16} /> Brouillon</button>
        <button onclick={() => onSave('envoye')} class="px-6 py-2.5 rounded-full text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 flex items-center gap-2"><CheckCircle size={16} /> Clôturer</button>
    {/if}
</div>
<div class="h-24"></div>

{#if showEmailExport}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
        <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" in:fly={{ y: 20 }}>
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-white flex items-center gap-2"><Mail class="text-blue-400" size={20} /> Export E-mail</h3>
                <button onclick={() => showEmailExport = false} class="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div class="relative group">
                <textarea readonly class="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none font-mono" bind:value={emailBody}></textarea>
                <button onclick={copyToClipboard} class="absolute top-3 right-3 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 shadow-lg transition-all flex items-center gap-2 text-xs font-bold">
                    {#if hasCopied}<Check size={14} /> Copié{:else}<ClipboardCopy size={14} /> Copier{/if}
                </button>
            </div>
            <div class="mt-6 flex justify-between gap-3">
                <button onclick={() => showEmailExport = false} class="px-4 py-2 rounded-xl bg-white/5 text-gray-400 font-bold hover:bg-white/10">Fermer</button>
                <button onclick={sendEmailLink} class="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-lg shadow-blue-500/20">Ouvrir Outlook</button>
            </div>
        </div>
    </div>
{/if}