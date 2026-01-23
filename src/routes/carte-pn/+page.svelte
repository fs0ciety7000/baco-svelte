<script>
    import { onMount } from 'svelte';
    import { fly, fade, scale } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { toast } from '$lib/stores/toast.js';
    import { 
        Search, Map as MapIcon, Loader2, CheckSquare, Square, Layers, 
        Navigation, Eye, X, AlertTriangle, Train, Split
    } from 'lucide-svelte';

    // Libs
    import { supabase } from '$lib/supabase';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { PnService } from '$lib/services/pn.service.js';
    import Map from '$lib/components/ui/map/Map.svelte';

    // --- CONFIG DEPOTS ---
    const DEPOTS = {
        'FTY': { label: 'Tournai', coords: '50.613056,3.396944', address: 'Place Crombez, 7500 Tournai' },
        'FMS': { label: 'Mons', coords: '50.4557,3.9395', address: 'Avenue Melina Mercouri 5, 7000 Mons' },
        'FCR': { label: 'Charleroi', coords: '50.404444,4.438611', address: 'Square des Martyrs, 6000 Charleroi' },
        'Autre': { label: 'Mons (Défaut)', coords: '50.4557,3.9395' } // Fallback
    };

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let isLoading = $state(true);

    // Données
    let allPnData = $state([]);
    let availableLines = $state([]);
    let mapZones = $state([]);

    // Filtres
    let searchQuery = $state("");
    let selectedLines = $state([]);
    let selectedZones = $state(['FTY', 'FMS', 'FCR', 'Autre']);
    let showAllLines = $state(true);

    // UI Carte
    let mapInstance = $state(null);
    let mapStyle = $state('dark'); // 'dark' | 'light'
    let viewingPn = $state(null);

    // --- DERIVED ---
    let filteredPn = $derived(allPnData.filter(pn => {
        const lineMatch = selectedLines.includes(pn.ligne_nom);
        const zoneMatch = selectedZones.includes(pn.zone);
        const q = searchQuery.toLowerCase().trim();
        const searchMatch = !q || 
            (pn.pn && String(pn.pn).toLowerCase().includes(q)) || 
            (pn.adresse && pn.adresse.toLowerCase().includes(q)) ||
            (pn.ligne_nom && pn.ligne_nom.toLowerCase().includes(q));
        
        return lineMatch && zoneMatch && searchMatch;
    }));

    // --- INIT ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.CARTE_PN_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        mapZones = PnService.getZones();
        await loadData();
    });

    async function loadData() {
        try {
            const [lines, pns] = await Promise.all([
                PnService.loadLines(),
                PnService.loadPnData()
            ]);
            availableLines = lines;
            selectedLines = [...lines];
            allPnData = pns;
        } catch(e) {
            toast.error("Erreur chargement données");
        } finally {
            isLoading = false;
        }
    }

    // --- ACTIONS ---
    function toggleAllLines(e) {
        showAllLines = e.target.checked;
        selectedLines = showAllLines ? [...availableLines] : [];
    }

    function toggleLine(line) {
        if (selectedLines.includes(line)) {
            selectedLines = selectedLines.filter(l => l !== line);
            showAllLines = false;
        } else {
            selectedLines = [...selectedLines, line];
            if (selectedLines.length === availableLines.length) showAllLines = true;
        }
    }

    function toggleZone(key) {
        if (selectedZones.includes(key)) {
            selectedZones = selectedZones.filter(z => z !== key);
        } else {
            selectedZones = [...selectedZones, key];
        }
    }

    function handlePnClick(pn) {
        if (!pn.geo) return toast.error("Position inconnue");
        const [lat, lon] = pn.geo.split(',').map(parseFloat);
        if (mapInstance) {
            mapInstance.flyTo({ center: [lon, lat], zoom: 16, essential: true });
        }
    }

    function openStreetView(pn) {
        if (!pn.geo) return;
        viewingPn = pn;
    }

    // --- ITINÉRAIRE (TRAFIC) ---
    function openRoute(pn) {
        if (!pn.geo) return toast.error("Pas de coordonnées GPS");
        
        // Détermination du dépôt selon la zone
        const depot = DEPOTS[pn.zone] || DEPOTS['Autre'];
        
        // URL Google Maps (Calcul itinéraire)
        // origin = Dépôt | destination = PN | travelmode = driving (voiture)
        const url = `https://www.google.com/maps/dir/?api=1&origin=${depot.coords}&destination=${pn.geo}&travelmode=driving`;
        
        window.open(url, '_blank');
    }

    // --- UTILS ---
    function getZoneColor(zone) {
        const z = mapZones.find(z => z.key === zone);
        return z ? z.color : '#6b7280';
    }

</script>

