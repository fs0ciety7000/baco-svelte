<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { Search, Map as MapIcon, Loader2, CheckSquare, Square, Layers, Navigation } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';
  
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

  // Instance de carte (pour le flyTo)
  let mapInstance = $state(null);

  const coordsCache = {}; 

  // --- ZONES ---
  const rawZones = {
    'FTY': { coords: [[3.2240, 50.7610], [3.2403, 50.7166], [3.7785, 50.4569], [4.1717, 50.7211], [4.1780, 50.7135]], color: '#3b82f6', name: "Zone FTY" },
    'FMS': { coords: [[3.6856, 50.4102], [3.7785, 50.4569], [3.7998, 50.6145], [4.1379, 50.6055], [4.2124, 50.7069], [4.2342, 50.5064], [4.2441, 50.4603], [4.1749, 50.4049], [3.9391, 50.4512], [3.9574, 50.4720], [3.9083, 50.3291]], color: '#eab308', name: "Zone FMS" },
    'FCR': { coords: [[4.3785, 50.7302], [4.3876, 50.5048], [4.5478, 50.4863], [4.6463, 50.4457], [4.4920, 50.0566], [4.1110, 50.3033], [4.2441, 50.4603], [4.2399, 50.5035]], color: '#ef4444', name: "Zone FCR" }
  };

  // Correction automatique : Fermeture des polygones
  const mapZones = Object.values(rawZones).map(z => {
      const closedCoords = [...z.coords];
      const first = closedCoords[0];
      const last = closedCoords[closedCoords.length - 1];
      
      // Si le dernier point n'est pas égal au premier, on l'ajoute
      if (first[0] !== last[0] || first[1] !== last[1]) {
          closedCoords.push(first);
      }

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
        allPnData = data;
        geocodeMissingPns(data);
    }
    isLoading = false;
  }

  async function geocodeMissingPns(pns) {
      const pnsMissingGeo = pns.filter(p => !p.geo);
      const CHUNK_SIZE = 2; 
      for (let i = 0; i < pnsMissingGeo.length; i += CHUNK_SIZE) {
          const chunk = pnsMissingGeo.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async (pn) => {
              const coords = await fetchCoordinates(pn);
              if (coords) {
                  pn.geo = `${coords[1]},${coords[0]}`; 
                  // Force reactivity : on réassigne pour que les markers se mettent à jour
                  // Note: En Svelte 5, si pn est un proxy (dans le state), ça marche direct.
              }
          }));
          await new Promise(r => setTimeout(r, 500));
      }
  }

