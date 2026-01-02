<script>
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { Search, Map as MapIcon, Loader2, CheckSquare, Square, Navigation, Layers } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';
  
  // IMPORT TOAST & PERMISSIONS
  import { toast } from '$lib/stores/toast.js';
  import { hasPermission, ACTIONS } from '$lib/permissions';

  // --- ÉTAT ---
  let mapElement;
  let map;
  let markersLayer;
  let zoneBoundariesLayer;
  
  let currentUser = null;
  let isAuthorized = false; // Bloque l'affichage par défaut

  let allPnData = [];
  let availableLines = [];
  let selectedLines = []; 
  let showAllLines = true;
  let searchQuery = "";
  let isLoading = true;

  // Configuration des zones
  const zonePolygons = {
    'FTY': {
      coordinates: [[50.7610, 3.2240], [50.7166, 3.2403], [50.4569, 3.7785], [50.7211, 4.1717], [50.71352307887864, 4.178040380091445]],
      color: '#3b82f6', name: "Zone FTY"
    },
    'FMS': {
      coordinates: [[50.4102, 3.6856], [50.4569, 3.7785], [50.6145, 3.7998], [50.6055, 4.1379], [50.7069, 4.2124], [50.5064, 4.2342], [50.4603, 4.2441], [50.404955, 4.174978], [50.4512, 3.9391], [50.4720, 3.9574], [50.3291, 3.9083]],
      color: '#eab308', name: "Zone FMS"
    },
    'FCR': {
      coordinates: [[50.7302, 4.3785], [50.5048, 4.3876], [50.4863, 4.5478], [50.4457, 4.6463], [50.0566, 4.4920], [50.3033, 4.1110], [50.4603, 4.2441], [50.5035, 4.2399]],
      color: '#ef4444', name: "Zone FCR"
    }
  };

  onMount(async () => {
    // 1. Auth Check
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return goto('/');

    // 2. Profil & Permissions
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
    
    currentUser = { ...session.user, ...profile };

    // 3. Vérification Permission LECTURE
    if (!hasPermission(currentUser, ACTIONS.CARTE_PN_READ)) {
        toast.error("Accès refusé.");
        return goto('/accueil');
    }

    // 4. Autorisation OK -> Chargement
    isAuthorized = true;

    await Promise.all([loadLines(), loadAllPnData()]);
    
    if (typeof window !== 'undefined') {
      const leaflet = await import('leaflet');
      window.L = leaflet.default || leaflet;
      // Chargement dynamique du plugin fullscreen
      await loadScript('https://unpkg.com/leaflet.fullscreen@2.4.0/Control.Fullscreen.js');
      initMap();
    }
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function loadLines() {
    const { data } = await supabase.from('pn_data').select('ligne_nom');
    if (data) {
      const lines = [...new Set(data.map(i => i.ligne_nom).filter(Boolean))].sort();
      availableLines = lines;
      selectedLines = [...lines]; 
    }
  }

  async function loadAllPnData() {
    const { data, error } = await supabase
      .from('pn_data')
      .select('ligne_nom, pn, bk, adresse, geo')
      .not('geo', 'is', null);
    if (!error) allPnData = data;
    isLoading = false;
  }

  function initMap() {
    if (!mapElement) return;

    map = L.map(mapElement, {
      center: [50.63, 4.47],
      zoom: 9,
      fullscreenControl: true,
      zoomControl: false 
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const layers = {
      'Satellite': L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 22, subdomains:['mt0','mt1','mt2','mt3'], attribution: 'Google'
      }),
      'Plan': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22, attribution: 'OSM'
      }),
      'Hybride': L.tileLayer('https://{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}', {
        maxZoom: 22, subdomains:['mt0','mt1','mt2','mt3'], attribution: 'Google'
      })
    };

    layers['Satellite'].addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    zoneBoundariesLayer = L.layerGroup().addTo(map);

    L.control.layers(layers, {
      "Zones SPI": zoneBoundariesLayer,
      "Passages à Niveau": markersLayer
    }, { position: 'bottomright' }).addTo(map);

    drawZones();
    updateMapMarkers();
  }

  function drawZones() {
    Object.values(zonePolygons).forEach(zone => {
      L.polygon(zone.coordinates, { 
        color: zone.color, weight: 2, opacity: 0.8, fillOpacity: 0.15 
      })
      .bindPopup(`<h4 class="font-bold text-gray-800">${zone.name}</h4>`)
      .addTo(zoneBoundariesLayer);
    });
  }

  $: filteredPn = allPnData.filter(pn => {
    const lineMatch = selectedLines.includes(pn.ligne_nom);
    const searchMatch = !searchQuery.trim() || 
      (pn.pn && pn.pn.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (pn.bk && pn.bk.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return lineMatch && searchMatch;
  });

  $: if (map && markersLayer && filteredPn) {
    updateMapMarkers();
  }

  function updateMapMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    
    const newMarkers = [];

    filteredPn.forEach(pn => {
      if (!pn.geo) return;
      const [lat, lon] = pn.geo.split(',').map(parseFloat);
      
      if (!isNaN(lat) && !isNaN(lon)) {
        const popupContent = `
          <div class="glass-popup-content">
            <div class="header">
              <span class="badge">Ligne ${pn.ligne_nom || '?'}</span>
              <span class="pn-id">PN ${pn.pn || '?'}</span>
            </div>
            <div class="body">
              <div class="row">
                <span class="label">BK</span>
                <span class="value font-mono">${pn.bk || 'N/A'}</span>
              </div>
              <div class="row">
                <span class="label">Adresse</span>
                <span class="value">${pn.adresse || 'N/A'}</span>
              </div>
            </div>
            <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" class="action-btn">
              Itinéraire
            </a>
          </div>
        `;
        
        const marker = L.marker([lat, lon]).bindPopup(popupContent, {
          className: 'glass-popup-wrapper',
          maxWidth: 300
        });

        newMarkers.push(marker);
        markersLayer.addLayer(marker);
      }
    });

    // Auto-zoom si on filtre
    if (newMarkers.length > 0 && newMarkers.length < allPnData.length) {
      const group = L.featureGroup(newMarkers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }

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

</script>

<svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.fullscreen@2.4.0/Control.Fullscreen.css" />
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
              placeholder="PN 121 ou 124.500..." 
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
                <input type="checkbox" checked={showAllLines} on:change={toggleAllLines} class="hidden">
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
                      on:change={() => handleLineChange(line)}
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
            <div bind:this={mapElement} id="map" class="w-full h-full z-0"></div>
            
            <div class="absolute top-4 left-4 z-[400] bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl text-xs font-medium text-white shadow-lg pointer-events-none">
                {filteredPn.length} PN affichés
            </div>
          </div>

          <div in:fly={{ y: 20, duration: 600, delay: 200 }}>
            <h2 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
              Liste rapide
            </h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {#each filteredPn.slice(0, 50) as pn} 
                <div class="bg-black/20 border border-white/5 p-3 rounded-xl flex justify-between items-center hover:bg-white/5 transition-colors cursor-default group">
                  <div class="min-w-0">
                    <h3 class="font-bold text-gray-300 text-sm flex items-center gap-2">
                        PN {pn.pn} <span class="text-[10px] text-gray-500 font-normal px-1.5 py-0.5 rounded border border-white/5 bg-black/30">{pn.ligne_nom}</span>
                    </h3>
                    <p class="text-[10px] text-gray-500 mt-0.5 truncate group-hover:text-gray-400 transition-colors">
                        {pn.adresse}
                    </p>
                  </div>
                  <span class="bk-badge">
                    {pn.bk}
                  </span>
                </div>
              {/each}
            </div>
          </div>

        </main>

      </div>
    </div>
{/if} <style>
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

  /* --- CUSTOM POPUP STYLES (THEME BASED) --- */
  
  :global(.glass-popup-wrapper .leaflet-popup-content-wrapper) {
    background: rgba(15, 15, 20, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(var(--primary-rgb), 0.2);
    border-radius: 16px;
    padding: 0;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    color: white;
  }

  :global(.glass-popup-wrapper .leaflet-popup-tip) {
    background: rgba(15, 15, 20, 0.85);
    border: 1px solid rgba(var(--primary-rgb), 0.2);
  }

  :global(.glass-popup-content) { padding: 16px; }

  :global(.glass-popup-content .header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  :global(.glass-popup-content .badge) {
    font-size: 10px;
    font-weight: 700;
    background: rgba(var(--primary-rgb), 0.2);
    color: rgb(var(--primary-rgb));
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(var(--primary-rgb), 0.3);
  }

  :global(.glass-popup-content .action-btn) {
    display: block;
    text-align: center;
    background: rgb(var(--primary-rgb));
    color: white;
    text-decoration: none;
    padding: 8px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    transition: filter 0.2s;
    margin-top: 8px;
  }
  :global(.glass-popup-content .action-btn:hover) {
    filter: brightness(1.2);
  }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>