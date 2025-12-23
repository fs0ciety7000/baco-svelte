<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { get } from 'svelte/store'; 
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast';

  // --- STORES & THÈMES ---
  import { themesConfig, currentThemeId, applyTheme } from '$lib/stores/theme';

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
    Settings2, Users, Palette, Check
  } from 'lucide-svelte';

  import 'gridstack/dist/gridstack.min.css';

  let { data } = $props();
  
  let session = $derived(data.session);
  let savedConfig = $derived(data.savedConfig);
  let widgetsData = $derived(data.widgetsData);

  const WIDGET_REGISTRY = {
    weather: { label: 'Météo', component: WidgetWeather, defaultW: 1, defaultH: 1, icon: Sun, desc: 'Prévisions et conditions.' },
    shift: { label: 'Mon Service', component: WidgetShift, defaultW: 2, defaultH: 1, icon: Briefcase, desc: 'Suivi de shift.' },
    notepad: { label: 'Bloc-notes', component: WidgetNotepad, defaultW: 1, defaultH: 1, icon: PenLine, desc: 'Notes rapides.' },
    traffic: { label: 'Info Trafic', component: WidgetTraffic, defaultW: 1, defaultH: 1, icon: Car, desc: 'Incidents réseau.' },
    trains: { label: 'Trains', component: WidgetTrains, defaultW: 2, defaultH: 1, icon: TrainFront, desc: 'Départs en gare.' },
    pmr: { label: 'PMR', component: WidgetPmr, defaultW: 2, defaultH: 1, icon: Accessibility, desc: 'Assistances & Rampes.' },
    links: { label: 'Raccourcis', component: WidgetLinks, defaultW: 1, defaultH: 1, icon: Link, desc: 'Liens utiles.' },
    planning: { label: 'Planning', component: WidgetPlanning, defaultW: 1, defaultH: 2, icon: Calendar, desc: 'Effectifs du jour.' },
    journal: { label: 'Journal', component: WidgetJournal, defaultW: 2, defaultH: 1, icon: BookOpen, desc: 'Main courante.' },
    teamboard: { label: 'Tableau Équipe', component: WidgetTeamBoard, defaultW: 2, defaultH: 1, icon: Users, desc: 'Comms équipe.' },
  };

  const DEFAULT_LAYOUT = [
    { type: 'weather', x: 0, y: 0, w: 1, h: 1 },
    { type: 'planning', x: 1, y: 0, w: 1, h: 2 },
    { type: 'links', x: 0, y: 1, w: 1, h: 1 },
    { type: 'trains', x: 2, y: 0, w: 2, h: 1 }
  ];

  let items = $state([]);
  let isSaving = $state(false);
  let isDrawerOpen = $state(false);
  let drawerTab = $state('widgets');
  let isGridReady = $state(false); 

  let grid = null;
  let GridStackModule = null; 
  let saveTimeout;
  let resizeObserver;

  // --- INITIALISATION ---
  onMount(async () => {
    try {
        const module = await import('gridstack');
        GridStackModule = module.GridStack || module.default || module;
        
        if (data.savedTheme) selectTheme(data.savedTheme, false);

        let loadedItems = [];
        if (savedConfig && savedConfig.length > 0) loadedItems = savedConfig;
        else {
            const local = localStorage.getItem('baco_dashboard_config_v3');
            if (local) loadedItems = JSON.parse(local);
            else loadedItems = DEFAULT_LAYOUT.map(i => ({ ...i, id: crypto.randomUUID() }));
        }

        items = loadedItems.map(item => {
            if (item.w === undefined) {
                 const reg = WIDGET_REGISTRY[item.type];
                 return { ...item, x: 0, y: 0, w: reg?.defaultW || 1, h: reg?.defaultH || 1, autoPosition: true };
            }
            return item;
        });

        // On attend que Svelte ait généré le HTML
        await tick();

        // On observe la taille pour initialiser au bon moment
        const el = document.querySelector('.grid-stack');
        if (el) {
            resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    // Largeur > 300px et pas encore initialisé
                    if (entry.contentRect.width > 300 && !grid) {
                        initGridStack();
                        resizeObserver.disconnect(); // On arrête d'observer une fois lancé
                    }
                }
            });
            resizeObserver.observe(el);
        }
        
    } catch (e) {
        console.error("Erreur critique au chargement:", e);
    }
  });

  onDestroy(() => {
     if (resizeObserver) resizeObserver.disconnect();
     if (grid) {
         try { grid.destroy(false); } catch(e) {} // false = ne détruit pas le DOM, juste l'instance
         grid = null;
     }
  });

  function initGridStack() {
      if (grid || !GridStackModule) return;
      const el = document.querySelector('.grid-stack');
      if (!el) return;

      try {
          // Initialisation standard sur les enfants existants
          grid = GridStackModule.init({
              column: 4,
              cellHeight: 280,
              margin: 10,
              float: false,
              disableOneColumnMode: true, 
              oneColumnSize: 0,          
              minWidth: 768,              
              animate: true,
              disableDrag: true,
              disableResize: true,
              draggable: { handle: '.widget-drag-handle', scroll: true }
          }, el);

          // Force l'affichage propre
          grid.batchUpdate(); 
          grid.compact();
          grid.batchUpdate(false); 

          isGridReady = true;

          grid.on('change', () => {
              updateItemsFromGrid();
              triggerSave();
          });
      } catch (err) {
          console.error("Erreur init GridStack:", err);
      }
  }

  // --- GESTION DES WIDGETS ---

  async function addWidget(type) {
    if (!WIDGET_REGISTRY[type]) return;
    const def = WIDGET_REGISTRY[type];
    
    // 1. Créer la donnée
    const newItem = {
        id: crypto.randomUUID(),
        type,
        x: 0, y: 0, 
        w: def.defaultW, h: def.defaultH,
        autoPosition: true 
    };
    
    // 2. Mettre à jour Svelte
    items = [...items, newItem];
    
    toast.success(`${def.label} ajouté`);
    
    // 3. Attendre le rendu DOM
    await tick();

    // 4. Dire à Gridstack qu'il y a un nouveau widget
    if (grid) {
        const newEl = document.querySelector(`[gs-id="${newItem.id}"]`);
        if (newEl) {
            try {
                grid.makeWidget(newEl); // C'est ici qu'on transforme le DIV en Widget
                grid.compact();
                // Scroll en bas pour voir le nouveau widget
                newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) { console.warn("Erreur makeWidget:", e); }
        }
    }
  }

  function removeWidget(id) {
      // 1. Supprimer de Gridstack (DOM + Instance)
      const el = document.querySelector(`[gs-id="${id}"]`);
      if (el && grid) {
          try {
              grid.removeWidget(el, false); // false = laisser Svelte gérer la suppression du DOM
          } catch (e) { console.warn("Erreur removeWidget:", e); }
      }
      
      // 2. Supprimer de la liste Svelte (Source de vérité)
      items = items.filter(i => i.id !== id);
      triggerSave();
  }

  // --- UTILITAIRES ---

  function toggleDrawer() {
      isDrawerOpen = !isDrawerOpen;
      if (grid) {
          try {
              if (isDrawerOpen) {
                  grid.enableMove(true);
                  grid.enableResize(true);
                  if (grid.el) grid.el.classList.remove('grid-stack-locked');
              } else {
                  grid.enableMove(false);
                  grid.enableResize(false);
                  if (grid.el) grid.el.classList.add('grid-stack-locked');
              }
          } catch (err) {}
      }
  }

  function updateItemsFromGrid() {
      if (!grid) return;
      try {
          const gridItems = grid.getGridItems();
          // On met à jour sans recréer tout le tableau pour éviter les sauts
          const updatedItems = items.map(item => {
              const el = gridItems.find(el => el.getAttribute('gs-id') === item.id);
              if (el) {
                  return {
                      ...item,
                      x: parseInt(el.getAttribute('gs-x') || 0),
                      y: parseInt(el.getAttribute('gs-y') || 0),
                      w: parseInt(el.getAttribute('gs-w') || 1),
                      h: parseInt(el.getAttribute('gs-h') || 1),
                      autoPosition: false
                  };
              }
              return item;
          });
          // Optimisation : update uniquement si changement réel (évite loop infini)
          if(JSON.stringify(updatedItems) !== JSON.stringify(items)) {
             items = updatedItems;
          }
      } catch (e) { console.error("Erreur updateItems:", e); }
  }

  // --- SAUVEGARDE & THÈMES (Inchangé) ---
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
                let currentTheme = 'default';
                try { currentTheme = get(currentThemeId); } catch(e){}

                const { error } = await client.from('user_preferences').upsert({ 
                    user_id: session.user.id, 
                    dashboard_config: items,
                    theme: currentTheme,
                    updated_at: new Date()
                }, { onConflict: 'user_id' });
                if (error) console.error("ERREUR SUPABASE:", error);
            } catch (err) { console.error("Erreur sauvegarde:", err);
            } finally { isSaving = false; }
        }, 1500);
    }
  }

  function selectTheme(key, doSave = true) {
      currentThemeId.set(key);
      applyTheme(key);
      if (doSave) {
          toast.success(`Thème activé`);
          triggerSave();
      }
  }
