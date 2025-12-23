<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { supabase } from '$lib/supabase'; // Assurez-vous que le chemin est bon
  import { toast } from '$lib/stores/toast';

  // --- IMPORTS GRIDSTACK ---
  import 'gridstack/dist/gridstack.min.css';
  import { GridStack } from 'gridstack';

  // --- IMPORTS WIDGETS ---
  import WidgetWeather from '$lib/components/widgets/WidgetWeather.svelte';
  import WidgetTraffic from '$lib/components/widgets/WidgetTraffic.svelte';
  import WidgetTrains from '$lib/components/widgets/WidgetTrains.svelte';
  import WidgetPmr from '$lib/components/widgets/WidgetPmr.svelte';
  import WidgetLinks from '$lib/components/widgets/WidgetLinks.svelte';
  import WidgetPlanning from '$lib/components/widgets/WidgetPlanning.svelte';
  import WidgetJournal from '$lib/components/widgets/WidgetJournal.svelte';
  import WidgetNotepad from '$lib/components/widgets/WidgetNotepad.svelte';
  import WidgetShift from '$lib/components/widgets/WidgetShift.svelte';
  import WidgetTeamBoard from '$lib/components/widgets/WidgetTeamBoard.svelte';

  // --- ICONS ---
  import { 
    LayoutGrid, Cloud, Loader2, Plus, X, 
    Sun, Car, TrainFront, Accessibility, Link, Calendar, BookOpen, PenLine, Briefcase,
    Settings2, Users, Save
  } from 'lucide-svelte';

  let { data } = $props();
  
  // --- RUNES ---
  let session = $derived(data.session);
  let savedConfig = $derived(data.savedConfig);
  let widgetsData = $derived(data.widgetsData);

  // --- CONFIGURATION WIDGETS (Avec mapping Gridstack) ---
  // w = largeur (sur 12 colonnes ou 4 selon config), h = hauteur (unité arbitraire)
  // Ici on part sur une grille de 4 colonnes pour matcher votre ancien layout CSS
  const WIDGET_REGISTRY = {
    weather: { label: 'Météo', component: WidgetWeather, defaultW: 1, defaultH: 1, icon: Sun, desc: 'Prévisions et conditions.' },
    shift: { label: 'Mon Service', component: WidgetShift, defaultW: 2, defaultH: 1, icon: Briefcase, desc: 'Suivi de shift.' },
    notepad: { label: 'Bloc-notes', component: WidgetNotepad, defaultW: 1, defaultH: 1, icon: PenLine, desc: 'Notes rapides.' },
    traffic: { label: 'Info Trafic', component: WidgetTraffic, defaultW: 1, defaultH: 1, icon: Car, desc: 'Incidents réseau.' },
    trains: { label: 'Trains', component: WidgetTrains, defaultW: 2, defaultH: 1, icon: TrainFront, desc: 'Départs en gare.' },
    pmr: { label: 'PMR', component: WidgetPmr, defaultW: 2, defaultH: 1, icon: Accessibility, desc: 'Assistances & Rampes.' },
    links: { label: 'Raccourcis', component: WidgetLinks, defaultW: 1, defaultH: 1, icon: Link, desc: 'Liens utiles.' },
    planning: { label: 'Planning', component: WidgetPlanning, defaultW: 1, defaultH: 2, icon: Calendar, desc: 'Effectifs du jour.' },
    journal: { label: 'Journal', component: WidgetJournal, defaultW: 4, defaultH: 1, icon: BookOpen, desc: 'Main courante.' }, // Full width
    teamboard: { label: 'Tableau Équipe', component: WidgetTeamBoard, defaultW: 2, defaultH: 1, icon: Users, desc: 'Comms équipe.' },
  };

  // Layout par défaut (Fallback)
  const DEFAULT_LAYOUT = [
    { type: 'weather', x: 0, y: 0, w: 1, h: 1 },
    { type: 'planning', x: 1, y: 0, w: 1, h: 2 }, // Planning à côté météo
    { type: 'links', x: 0, y: 1, w: 1, h: 1 },    // Liens sous météo
    { type: 'trains', x: 2, y: 0, w: 2, h: 1 }    // Trains à droite
  ];

  // --- ÉTAT ---
  let items = $state([]);
  let isSaving = $state(false);
  let isDrawerOpen = $state(false);
  let grid = null; // Instance Gridstack
  let saveTimeout;

  // --- INITIALISATION ---
  onMount(async () => {
    // 1. Charger la config
    let loadedItems = [];
    if (savedConfig && savedConfig.length > 0) {
        loadedItems = savedConfig;
    } else {
        const local = localStorage.getItem('baco_dashboard_config_v3'); // v3 pour Gridstack
        if (local) loadedItems = JSON.parse(local);
        else loadedItems = DEFAULT_LAYOUT.map(i => ({ ...i, id: crypto.randomUUID() }));
    }

    // 2. Migration des anciennes données (si nécessaire)
    // Si on vient de v2 (classes CSS), on convertit en x,y,w,h
    items = loadedItems.map(item => {
        if (item.w === undefined) {
             const reg = WIDGET_REGISTRY[item.type];
             return {
                 ...item,
                 x: 0, y: 0, // Gridstack auto-place si x/y indéfini, mais on initialise
                 w: reg?.defaultW || 1,
                 h: reg?.defaultH || 1,
                 autoPosition: true // Laisse Gridstack trouver une place
             };
        }
        return item;
    });

    // 3. Initialisation Gridstack (après le rendu Svelte)
    await tick();
    initGridStack();
  });

  onDestroy(() => {
     if (grid) grid.destroy(false); // false = ne pas supprimer le DOM
  });

  function initGridStack() {
      grid = GridStack.init({
          column: 4, // 4 colonnes comme avant (grid-cols-4)
          cellHeight: 280, // Hauteur fixe en px (correspond à auto-rows-[280px])
          margin: 10, // Espace entre widgets
          float: false, // FALSE = GRAVITÉ (remonte les trous)
          disableOneColumnMode: false, // Passe en 1 colonne sur mobile
          animate: true, // Animation fluide
          staticGrid: true, // Par défaut verrouillé (pas de drag)
          disableResize: true,
      }, '.grid-stack');

      // Écouter les changements pour sauvegarder
      grid.on('change', (event, changeItems) => {
          updateItemsFromGrid();
          triggerSave();
      });
  }

  // --- LOGIQUE MÉTIER ---

  function toggleDrawer() {
      isDrawerOpen = !isDrawerOpen;
      if (grid) {
          // Active le Drag & Drop seulement quand le tiroir est ouvert
          grid.setStatic(!isDrawerOpen); 
          grid.enableMove(isDrawerOpen);
          grid.enableResize(isDrawerOpen);
      }
  }

  function addWidget(type) {
    if (!WIDGET_REGISTRY[type]) return;
    
    const def = WIDGET_REGISTRY[type];
    const newItem = {
        id: crypto.randomUUID(),
        type,
        x: 0, y: 0, // Gridstack trouvera la première place libre
        w: def.defaultW,
        h: def.defaultH,
        autoPosition: true 
    };
    
    // Ajout à l'état Svelte -> L'action `use:widgetAction` s'occupera de l'ajouter à Gridstack
    items = [...items, newItem];
    toast.success(`${def.label} ajouté`);
    
    // On attend que le DOM soit à jour, puis on scroll vers le bas
    tick().then(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }

  function removeWidget(id) {
      // Pour supprimer proprement avec Gridstack + Svelte :
      // 1. On trouve l'élément DOM
      const el = document.querySelector(`[gs-id="${id}"]`);
      if (el && grid) {
          grid.removeWidget(el, false); // false = Gridstack oublie le widget, mais Svelte gère la suppression DOM
      }
      items = items.filter(i => i.id !== id);
      triggerSave();
  }

  // Action Svelte pour lier chaque item DOM à Gridstack
  function widgetAction(node, item) {
      if (grid) {
          // On s'assure que Gridstack prend en compte ce nouveau noeud
          grid.makeWidget(node);
      }
      return {
          destroy() {
              if (grid) grid.removeWidget(node, false);
          }
      };
  }

  function updateItemsFromGrid() {
      // Synchronise l'état interne avec la réalité de la grille
      const gridItems = grid.getGridItems();
      items = items.map(item => {
          const el = gridItems.find(el => el.getAttribute('gs-id') === item.id);
          if (el) {
              return {
                  ...item,
                  x: parseInt(el.getAttribute('gs-x') || 0),
                  y: parseInt(el.getAttribute('gs-y') || 0),
                  w: parseInt(el.getAttribute('gs-w') || 1),
                  h: parseInt(el.getAttribute('gs-h') || 1),
                  autoPosition: false // Une fois placé, on ne veut plus d'auto
              };
          }
          return item;
      });
  }

  function saveToLocal(newItems) {
    localStorage.setItem('baco_dashboard_config_v3', JSON.stringify(newItems));
  }

  function triggerSave() {
    saveToLocal(items);
    if (session?.user) {
        isSaving = true;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            try {
                const client = data.supabase || supabase;
                await client.from('user_preferences').upsert({ 
                    user_id: session.user.id, 
                    dashboard_config: items, // JSONB stockera x,y,w,h
                    updated_at: new Date()
                }, { onConflict: 'user_id' });
            } catch (err) {
                console.error("Erreur sauvegarde", err);
            } finally {
                isSaving = false;
            }
        }, 1500); // Debounce un peu plus court
    }
  }
