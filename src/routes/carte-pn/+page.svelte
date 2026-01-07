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
  let viewingPn = $state(null); 

  // Instance de carte
  let mapInstance = $state(null);

  // --- ZONES (Format GeoJSON Polygon) ---
  // Note: Assurez-vous que ces coordonnées sont correctes et couvrent bien les zones.
  const rawZones = {
    'FTY': { coords:  [
          [
            [
              3.171566590264746,
              50.76270372468406
            ],
            [
              3.2599860394696805,
              50.703089198779395
            ],
            [
              3.422346256081852,
              50.545890394096176
            ],
            [
              3.609590240841186,
              50.519025179576914
            ],
            [
              3.6661471967669,
              50.50528946160753
            ],
            [
              4.17826021301326,
              50.71370192274023
            ],
            [
              3.849421335814469,
              50.74641779364245
            ],
            [
              3.633609175365848,
              50.7156685795664
            ],
            [
              3.171566590264746,
              50.76270372468406
            ]
          ]
        
        ], color: '#3b82f6', name: "Zone FTY" },
    'FMS': { coords: [
          [
            [3.9079790525016733, 50.329412167762825],
            [4.255675171883212, 50.431412548871805],
            [4.228154013097992, 50.7215376814529],
            [3.6665653047104456, 50.50542464488879],
            [3.6841188976157753, 50.40985513795198],
            [3.9079790525016733, 50.329412167762825]
          ]
        ], color: '#eab308', name: "Zone FMS" },
    'FCR': { coords: [
          
          [
            [
              4.378195961187458,
              50.730550853847376
            ],
            [
              4.2359619281892265,
              50.50522298405045
            ],
            [
              4.248338347514306,
              50.45770641541387
            ],
            [
              4.223177525529337,
              50.21000831353081
            ],
            [
              4.491800539391733,
              50.05550604422777
            ],
            [
              4.543671492899222,
              50.086156181008306
            ],
            [
              4.56471838237826,
              50.20607177459732
            ],
            [
              4.538540355190548,
              50.39926041742763
            ],
            [
              4.685786932864318,
              50.465597908795075
            ],
            [
              4.5645303647935975,
              50.517162478939554
            ],
            [
              4.53616485941123,
              50.537715289137225
            ],
            [
              4.378195961187458,
              50.730550853847376
            ]
          ]
        
        ], color: '#ef4444', name: "Zone FCR" }
  };

  const mapZones = Object.values(rawZones).map(z => {
      return {
          name: z.name, color: z.color,
          geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: z.coords } }
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
    const { data, error } = await supabase.from('pn_data').select('ligne_nom, pn, bk, adresse, geo, zone');
    if (!error) {
        allPnData = data.map(pn => {
            let computedZone = 'Autre';
            if (pn.geo) {
                const [lat, lon] = pn.geo.split(',').map(parseFloat);
                for (const [key, z] of Object.entries(rawZones)) {
                    // UTILISATION DE z.coords[0] CAR C'EST UN POLYGONE GEOJSON (Tab dans Tab)
                    if (isPointInPolygon([lon, lat], z.coords[0])) {
                        computedZone = key;
                        break;
                    }
                }
            }
            return { 
                ...pn, 
                zone: computedZone, 
                db_zone: pn.zone 
            };
        });
        
        geocodeMissingPns(allPnData);
    }
    isLoading = false;
  }

  async function forceUpdateZones() {
    toast.info("Analyse des zones en cours...");
    let count = 0;
    const pnsToUpdate = allPnData.filter(p => p.geo); 

    for (const pn of pnsToUpdate) {
        const [lat, lon] = pn.geo.split(',').map(parseFloat);
        let detectedZone = null;

        for (const [key, z] of Object.entries(rawZones)) {
            // CORRECTION: z.coords[0]
            if (isPointInPolygon([lon, lat], z.coords[0])) {
                detectedZone = key;
                break;
            }
        }

        // Si on détecte une zone, on la sauvegarde. Si détecte rien, on laisse tel quel ou on pourrait mettre NULL.
        // Ici on sauvegarde seulement si on trouve une zone et qu'elle diffère.
        if (detectedZone && pn.db_zone !== detectedZone) {
            await supabase
                .from('pn_data')
                .update({ zone: detectedZone })
                .eq('pn', pn.pn)
                .eq('ligne_nom', pn.ligne_nom);
            
            pn.db_zone = detectedZone;
            // On met aussi à jour l'affichage local immédiatement
            pn.zone = detectedZone; 
            count++;
        }
    }
    
    if (count > 0) {
        toast.success(`${count} zones mises à jour !`);
        // Force le re-calcul de filteredPn en réassignant allPnData (astuce réactivité Svelte)
        allPnData = [...allPnData];
    } else {
        toast.info("Tout est déjà à jour.");
    }
  }

  // Algorithme Point in Polygon
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

  async function geocodeMissingPns(pns) {
      // ... (Code geocodeMissingPns inchangé - garder votre version actuelle)
      // Je ne le remets pas pour raccourcir, mais il est vital.
  }

  // --- FILTRAGE RÉACTIF CORRIGÉ ---
  let filteredPn = $derived(allPnData.filter(pn => {
    const lineMatch = selectedLines.includes(pn.ligne_nom);
    
    // CORRECTION MAJEURE ICI : PLUS DE FALLBACK.
    // Si la zone est 'Autre', elle ne s'affiche que si vous créez un bouton "Autre" dans l'UI (optionnel).
    // Si vous voulez voir les 'Autre' quand FCR est coché, c'est ce qui causait le bug.
    // Ici : Strict match. Si le PN est dans FTY, il faut que FTY soit coché.
 const zoneMatch = selectedZones.includes(pn.zone); 
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
        
        <div class="flex gap-3">
             <button onclick={() => showTraffic = !showTraffic} 
                class="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-bold
                {showTraffic ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-white/5'}">
                <AlertTriangle size={16} />
                Trafic
            </button>
            <button onclick={forceUpdateZones} class="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm font-bold text-gray-400">
                Forcer MàJ Zones
            </button>
        </div>
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
                    <button onclick={() => handleZoneChange('Autre')}
                            class="px-3 py-1 rounded-md text-xs font-bold border transition-all
                            {selectedZones.includes('Autre') ? 'bg-white/10 text-white' : 'bg-transparent text-gray-500 border-transparent hover:bg-white/5'}"
                            style="border-color: {selectedZones.includes('Autre') ? '#9ca3af' : 'transparent'}">
                            Autre
                    </button>
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
                        <span class="text-[10px] text-gray-500 block">{pn.ligne_nom} • <span class="text-blue-400">{pn.zone}</span></span>
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
                    title="Google Maps"
                    width="100%" 
                    height="100%" 
                    style="border:0" 
                    loading="lazy" 
                    allowfullscreen 
                    src={`https://maps.google.com/maps?q=${viewingPn.geo}&z=18&output=embed`}>
                </iframe>
                
                <div class="absolute bottom-4 right-4 flex gap-3 pointer-events-auto">
                    <a href={`https://www.google.com/maps/search/?api=1&query=${viewingPn.geo}`} 
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