</script>

<style>
    /* FORCE LA LARGEUR ET LE COMPORTEMENT */
    :global(.grid-stack) {
        width: 100% !important; 
        min-width: 100% !important;
        /* Une hauteur min pour que le ResizeObserver ait qqch à détecter au début */
        min-height: 500px; 
    }

    :global(.grid-stack-item) {
        min-width: 0;
        position: absolute; /* Gridstack a besoin de ça */
    }

    :global(.grid-stack-item-content) {
        height: 100% !important; 
        overflow: visible !important; 
    }
    :global(.grid-stack-placeholder > .placeholder-content) {
        background-color: rgba(59, 130, 246, 0.2) !important;
        border: 2px dashed rgba(59, 130, 246, 0.5);
        border-radius: 1rem;
    }
    :global(.grid-stack-locked .ui-resizable-handle) {
        display: none !important;
    }
    :global(.grid-stack-item:hover) {
        z-index: 1000 !important;
    }
</style>

<div 
    class="space-y-6 relative pb-20 transition-all duration-300 ease-in-out"
    class:mr-96={isDrawerOpen}
>
  
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
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border cursor-pointer
            {isDrawerOpen 
                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}"
        >
            <Settings2 class="w-4 h-4" />
            <span>{isDrawerOpen ? 'Fermer' : 'Personnaliser'}</span>
        </button>
    </div>
  </div>

  <div class="grid-stack w-full min-h-[500px] transition-opacity duration-500 ease-out {isGridReady ? 'opacity-100' : 'opacity-0'}">
      {#each items as item (item.id)}
         <div 
            class="grid-stack-item"
            gs-id={item.id} gs-x={item.x} gs-y={item.y} gs-w={item.w} gs-h={item.h}
            
         >
            <div class="grid-stack-item-content p-2">
                <div class="relative w-full h-full group">
                    
                    {#if WIDGET_REGISTRY[item.type]}
                        {@const WidgetComponent = WIDGET_REGISTRY[item.type].component}
                        
                        <div class="h-full w-full rounded-2xl transition-all duration-300 relative
                            {isDrawerOpen ? 'ring-2 ring-blue-500/50 scale-[0.98]' : ''}">
                            
                            {#if isDrawerOpen}
                                <div class="absolute inset-0 z-20 cursor-move bg-transparent"></div>
                            {/if}

                            <div class="h-full w-full {isDrawerOpen ? 'pointer-events-none opacity-80' : ''}">
                                <WidgetComponent 
                                    {...item} 
                                    ssrData={widgetsData ? widgetsData[item.type] : null}
                                    compact={item.w === 1 && item.h === 1} 
                                />
                            </div>
                        </div>
                    {/if}

                    {#if isDrawerOpen}
                        <div class="absolute top-2 right-2 z-50">
                            <button 
                                onclick={() => removeWidget(item.id)}
                                class="bg-red-500/90 hover:bg-red-600 text-white p-1.5 rounded-lg shadow-lg backdrop-blur-sm transform hover:scale-110 transition-all cursor-pointer border border-white/20"
                                title="Supprimer ce widget"
                            >
                                <X size={16} />
                            </button>
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
    <div class="p-0 border-b border-white/10 bg-white/5">
        <div class="flex justify-between items-center p-6 pb-2">
            <div>
                <h3 class="text-xl font-bold text-white">Personnaliser</h3>
                <p class="text-sm text-gray-400">Configurez votre espace</p>
            </div>
            <button onclick={toggleDrawer} class="text-gray-400 hover:text-white transition-colors cursor-pointer">
                <X size={24} />
            </button>
        </div>

        <div class="flex px-6 gap-6 mt-2">
            <button 
                onclick={() => drawerTab = 'widgets'}
                class="pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer
                {drawerTab === 'widgets' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}"
            >
                <LayoutGrid size={16} /> Widgets
            </button>
            <button 
                onclick={() => drawerTab = 'themes'}
                class="pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer
                {drawerTab === 'themes' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}"
            >
                <Palette size={16} /> Ambiance
            </button>
        </div>
    </div>

    <div class="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
        
        {#if drawerTab === 'widgets'}
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

        {:else}
            <div class="grid grid-cols-1 gap-4">
                {#each Object.entries(themesConfig) as [key, theme]}
                    <button 
                        onclick={() => selectTheme(key)}
                        class="relative w-full p-4 rounded-2xl border transition-all duration-300 group overflow-hidden text-left cursor-pointer
                        {$currentThemeId === key 
                            ? 'border-white/40 ring-2 ring-white/10 bg-white/10' 
                            : 'border-white/10 hover:border-white/30 bg-white/5'}"
                    >
                        <div 
                            class="absolute inset-0 opacity-20 transition-opacity duration-500"
                            style="background: {theme.preview || 'transparent'}"
                        ></div>

                        <div class="relative z-10 flex items-center justify-between">
                            <div class="flex items-center gap-4">
                                <div 
                                    class="w-12 h-12 rounded-full shadow-lg border border-white/20"
                                    style="background: {theme.preview || 'gray'};"
                                ></div>
                                <div>
                                    <h4 class="font-bold text-white text-lg">{theme.name}</h4>
                                    <p class="text-xs text-gray-400">Thème {theme.type}</p>
                                </div>
                            </div>
                            {#if $currentThemeId === key}
                                <div class="bg-green-500/20 text-green-400 p-2 rounded-full border border-green-500/30">
                                    <Check size={20} />
                                </div>
                            {/if}
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</div>

