<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { Search, Map as MapIcon, Loader2, CheckSquare, Square, Layers, Navigation, Eye, X, AlertTriangle } from 'lucide-svelte';
  import { fly, fade, scale } from 'svelte/transition';
  
  import Map from '$lib/components/ui/map/Map.svelte';
  import { toast } from '$lib/stores/toast.js';
  import { hasPermission, ACTIONS } from '$lib/permissions';

  // --- ÉTAT ---
  let currentUser = $state(null);
  let isAuthorized = $state(false);
  let allPnData = $state([]);
  let availableLines = $state([]);
  let selectedLines = $state([]); 
  let showAllLines = $state(true);
  let searchQuery = $state("");
  let isLoading = $state(true);
  
  // Nouveaux États UI
  let showTraffic = $state(false);
  let selectedZones = $state(['FTY', 'FMS', 'FCR']);
  let viewingPn = $state(null); // Pour la modale Street View

  // Instance de carte
  let mapInstance = $state(null);

  // --- ZONES (Format [Lon, Lat]) ---
  const rawZones = {
    'FTY': { coords: [[3.2240, 50.7610], [3.2403, 50.7166], [3.7785, 50.4569], [4.1717, 50.7211], [4.1780, 50.7135]], color: '#3b82f6', name: "Zone FTY" },
    'FMS': { coords: [[3.6856, 50.4102], [3.7785, 50.4569], [3.7998, 50.6145], [4.1379, 50.6055], [4.2124, 50.7069], [4.2342, 50.5064], [4.2441, 50.4603], [4.1749, 50.4049], [3.9391, 50.4512], [3.9574, 50.4720], [3.9083, 50.3291]], color: '#eab308', name: "Zone FMS" },
    'FCR': { coords: [[4.3785, 50.7302], [4.3876, 50.5048], [4.5478, 50.4863], [4.6463, 50.4457], [4.4920, 50.0566], [4.1110, 50.3033], [4.2441, 50.4603], [4.2399, 50.5035]], color: '#ef4444', name: "Zone FCR" }
  };

  // Préparation des zones pour la Map (GeoJSON)
  const mapZones = Object.values(rawZones).map(z => {
      const closedCoords = [...z.coords];
      const first = closedCoords[0];
      const last = closedCoords[closedCoords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) closedCoords.push(first);
      return {
          name: z.name, color: z.color,
          geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [closedCoords] } }
      };
  });

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
    await Promise.all([loadLines(), loadAllPnData()]);
  });

  async function loadLines() {
    const { data } = await supabase.from('pn_data').select('ligne_nom');
    if (data) {
      const lines = [...new Set(data.map(i => i.ligne_nom).filter(Boolean))].sort();
      availableLines = lines;
      selectedLines = [...lines]; 
    }
  }

  async function loadAllPnData() {
    const { data, error } = await supabase.from('pn_data').select('ligne_nom, pn, bk, adresse, geo');
    if (!error) {
        // On enrichit les données avec la détection de zone locale
        allPnData = data.map(pn => {
            let zone = 'Autre';
            if (pn.geo) {
                const [lat, lon] = pn.geo.split(',').map(parseFloat);
                // Simple point in polygon
                for (const [key, z] of Object.entries(rawZones)) {
                    if (isPointInPolygon([lon, lat], z.coords)) {
                        zone = key;
                        break;
                    }
                }
            }
            return { ...pn, zone };
        });
        
        geocodeMissingPns(allPnData);
    }
    isLoading = false;
  }

  // --- ALGORITHME POINT IN POLYGON (Ray Casting) ---
  function isPointInPolygon(point, vs) {
      var x = point[0], y = point[1];
      var inside = false;
      for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          var xi = vs[i][0], yi = vs[i][1];
          var xj = vs[j][0], yj = vs[j][1];
          var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
      }
      return inside;
  }

  // --- CORRECTIF GÉOCODAGE & SAUVEGARDE ---
  async function geocodeMissingPns(pns) {
      const pnsMissingGeo = pns.filter(p => !p.geo);
      const CHUNK_SIZE = 2; 
      
      for (let i = 0; i < pnsMissingGeo.length; i += CHUNK_SIZE) {
          const chunk = pnsMissingGeo.slice(i, i + CHUNK_SIZE);
          
          await Promise.all(chunk.map(async (pn) => {
              const coords = await fetchCoordinates(pn);
              if (coords) {
                  const geoString = `${coords[1]},${coords[0]}`; // Lat,Lon pour stockage string
                  
                  // 1. Mise à jour locale (Reactive)
                  pn.geo = geoString;
                  // Recalcul de la zone
                  for (const [key, z] of Object.entries(rawZones)) {
                        if (isPointInPolygon([coords[0], coords[1]], z.coords)) {
                            pn.zone = key;
                            break;
                        }
                  }

                  // 2. SAUVEGARDE DB (Avec ZONE)
                  try {
                       await supabase
                          .from('pn_data')
                          .update({ 
                              geo: geoString,
                              zone: pn.zone // <--- AJOUT ICI
                          })
                          .eq('pn', pn.pn)
                          .eq('ligne_nom', pn.ligne_nom);
                  } catch (err) {
                      console.error("Erreur sauvegarde geo", err);
                  }
              }
          }));
          await new Promise(r => setTimeout(r, 600)); // Un peu plus lent pour être safe
      }
  }

  async function fetchCoordinates(pn) {
      let cleanAddress = (pn.adresse || "").replace(/^PN\s*\d+\s*[-]?\s*/i, "").trim();
      let q = `${cleanAddress}, Belgique`;
      
      if (!cleanAddress) return null;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'BacoApp/1.0' } });
        if (res.ok) {
            const data = await res.json();
            if (data?.[0]) return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
        }
      } catch {}
      return null;
  }

  // --- FILTRAGE RÉACTIF ---
  // Ce bloc gère automatiquement les markers sur la carte car filteredPn est passé au composant Map
  let filteredPn = $derived(allPnData.filter(pn => {
    const lineMatch = selectedLines.includes(pn.ligne_nom);
    const zoneMatch = selectedZones.includes(pn.zone) || (pn.zone === 'Autre' && selectedZones.includes('FCR')); // Fallback zone
    const searchMatch = !searchQuery.trim() || 
      (pn.pn && String(pn.pn).toLowerCase().includes(searchQuery.toLowerCase())) ||
      (pn.adresse && pn.adresse.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return lineMatch && zoneMatch && searchMatch;
  }));

  // --- ACTIONS ---
  function toggleAllLines(e) {
    showAllLines = e.target.checked;
    selectedLines = showAllLines ? [...availableLines] : [];
  }

  function handleLineChange(line) {
    if (selectedLines.includes(line)) {
      selectedLines = selectedLines.filter(l => l !== line);
      showAllLines = false;
    } else {
      selectedLines = [...selectedLines, line];
      if (selectedLines.length === availableLines.length) showAllLines = true;
    }
  }
  
  function handleZoneChange(zoneKey) {
     if (selectedZones.includes(zoneKey)) selectedZones = selectedZones.filter(z => z !== zoneKey);
     else selectedZones = [...selectedZones, zoneKey];
  }

  function handlePnClick(pn) {
      if (!pn.geo) return toast.error("Ce PN n'est pas géolocalisé.");
      const [lat, lon] = pn.geo.split(',').map(parseFloat);
      mapInstance?.flyTo({ center: [lon, lat], zoom: 16, essential: true });
  }

  function openStreetView(pn) {
      if (!pn.geo) return;
      viewingPn = pn;
  }
</script>

<svelte:head>
  <title>Carte PN | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-[rgb(var(--color-primary))]" />
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen relative">
      
      <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" 
              in:fly={{ y: -20, duration: 600 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl border border-white/10 bg-white/5 text-themed">
                <MapIcon size={32} />
            </div>
            <div>
                <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Carte Interactive</h1>
                <p class="text-gray-500 text-sm mt-1">Localisation des Passages à Niveau.</p>
            </div>
        </div>
        
        <button onclick={() => showTraffic = !showTraffic} 
                class="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-bold
                {showTraffic ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-white/5'}">
            <AlertTriangle size={16} />
            Trafic {showTraffic ? 'ON' : 'OFF'}
        </button>
      </header>

      <div class="flex flex-col lg:flex-row gap-8">
        
        <aside class="w-full lg:w-1/4 space-y-6" in:fly={{ x: -20, duration: 600, delay: 100 }}>
          
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500"><Search size={18} /></div>
            <input type="text" placeholder="Recherche PN, Rue..." bind:value={searchQuery}
              class="block w-full pl-10 pr-3 py-3 bg-black/20 border border-white/10 rounded-2xl text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/50 outline-none placeholder-gray-600" />
          </div>

          <div class="bg-black/20 border border-white/5 rounded-2xl p-5 max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col gap-6">
             
             <div>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Layers size={14} /> Zones</h3>
                <div class="flex flex-wrap gap-2">
                    {#each Object.entries(rawZones) as [key, z]}
                        <button onclick={() => handleZoneChange(key)}
                            class="px-3 py-1 rounded-md text-xs font-bold border transition-all
                            {selectedZones.includes(key) ? 'bg-white/10 text-white' : 'bg-transparent text-gray-500 border-transparent hover:bg-white/5'}"
                            style="border-color: {selectedZones.includes(key) ? z.color : 'transparent'}">
                            {key}
                        </button>
                    {/each}
                </div>
             </div>

             <div class="h-px bg-white/5"></div>

             <div>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Lignes</h3>
                <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer group">
                    <input type="checkbox" checked={showAllLines} onchange={toggleAllLines} class="hidden">
                    {#if showAllLines}<CheckSquare class="w-4 h-4 text-blue-500" />{:else}<Square class="w-4 h-4 text-gray-600" />{/if}
                    <span class="text-sm font-bold text-gray-300">Toutes</span>
                </label>
                <div class="space-y-1 mt-2 pl-2 border-l border-white/5">
                    {#each availableLines as line}
                    <label class="flex items-center space-x-3 p-1.5 rounded hover:bg-white/5 cursor-pointer group">
                        <input type="checkbox" checked={selectedLines.includes(line)} onchange={() => handleLineChange(line)} class="hidden">
                        {#if selectedLines.includes(line)}<CheckSquare class="w-3.5 h-3.5 text-blue-400" />{:else}<Square class="w-3.5 h-3.5 text-gray-600" />{/if}
                        <span class="text-xs text-gray-400 group-hover:text-gray-200">{line}</span>
                    </label>
                    {/each}
                </div>
             </div>
          </div>
        </aside>

        <main class="w-full lg:w-3/4 space-y-6">
          <div class="relative w-full h-[600px] rounded-3xl shadow-2xl border border-white/10 overflow-hidden bg-[#0f1115]">
            <Map 
                bind:map={mapInstance} 
                markers={filteredPn} 
                zones={mapZones} 
                showTraffic={showTraffic}
                clustering={true}
                className="w-full h-full" 
            />
            
            <div class="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl text-xs font-medium text-white shadow-lg pointer-events-none">
                {filteredPn.length} PN affichés
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-40 overflow-y-auto custom-scrollbar">
              {#each filteredPn.slice(0, 12) as pn} 
                <button onclick={() => handlePnClick(pn)} class="text-left bg-black/20 border border-white/5 p-3 rounded-xl hover:bg-white/10 transition-colors flex justify-between group">
                    <div>
                        <span class="font-bold text-gray-300 text-sm">PN {pn.pn}</span>
                        <span class="text-xs text-gray-500 block">{pn.ligne_nom}</span>
                    </div>
                    {#if pn.geo}
                    <div class="flex gap-2">
                        <button onclick={(e) => { e.stopPropagation(); openStreetView(pn); }} class="text-gray-500 hover:text-white" title="Street View"><Eye size={14}/></button>
                    </div>
                    {/if}
                </button>
              {/each}
          </div>
        </main>
      </div>
    </div>

    {#if viewingPn}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" transition:fade>
        <div class="bg-[#1a1d24] w-full max-w-4xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" in:scale>
            <div class="flex justify-between items-center p-4 border-b border-white/5 bg-black/20">
                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                    <Eye size={18} /> PN {viewingPn.pn} <span class="text-gray-500 text-sm font-normal">({viewingPn.adresse})</span>
                </h3>
                <button onclick={() => viewingPn = null} class="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} class="text-white"/></button>
            </div>
            
            <div class="relative bg-black h-[500px]">
                <iframe 
                    title="Street View"
                    width="100%" 
                    height="100%" 
                    style="border:0" 
                    loading="lazy" 
                    allowfullscreen 
                    src={`https://www.google.com/maps?q=${viewingPn.geo.split(',')[0]},${viewingPn.geo.split(',')[1]}&layer=c&z=17&output=embed`}>
                </iframe>
                
                <div class="absolute bottom-4 right-4 flex gap-3 pointer-events-auto">
                    <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${viewingPn.geo.split(',')[0]},${viewingPn.geo.split(',')[1]}`} 
                       target="_blank" 
                       class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2">
                       Ouvrir dans Google Maps <Navigation size={14}/>
                    </a>
                </div>
            </div>
        </div>
    </div>
    {/if}
{/if}

<style>
  .text-themed { color: rgb(var(--primary-rgb)); }
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>