<svelte:head>
  <title>Carte PN | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-blue-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-6 min-h-screen relative">
      
      <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex gap-3">
            <button onclick={() => mapStyle = mapStyle === 'dark' ? 'light' : 'dark'} 
                class="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-bold {mapStyle === 'light' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-white/5'}">
                <MapIcon size={16} /> {mapStyle === 'dark' ? 'Plan' : 'Satellite'}
            </button>
        </div>
        
        <div class="text-right text-gray-500 text-xs font-mono">
            {filteredPn.length} Passages à Niveau affichés
        </div>
      </header>

      <div class="flex flex-col lg:flex-row gap-6 h-[calc(100vh-180px)]">
        
        <aside class="w-full lg:w-80 flex flex-col gap-4" in:fly={{ x: -20 }}>
            <div class="relative group">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-blue-400 transition-colors" />
                <input 
                    type="text" 
                    bind:value={searchQuery}
                    placeholder="PN, Rue, Ligne..." 
                    class="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                />
            </div>

            <div class="bg-black/20 border border-white/5 rounded-2xl p-4 flex-grow overflow-y-auto custom-scrollbar space-y-6">
                <div>
                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Layers size={14}/> Zones</h3>
                    <div class="flex flex-wrap gap-2">
                        {#each mapZones as z}
                            <button 
                                onclick={() => toggleZone(z.key)}
                                class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {selectedZones.includes(z.key) ? 'bg-white/10 text-white' : 'text-gray-500 border-transparent hover:bg-white/5'}"
                                style="border-color: {selectedZones.includes(z.key) ? z.color : 'transparent'}"
                            >
                                {z.key}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="h-px bg-white/5"></div>

                <div>
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2"><Train size={14}/> Lignes</h3>
                        <label class="flex items-center gap-2 cursor-pointer text-xs text-blue-400 font-bold hover:text-blue-300">
                            <input type="checkbox" checked={showAllLines} onchange={toggleAllLines} class="hidden">
                            <span>{showAllLines ? 'Tout masquer' : 'Tout afficher'}</span>
                        </label>
                    </div>
                    
                    <div class="grid grid-cols-3 gap-2">
                        {#each availableLines as line}
                            <button 
                                onclick={() => toggleLine(line)}
                                class="px-2 py-1.5 rounded text-xs font-mono font-medium border transition-all {selectedLines.includes(line) ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-white/5 text-gray-500 border-transparent hover:bg-white/10'}"
                            >
                                {line}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        </aside>

        <main class="flex-grow flex flex-col gap-4 relative">
            
            <div class="relative flex-grow rounded-3xl shadow-2xl border border-white/10 overflow-hidden bg-[#0f1115] min-h-[400px]">
                {#key mapStyle}
                    <Map 
                        bind:map={mapInstance} 
                        markers={filteredPn} 
                        zones={mapZones} 
                        showTraffic={false} 
                        style={mapStyle}
                        clustering={true}
                        className="w-full h-full" 
                    />
                {/key}
            </div>

            <div class="h-[500px] bg-black/20 border border-white/5 rounded-2xl p-4 overflow-y-auto custom-scrollbar">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {#each filteredPn as pn (pn.pn + pn.ligne_nom)}
                        <div class="bg-black/40 border border-white/5 p-3 rounded-xl hover:bg-white/5 hover:border-blue-500/30 transition-all group relative flex flex-col justify-between">
                            <button onclick={() => handlePnClick(pn)} class="text-left w-full mb-3">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <span class="font-bold text-gray-200">{pn.pn}</span> <span class="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400">{pn.ligne_nom}</span>
                                        </div>
                                        <div class="text-xs text-gray-500 mt-1 truncate max-w-[200px]" title={pn.adresse}>{pn.adresse || 'Sans adresse'}</div>
                                    </div>
                                    <div class="w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]" style="background-color: {getZoneColor(pn.zone)}; color: {getZoneColor(pn.zone)}"></div>
                                </div>
                            </button>
                            
                            {#if pn.geo}
                                <div class="flex items-center gap-2 pt-2 border-t border-white/5">
                                    <button 
                                        onclick={(e) => { e.stopPropagation(); openRoute(pn); }} 
                                        class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-bold uppercase hover:bg-green-500/20 transition-colors"
                                        title="Itinéraire depuis {DEPOTS[pn.zone]?.label || 'Dépôt'}"
                                    >
                                        <Split size={12}/> Trajet
                                    </button>
                                    <button 
                                        onclick={(e) => { e.stopPropagation(); openStreetView(pn); }} 
                                        class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase hover:bg-blue-500/20 transition-colors"
                                    >
                                        <Eye size={12}/> Vue
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/each}
                    {#if filteredPn.length === 0}
                        <div class="col-span-full text-center py-10 text-gray-500 italic">Aucun PN ne correspond aux filtres.</div>
                    {/if}
                </div>
            </div>

        </main>
      </div>
    </div>

    {#if viewingPn}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" transition:fade>
            <div class="bg-[#1a1d24] w-full max-w-5xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" in:scale>
                <div class="flex justify-between items-center p-4 border-b border-white/5 bg-black/40">
                    <h3 class="text-lg font-bold text-white flex items-center gap-2">
                        <Eye size={18} class="text-blue-400" /> PN {viewingPn.pn} <span class="text-gray-500 text-sm font-normal">({viewingPn.adresse})</span>
                    </h3>
                    <button onclick={() => viewingPn = null} class="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"><X size={20}/></button>
                </div>
                
                <div class="relative bg-black h-[600px]">
                    <iframe 
                        title="Google Maps"
                        width="100%" 
                        height="100%" 
                        style="border:0" 
                        loading="lazy" 
                        allowfullscreen 
                        src={`https://maps.google.com/maps?q=${viewingPn.geo}&layer=c&cbll=${viewingPn.geo}&cbp=12,0,0,0,0&output=svembed`}>
                    </iframe>
                    
                    <div class="absolute bottom-6 right-6 pointer-events-auto flex gap-3">
                        <button 
                           onclick={() => openRoute(viewingPn)}
                           class="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                            <Navigation size={16}/> Itinéraire
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
{/if}