</script>

<style>
    /* Ajustement des poignées de redimensionnement */
    :global(.grid-stack-item-content) {
        /* Important pour que le contenu prenne toute la place */
        height: 100% !important; 
        overflow: hidden !important;
    }
    
    /* Couleur du placeholder lors du drag */
    :global(.grid-stack-placeholder > .placeholder-content) {
        background-color: rgba(59, 130, 246, 0.2) !important;
        border: 2px dashed rgba(59, 130, 246, 0.5);
        border-radius: 1rem;
    }
</style>

<div class="space-y-6 relative pb-20">
  <div class="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md">
    <div class="flex items-center gap-3">
        <LayoutGrid class="text-blue-400" />
        <h2 class="text-xl font-bold text-white">Mon Tableau de Bord</h2>
    </div>

    <div class="flex items-center gap-4">
        {#if isSaving}
            <span class="text-xs text-blue-300 flex items-center gap-1" transition:fade>
                <Loader2 class="w-3 h-3 animate-spin"/> Sauvegarde...
            </span>
        {:else}
            <span class="text-xs text-green-400/50 flex items-center gap-1" transition:fade>
                <Cloud class="w-3 h-3"/> Synchro
            </span>
        {/if}

        <button 
            onclick={toggleDrawer}
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border
            {isDrawerOpen 
                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}"
        >
            <Settings2 class="w-4 h-4" />
            <span>{isDrawerOpen ? 'Fermer' : 'Personnaliser'}</span>
        </button>
    </div>
  </div>

  <div class="grid-stack w-full min-h-[500px]">
      {#each items as item (item.id)}
         <div 
            class="grid-stack-item"
            gs-id={item.id}
            gs-x={item.x}
            gs-y={item.y}
            gs-w={item.w}
            gs-h={item.h}
            use:widgetAction={item} 
         >
            <div class="grid-stack-item-content p-2"> <div class="relative w-full h-full group">
                    
                    {#if WIDGET_REGISTRY[item.type]}
                        {@const WidgetComponent = WIDGET_REGISTRY[item.type].component}
                        
                        <div class="h-full w-full rounded-2xl overflow-hidden transition-all duration-300
                            {isDrawerOpen ? 'ring-2 ring-blue-500/50 scale-[0.98]' : ''}">
                            
                            <div class="h-full w-full {isDrawerOpen ? 'pointer-events-none' : ''}">
                                <WidgetComponent 
                                    {...item} 
                                    ssrData={widgetsData ? widgetsData[item.type] : null}
                                    compact={item.w === 1 && item.h === 1} 
                                />
                            </div>
                        </div>
                    {/if}

                    {#if isDrawerOpen}
                        <div class="absolute -top-2 -right-2 z-50">
                            <button 
                                onclick={() => removeWidget(item.id)}
                                class="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg transform hover:scale-110 transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div class="absolute inset-0 bg-blue-500/5 rounded-2xl pointer-events-none border border-blue-500/20 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        </div>
                    {/if}
                </div>
            </div>
         </div>
      {/each}
  </div>
</div>

<div 
    class="fixed inset-y-0 right-0 w-96 bg-[#0f1115]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col"
    class:translate-x-0={isDrawerOpen}
    class:translate-x-full={!isDrawerOpen}
>
    <div class="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
        <div>
            <h3 class="text-xl font-bold text-white">Ajouter un widget</h3>
            <p class="text-sm text-gray-400">Glissez ou cliquez</p>
        </div>
        <button onclick={toggleDrawer} class="text-gray-400 hover:text-white transition-colors cursor-pointer">
             <X size={24} />
        </button>
    </div>

    <div class="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {#each Object.entries(WIDGET_REGISTRY) as [type, def]}
             {@const Icon = def.icon}
            <button 
                onclick={() => addWidget(type)}
                class="w-full text-left group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 
                p-4 rounded-2xl transition-all duration-200 hover:shadow-lg hover:-translate-y-1 overflow-hidden cursor-pointer"
            >
                <div class="flex items-start gap-4 relative z-10">
                    <div class="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 group-hover:text-blue-300 group-hover:scale-110 transition-transform duration-300">
                        <Icon size={24} />
                    </div>
                    
                    <div>
                         <h4 class="font-bold text-gray-200 group-hover:text-white text-lg">{def.label}</h4>
                        <p class="text-xs text-gray-400 leading-relaxed mt-1">{def.desc}</p>
                        <div class="mt-2 text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-black/20 inline-block px-2 py-0.5 rounded">
                            Taille: {def.defaultW}x{def.defaultH}
                        </div>
                    </div>

                    <div class="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity -mr-2 group-hover:mr-0 text-blue-400">
                         <Plus size={24} />
                    </div>
                </div>
            </button>
        {/each}
    </div>
</div>