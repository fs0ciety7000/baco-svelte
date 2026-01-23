<script>
  // ... (Vos imports restent identiques) ...
  import { onMount, onDestroy, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { get } from 'svelte/store'; 
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast';
  import { invalidate } from '$app/navigation';
  import { themesConfig, currentThemeId, applyTheme } from '$lib/stores/theme';

  // Imports Widgets & Icons identiques...
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
  import WidgetOtto from '$lib/components/widgets/WidgetOtto.svelte';

  import { 
    LayoutGrid, Cloud, Loader2, Plus, X, Sun, Car, TrainFront, 
    Accessibility, Link, Calendar, BookOpen, PenLine, Briefcase,
    Settings2, Users, Palette, Check, Bus
  } from 'lucide-svelte';
  
  import 'gridstack/dist/gridstack.min.css';

  let { data } = $props();
  
  // ... Runes et Config Widgets identiques ...
  let session = $derived(data.session);
  let savedConfig = $derived(data.savedConfig);
  let widgetsData = $derived(data.widgetsData);

  const WIDGET_REGISTRY = {
     // ... (Votre registre reste identique) ...
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
    otto: { label: 'Commandes C3', component: WidgetOtto, defaultW: 1, defaultH: 1, icon: Bus, desc: 'Réquisitoires.' },
  };

  const DEFAULT_LAYOUT = [
    { type: 'weather', x: 0, y: 0, w: 1, h: 1 },
    { type: 'planning', x: 1, y: 0, w: 1, h: 2 },
    { type: 'links', x: 0, y: 1, w: 1, h: 1 },
    { type: 'trains', x: 2, y: 0, w: 2, h: 1 },
    { type: 'otto', x: 2, y: 1, w: 1, h: 1 }
  ];

  let items = $state([]);
  let isSaving = $state(false);
  let isDrawerOpen = $state(false);
  let drawerTab = $state('widgets');
  
  let isGridReady = $state(false); 
  let gridStackEl;
  let grid = null;
  let GridStackModule = null; 
  let saveTimeout;
  let resizeObserver;

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

        await tick();

        if (gridStackEl) {
            resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    // On réduit la condition de largeur pour que ça charge sur mobile
                    if (entry.contentRect.width > 0 && !grid) { 
                        initGridStack();
                        resizeObserver.disconnect();
                    }
                }
            });
            resizeObserver.observe(gridStackEl);
        }
    } catch (e) { console.error(e); }

    const intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') invalidate('supabase:auth'); 
    }, 60000);
    return () => clearInterval(intervalId);
  });

  onDestroy(() => {
     if (resizeObserver) resizeObserver.disconnect();
     if (grid) { try { grid.destroy(false); } catch(e) {} grid = null; }
  });

  function initGridStack() {
      if (grid || !GridStackModule || !gridStackEl) return;
      try {
          grid = GridStackModule.init({
              column: 4,
              cellHeight: 280,
              margin: 10,
              float: false,
              // MODIFICATION RESPONSIVE ICI :
              disableOneColumnMode: false, // On autorise le mode 1 colonne
              oneColumnSize: 768, // En dessous de 768px, on passe en 1 colonne
              minWidth: 0, // Pas de minimum forcé
              animate: true,
              disableDrag: true, // Désactivé par défaut (sauf si drawer ouvert)
              disableResize: true,
              draggable: { handle: '.widget-drag-handle', scroll: true }
          }, gridStackEl);
          
          grid.batchUpdate(); 
          grid.compact();
          grid.batchUpdate(false); 
          isGridReady = true;
          
          setTimeout(() => {
              if(grid) {
                  grid.engine.nodes.forEach(n => { if(n.el) grid.update(n.el); });
                  grid.compact();
              }
          }, 200);

          grid.on('change', () => { updateItemsFromGrid(); triggerSave(); });
      } catch (err) { console.error("Erreur init GridStack:", err); }
  }

  // Fonctions grid, save, etc... restent identiques
  function toggleDrawer() {
      isDrawerOpen = !isDrawerOpen;
      if (grid) {
          try {
              if (isDrawerOpen) {
                  grid.enableMove(true); grid.enableResize(true);
                  if (grid.el) grid.el.classList.remove('grid-stack-locked');
              } else {
                  grid.enableMove(false); grid.enableResize(false);
                  if (grid.el) grid.el.classList.add('grid-stack-locked');
              }
          } catch (err) {}
      }
  }

  function addWidget(type) {
    if (!WIDGET_REGISTRY[type]) return;
    const def = WIDGET_REGISTRY[type];
    const newItem = { id: crypto.randomUUID(), type, x: 0, y: 0, w: def.defaultW, h: def.defaultH, autoPosition: true };
    items = [...items, newItem];
    toast.success(`${def.label} ajouté`);
    tick().then(() => { if (grid) { try { grid.compact(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } catch (e) {} } });
  }

  function removeWidget(id) {
      const el = gridStackEl?.querySelector(`[gs-id="${id}"]`);
      if (el && grid) try { grid.removeWidget(el, false); } catch (e) {}
      items = items.filter(i => i.id !== id);
      triggerSave();
  }

  function widgetAction(node, item) {
      if (!isGridReady) return;
      const attachWidget = () => { if (grid && !node.gridstackNode) try { grid.makeWidget(node); } catch (err) {} };
      setTimeout(attachWidget, 50);
      return { destroy() { if (grid) try { grid.removeWidget(node, false); } catch (e) { } } };
  }

  function updateItemsFromGrid() {
      if (!grid) return;
      const gridItems = grid.getGridItems();
      items = items.map(item => {
          const el = gridItems.find(el => el.getAttribute('gs-id') === item.id);
          if (el) return { ...item, x: parseInt(el.getAttribute('gs-x') || 0), y: parseInt(el.getAttribute('gs-y') || 0), w: parseInt(el.getAttribute('gs-w') || 1), h: parseInt(el.getAttribute('gs-h') || 1), autoPosition: false };
          return item;
      });
  }

  function saveToLocal(newItems) { localStorage.setItem('baco_dashboard_config_v3', JSON.stringify(newItems)); }
  function triggerSave() {
    saveToLocal(items);
    if (session?.user) {
        isSaving = true;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            try {
                let currentTheme = get(currentThemeId);
                await supabase.from('user_preferences').upsert({ user_id: session.user.id, dashboard_config: items, theme: currentTheme, updated_at: new Date() }, { onConflict: 'user_id' });
            } catch (err) { } finally { isSaving = false; }
        }, 1500);
    }
  }
  function selectTheme(key, doSave = true) { currentThemeId.set(key); applyTheme(key); if (doSave) { toast.success(`Thème activé`); triggerSave(); } }