async function fetchCoordinates(pn) {
      // 1. Nettoyage de l'adresse
      // On retire "PN 123" ou "PN123" du début de l'adresse si présent
      let cleanAddress = (pn.adresse || "").replace(/^PN\s*\d+\s*[-]?\s*/i, "").trim();
      
      // On retire les codes postaux erronés ou doublons si nécessaire (ex: parfois "7700 Mouscron 7700")
      // Mais surtout, on s'assure d'avoir la ville.
      
      let queries = [];

      // Stratégie 1 : Adresse nettoyée précise
      if (cleanAddress) {
          queries.push(`${cleanAddress}, Belgique`);
      }

      // Stratégie 2 : Recherche structurée (Rue, Ville) si on peut extraire la ville
      // On suppose que la ville est à la fin (ex: "Rue X, 7700 Mouscron")
      if (cleanAddress && /\d{4}/.test(cleanAddress)) {
          // On garde tel quel, c'est souvent le meilleur format pour Nominatim
      } else if (cleanAddress) {
          // Si pas de code postal, on essaie d'ajouter Belgique
          queries.push(`${cleanAddress} Belgique`);
      }

      // Stratégie 3 : Fallback Ville uniquement (si on a un code postal dans l'adresse)
      const zipMatch = cleanAddress.match(/(\d{4})\s+([a-zA-Z\s-]+)/);
      if (zipMatch) {
          queries.push(`${zipMatch[1]} ${zipMatch[2]}, Belgique`);
      }

      for (const q of queries) {
          // Check cache
          if (coordsCache[q]) return coordsCache[q];
          
          try {
              // Ajout de &addressdetails=1 pour vérifier la qualité si besoin
              const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
              
              const res = await fetch(url, { headers: { 'User-Agent': 'BacoApp/1.0' } });
              
              if (res.ok) {
                  const data = await res.json();
                  if (data && data.length > 0) {
                      const coords = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
                      coordsCache[q] = coords;
                      console.log(`✅ Trouvé: ${q}`);
                      return coords;
                  }
              }
          } catch (e) { console.warn("Erreur geocoding", q, e); }
          
          // Pause un peu plus longue (300ms) pour éviter le Rate Limiting (429 Too Many Requests)
          await new Promise(r => setTimeout(r, 300));
      }
      
      console.warn(`❌ Non trouvé: ${pn.adresse} (Nettoyé: ${cleanAddress})`);
      return null;
  }

  // --- FILTRAGE RÉACTIF ---
  let filteredPn = $derived(allPnData.filter(pn => {
    const lineMatch = selectedLines.includes(pn.ligne_nom);
    const searchMatch = !searchQuery.trim() || 
      (pn.pn && String(pn.pn).toLowerCase().includes(searchQuery.toLowerCase())) ||
      (pn.bk && String(pn.bk).toLowerCase().includes(searchQuery.toLowerCase())) ||
      (pn.adresse && pn.adresse.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return lineMatch && searchMatch;
  }));

  // --- CONSTRUCTION DES MARKERS ---
  let mapMarkers = $derived(filteredPn
    .filter(pn => pn.geo) 
    .map(pn => {
        const [lat, lon] = pn.geo.split(',').map(parseFloat);
        if (isNaN(lat) || isNaN(lon)) return null;

        const popupHTML = `
            <div class="p-3 min-w-[200px]">
                <div class="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
                    <span class="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded border border-orange-500/30">Ligne ${pn.ligne_nom}</span>
                    <span class="font-bold text-white"> ${pn.pn}</span>
                </div>
                <div class="space-y-1 text-xs text-gray-300">
                    <div class="flex justify-between"><span class="text-gray-500">BK:</span> <span class="font-mono text-white">${pn.bk || '?'}</span></div>
                    <div class="flex justify-between items-start gap-2"><span class="text-gray-500">Adr:</span> <span class="text-right leading-tight">${pn.adresse || '-'}</span></div>
                </div>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" class="block mt-3 bg-blue-600 hover:bg-blue-500 text-white text-center text-xs font-bold py-1.5 rounded transition-colors flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> 
                    Itinéraire
                </a>
            </div>
        `;

        return {
            lngLat: [lon, lat], // MapLibre [Lon, Lat]
            type: 'pn',
            popupContent: popupHTML
        };
    })
    .filter(Boolean));

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

  function handlePnClick(pn) {
      if (!pn.geo) {
          toast.error("Ce PN n'est pas géolocalisé.");
          return;
      }
      if (!mapInstance) return;

      const [lat, lon] = pn.geo.split(',').map(parseFloat);
      
      mapInstance.flyTo({
          center: [lon, lat],
          zoom: 16,
          speed: 1.5,
          curve: 1,
          essential: true
      });
  }
</script>

<svelte:head>
  <title>Carte PN | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-[rgb(var(--color-primary))]" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Vérification des accès...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" 
              in:fly={{ y: -20, duration: 600 }}
              style="--primary-rgb: var(--color-primary);">
        <div class="flex items-center gap-3">
          <div class="p-3 rounded-xl border transition-all duration-500"
               style="background-color: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-color: rgba(var(--primary-rgb), 0.2); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);">
            <MapIcon size={32} />
          </div>
          <div>
            <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Carte Interactive</h1>
            <p class="text-gray-500 text-sm mt-1">Localisation des Passages à Niveau et Zones.</p>
          </div>
        </div>
      </header>

      <div class="flex flex-col lg:flex-row gap-8" style="--primary-rgb: var(--color-primary);">
        
        <aside class="w-full lg:w-1/4 space-y-6" in:fly={{ x: -20, duration: 600, delay: 100 }}>
          
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-themed transition-colors"><Search size={18} /></div>
            <input 
              type="text" 
              placeholder="PN 121, Rue de la Gare..." 
              bind:value={searchQuery}
              class="block w-full pl-10 pr-3 py-3 bg-black/20 border border-white/10 rounded-2xl text-sm text-gray-200 focus:ring-2 focus:border-transparent transition-all outline-none placeholder-gray-600"
              style="--tw-ring-color: rgba(var(--primary-rgb), 0.3); border-color: rgba(var(--primary-rgb), 0.1);"
            />
          </div>

          <div class="bg-black/20 border border-white/5 rounded-2xl p-5 max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col">
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Layers size={14} /> Filtre Lignes
            </h3>
            
            {#if isLoading}
              <div class="flex items-center gap-2 text-sm text-gray-500 py-4"><Loader2 size={16} class="animate-spin themed-spinner"/> Chargement...</div>
            {:else}
              <label class="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group mb-2 border border-transparent hover:border-white/5">
                <input type="checkbox" checked={showAllLines} onchange={toggleAllLines} class="hidden">
                {#if showAllLines}<CheckSquare class="w-5 h-5 text-themed" />{:else}<Square class="w-5 h-5 text-gray-600 group-hover:text-gray-400" />{/if}
                <span class="font-bold text-sm text-gray-300 group-hover:text-white">Toutes les lignes</span>
              </label>
              
              <div class="h-px bg-white/5 my-1"></div>

              <div class="space-y-1 mt-2">
                {#each availableLines as line}
                  <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={selectedLines.includes(line)} 
                      onchange={() => handleLineChange(line)}
                      class="hidden"
                    >
                    {#if selectedLines.includes(line)}<CheckSquare class="w-4 h-4 text-themed" />{:else}<Square class="w-4 h-4 text-gray-600 group-hover:text-gray-400" />{/if}
                    <span class="text-sm text-gray-400 group-hover:text-gray-200">{line}</span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        </aside>

        <main class="w-full lg:w-3/4 space-y-6">
          
          <div class="relative w-full h-[600px] rounded-3xl shadow-2xl border border-white/10 overflow-hidden bg-[#0f1115]" in:fade={{ duration: 800 }}>
            <Map 
                bind:map={mapInstance} 
                markers={mapMarkers} 
                zones={mapZones} 
                className="w-full h-full" 
            />
            
            <div class="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl text-xs font-medium text-white shadow-lg pointer-events-none">
                {filteredPn.length} PN affichés
            </div>
          </div>

          <div in:fly={{ y: 20, duration: 600, delay: 200 }}>
            <h2 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
              Liste rapide
            </h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {#each filteredPn.slice(0, 50) as pn} 
                <div 
                    onclick={() => handlePnClick(pn)}
                    class="bg-black/20 border border-white/5 p-3 rounded-xl flex justify-between items-center hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <div class="min-w-0">
                    <h3 class="font-bold text-gray-300 text-sm flex items-center gap-2">
                        PN {pn.pn} <span class="text-[10px] text-gray-500 font-normal px-1.5 py-0.5 rounded border border-white/5 bg-black/30">{pn.ligne_nom}</span>
                        {#if !pn.geo}<span class="text-red-500 text-[10px] animate-pulse" title="Géolocalisation en cours">📍</span>{/if}
                    </h3>
                    <p class="text-[10px] text-gray-500 mt-0.5 truncate group-hover:text-gray-400 transition-colors">
                        {pn.adresse || 'Adresse inconnue'}
                    </p>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                      <span class="bk-badge">
                        {pn.bk}
                      </span>
                      <span class="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <Navigation size={10} /> Voir
                      </span>
                  </div>
                </div>
              {/each}
            </div>
          </div>

        </main>

      </div>
    </div>
{/if} 

<style>
  .text-themed { color: rgb(var(--primary-rgb)); }
  .themed-spinner { color: rgba(var(--primary-rgb), 0.5); }

  .bk-badge {
    font-family: monospace;
    font-size: 0.75rem;
    font-weight: bold;
    color: rgb(var(--primary-rgb));
    background-color: rgba(var(--primary-rgb), 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(var(--primary-rgb), 0.2);
    white-space: nowrap;
    margin-left: 0.5rem;
  }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>