</script>

<style>
    :global(.grid-stack) { width: 100% !important; min-width: 100% !important; min-height: 500px; }
    :global(.grid-stack-item) { min-width: 0; position: absolute; }
    :global(.grid-stack-item-content) { height: 100% !important; overflow: visible !important; }
    :global(.grid-stack-placeholder > .placeholder-content) { background-color: rgba(59, 130, 246, 0.2) !important; border: 2px dashed rgba(59, 130, 246, 0.5); border-radius: 1rem; }
    :global(.grid-stack-locked .ui-resizable-handle) { display: none !important; }
</style>

<div 
    class="space-y-6 relative pb-20 transition-all duration-300 ease-in-out"
    class:md:mr-96={isDrawerOpen}
>
    <div class="flex flex-col md:flex-row justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md shadow-lg gap-4 md:gap-0">
        <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-500/10 rounded-lg">
                <LayoutGrid class="text-blue-400 w-6 h-6" />
            </div>
            <h2 class="text-xl font-bold text-white tracking-tight">Mon Tableau de Bord</h2>
        </div>
        <div class="flex items-center gap-4">
            {#if isSaving}
                <span class="text-xs text-blue-300 flex items-center gap-1.5" transition:fade><Loader2 class="w-3 h-3 animate-spin"/> Sauvegarde...</span>
            {:else}
                <span class="text-xs text-green-400/80 flex items-center gap-1.5" transition:fade><Cloud class="w-3 h-3"/> Synchro</span>
            {/if}
            <button 
                onclick={toggleDrawer}
                class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border cursor-pointer
                {isDrawerOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-gray-300'}"
            >
                <Settings2 class="w-4 h-4" />
                <span class="hidden md:inline">{isDrawerOpen ? 'Fermer' : 'Personnaliser'}</span>
            </button>
        </div>
    </div>

    <div class="grid-stack w-full min-h-[500px] transition-opacity duration-500 ease-out {isGridReady ? 'opacity-100' : 'opacity-0'}" bind:this={gridStackEl}>
        {#each items as item (item.id)}
            <div class="grid-stack-item" gs-id={item.id} gs-x={item.x} gs-y={item.y} gs-w={item.w} gs-h={item.h} use:widgetAction={item}>
                <div class="grid-stack-item-content p-2">
                    <div class="relative w-full h-full group">
                        {#if WIDGET_REGISTRY[item.type]}
                            {@const WidgetComponent = WIDGET_REGISTRY[item.type].component}
                            <div class="h-full w-full rounded-2xl transition-all duration-300 relative bg-black/20 border border-white/5 backdrop-blur-md shadow-xl overflow-hidden flex flex-col
                                {isDrawerOpen ? 'ring-2 ring-blue-500/50 scale-[0.98]' : ''}">
                                {#if isDrawerOpen}
                                    <div class="absolute inset-0 z-20 cursor-move bg-white/5 backdrop-blur-[1px] flex items-center justify-center">
                                        <span class="bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20">Déplacer</span>
                                    </div>
                                {/if}
                                <div class="h-full w-full flex-grow {isDrawerOpen ? 'pointer-events-none opacity-50 blur-[1px]' : ''}">
                                    <WidgetComponent {...item} ssrData={widgetsData ? widgetsData[item.type] : null} compact={item.w === 1 && item.h === 1} />
                                </div>
                            </div>
                        {/if}
                        {#if isDrawerOpen}
                            <div class="absolute -top-2 -right-2 z-50">
                                <button onclick={() => removeWidget(item.id)} class="bg-red-500 text-white p-2 rounded-full shadow-lg cursor-pointer border-2 border-[#0f1115]">
                                    <X size={14} />
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
    class="fixed inset-y-0 right-0 w-full max-w-sm bg-[#0f1115]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col"
    class:translate-x-0={isDrawerOpen}
    class:translate-x-full={!isDrawerOpen}>
    
    <div class="p-0 border-b border-white/10 bg-white/5">
        <div class="flex justify-between items-center p-6 pb-4">
            <div>
                <h3 class="text-xl font-bold text-white tracking-tight">Personnaliser</h3>
                <p class="text-sm text-gray-400 mt-1">Configurez votre espace</p>
            </div>
            <button onclick={toggleDrawer} class="text-gray-400 hover:text-white transition-colors cursor-pointer bg-white/5 p-2 rounded-lg hover:bg-white/10">
                <X size={20} />
            </button>
        </div>
        <div class="flex px-6 gap-4 pb-4">
            <button onclick={() => drawerTab = 'widgets'} class="flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer {drawerTab === 'widgets' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-400'}"><LayoutGrid size={14} /> Widgets</button>
            <button onclick={() => drawerTab = 'themes'} class="flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer {drawerTab === 'themes' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-400'}"><Palette size={14} /> Ambiance</button>
        </div>
    </div>

    <div class="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {#if drawerTab === 'widgets'}
            <div class="space-y-3">
                {#each Object.entries(WIDGET_REGISTRY) as [type, def]}
                    {@const Icon = def.icon}
                    <button onclick={() => addWidget(type)} class="w-full text-left group relative bg-white/5 hover:bg-white/10 border border-white/5 hover:border-blue-500/50 p-4 rounded-2xl transition-all duration-200 hover:shadow-lg overflow-hidden cursor-pointer">
                        <div class="flex items-start gap-4 relative z-10">
                            <div class="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/20"><Icon size={20} /></div>
                            <div>
                                <h4 class="font-bold text-gray-200 group-hover:text-white text-base">{def.label}</h4>
                                <p class="text-xs text-gray-400 leading-relaxed mt-1 line-clamp-2">{def.desc}</p>
                                <div class="mt-2 text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-black/20 inline-block px-2 py-0.5 rounded border border-white/5">{def.defaultW}x{def.defaultH}</div>
                            </div>
                            <div class="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                <div class="bg-blue-600 text-white p-1.5 rounded-lg shadow-lg"><Plus size={16} /></div>
                            </div>
                        </div>
                    </button>
                {/each}
            </div>
        {:else}
            <div class="grid grid-cols-1 gap-4">
                {#each Object.entries(themesConfig) as [key, theme]}
                    <button onclick={() => selectTheme(key)} class="relative w-full p-1 rounded-2xl border-2 transition-all duration-300 group overflow-hidden text-left cursor-pointer {$currentThemeId === key ? 'border-blue-500 bg-blue-500/5' : 'border-transparent'}">
                        <div class="bg-black/40 p-4 rounded-xl relative z-10 flex items-center justify-between border border-white/5">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 rounded-full shadow-lg border-2 border-white/10" style="background: {theme.preview || 'gray'};"></div>
                                <div><h4 class="font-bold text-white text-sm">{theme.name}</h4><p class="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5 opacity-70">Thème {theme.type}</p></div>
                            </div>
                            {#if $currentThemeId === key}<div class="bg-blue-600 text-white p-1.5 rounded-full shadow-lg border border-blue-400"><Check size={14} /></div>{/if}
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</div>