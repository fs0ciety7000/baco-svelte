<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { get } from 'svelte/store'; 
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast';
  import { invalidate } from '$app/navigation';
  import { themesConfig, currentThemeId, applyTheme } from '$lib/stores/theme';

  // --- IMPORTS WIDGETS (Version Desktop) ---
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

  // --- ICONS ---
  import { 
    LayoutGrid, Cloud, Loader2, Plus, X, Sun, Car, TrainFront, 
    Accessibility, Link, Calendar, BookOpen, PenLine, Briefcase,
    Settings2, Users, Palette, Check, Bus, AlertTriangle, ArrowRight
  } from 'lucide-svelte';
  
  import 'gridstack/dist/gridstack.min.css';

  let { data } = $props();
  
  let session = $derived(data.session);
  let savedConfig = $derived(data.savedConfig);
  let widgetsData = $derived(data.widgetsData);

  // --- CONFIG IDENTIQUE DESKTOP ---
  const WIDGET_REGISTRY = {
    weather: { label: 'Météo', component: WidgetWeather, defaultW: 1, defaultH: 1, icon: Sun, desc: 'Prévisions.' },
    shift: { label: 'Mon Service', component: WidgetShift, defaultW: 2, defaultH: 1, icon: Briefcase, desc: 'Mon poste.' },
    notepad: { label: 'Bloc-notes', component: WidgetNotepad, defaultW: 1, defaultH: 1, icon: PenLine, desc: 'Notes.' },
    traffic: { label: 'Trafic', component: WidgetTraffic, defaultW: 1, defaultH: 1, icon: Car, desc: 'Infrabel.' },
    trains: { label: 'Trains', component: WidgetTrains, defaultW: 2, defaultH: 1, icon: TrainFront, desc: 'Départs.' },
    pmr: { label: 'PMR', component: WidgetPmr, defaultW: 2, defaultH: 1, icon: Accessibility, desc: 'Assistances.' },
    links: { label: 'Liens', component: WidgetLinks, defaultW: 1, defaultH: 1, icon: Link, desc: 'Raccourcis.' },
    planning: { label: 'Planning', component: WidgetPlanning, defaultW: 1, defaultH: 2, icon: Calendar, desc: 'Effectifs.' },
    journal: { label: 'Journal', component: WidgetJournal, defaultW: 2, defaultH: 1, icon: BookOpen, desc: 'Main courante.' },
    teamboard: { label: 'Équipe', component: WidgetTeamBoard, defaultW: 2, defaultH: 1, icon: Users, desc: 'Infos.' },
    otto: { label: 'Otto', component: WidgetOtto, defaultW: 1, defaultH: 1, icon: Bus, desc: 'Bus C3.' },
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

  // --- INITIALISATION (Logicque Desktop inchangée) ---
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

        // On ne lance GridStack QUE si l'élément est visible (donc sur Desktop)
        if (gridStackEl) {
            resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.contentRect.width > 600 && !grid) { // Limite Desktop
                        initGridStack();
                    }
                }
            });
            resizeObserver.observe(gridStackEl);
        }
    } catch (e) { console.error(e); }

    // Polling pour mise à jour auto des données (Mobile & Desktop)
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
              column: 4, cellHeight: 280, margin: 16, float: false,
              disableOneColumnMode: true, minWidth: 768, animate: true,
              disableDrag: true, disableResize: true,
              draggable: { handle: '.widget-drag-handle', scroll: true }
          }, gridStackEl);
          
          grid.batchUpdate(); grid.compact(); grid.batchUpdate(false); 
          isGridReady = true;
          
          setTimeout(() => { if(grid) { grid.engine.nodes.forEach(n => { if(n.el) grid.update(n.el); }); grid.compact(); } }, 200);
          grid.on('change', () => { updateItemsFromGrid(); triggerSave(); });
      } catch (err) { }
  }

  function toggleDrawer() {
      isDrawerOpen = !isDrawerOpen;
      if (grid) {
          if (isDrawerOpen) { grid.enableMove(true); grid.enableResize(true); if (grid.el) grid.el.classList.remove('grid-stack-locked'); } 
          else { grid.enableMove(false); grid.enableResize(false); if (grid.el) grid.el.classList.add('grid-stack-locked'); }
      }
  }

  function addWidget(type) {
    if (!WIDGET_REGISTRY[type]) return;
    const def = WIDGET_REGISTRY[type];
    items = [...items, { id: crypto.randomUUID(), type, x: 0, y: 0, w: def.defaultW, h: def.defaultH, autoPosition: true }];
    toast.success(`${def.label} ajouté`);
    tick().then(() => { if (grid) grid.compact(); });
  }

  function removeWidget(id) {
      const el = gridStackEl?.querySelector(`[gs-id="${id}"]`);
      if (el && grid) try { grid.removeWidget(el, false); } catch (e) {}
      items = items.filter(i => i.id !== id);
      triggerSave();
  }

  function widgetAction(node, item) {
      if (!isGridReady) return;
      setTimeout(() => { if (grid && !node.gridstackNode) try { grid.makeWidget(node); } catch (e) {} }, 50);
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
             try { await supabase.from('user_preferences').upsert({ user_id: session.user.id, dashboard_config: items, theme: get(currentThemeId), updated_at: new Date() }, { onConflict: 'user_id' }); } catch(e){} finally { isSaving = false; }
        }, 1500);
    }
  }
  function selectTheme(key, doSave = true) { currentThemeId.set(key); applyTheme(key); if (doSave) { toast.success(`Thème activé`); triggerSave(); } }

  // --- LIENS RAPIDES MOBILE ---
  const mobileShortcuts = [
      { label: 'Journal', href: '/journal', icon: BookOpen, color: 'text-pink-400', bg: 'bg-pink-500/10' },
      { label: 'C3 Otto', href: '/otto', icon: Bus, color: 'text-blue-400', bg: 'bg-blue-500/10' },
      { label: 'Taxis', href: '/generateTaxi', icon: Car, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
      { label: 'PMR', href: '/pmr', icon: Accessibility, color: 'text-purple-400', bg: 'bg-purple-500/10' },
      { label: 'Planning', href: '/planning', icon: Calendar, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
      { label: 'Documents', href: '/documents', icon: Link, color: 'text-gray-400', bg: 'bg-white/5' },
  ];
</script>

<style>
    /* Desktop Only Grid */
    :global(.grid-stack) { width: 100% !important; min-width: 100% !important; min-height: 500px; }
    :global(.grid-stack-item) { min-width: 0; position: absolute; }
    :global(.grid-stack-item-content) { height: 100% !important; overflow: visible !important; }
    :global(.grid-stack-placeholder > .placeholder-content) { background-color: rgba(59, 130, 246, 0.2) !important; border: 2px dashed rgba(59, 130, 246, 0.5); border-radius: 1rem; }
</style>

<div class="lg:hidden flex flex-col gap-6 px-1 pb-20">
    
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-white tracking-tight">Bonjour,</h1>
            <p class="text-blue-400 font-medium text-sm">{session?.user?.user_metadata?.full_name?.split(' ')[0] || 'Collègue'}</p>
        </div>
        {#if widgetsData?.weather}
            <div class="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <Sun class="w-4 h-4 text-yellow-400" />
                <span class="text-sm font-bold text-white">{Math.round(widgetsData.weather.current?.temp_c || 0)}°</span>
            </div>
        {/if}
    </div>

    <div class="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x custom-scrollbar">
        <div class="snap-center shrink-0 w-64 p-4 rounded-2xl bg-gradient-to-br from-blue-600/20 to-blue-900/20 border border-blue-500/30 backdrop-blur-md">
            <div class="flex items-center gap-2 mb-2 text-blue-300">
                <Briefcase class="w-4 h-4" /> <span class="text-xs font-bold uppercase tracking-wider">Mon Service</span>
            </div>
            {#if widgetsData?.shift}
                <div class="text-white font-bold text-lg">{widgetsData.shift.shiftName || 'Repos'}</div>
                <div class="text-sm text-blue-200 mt-1">{widgetsData.shift.startTime} - {widgetsData.shift.endTime}</div>
            {:else}
                <div class="text-gray-400 italic text-sm">Aucune donnée service</div>
            {/if}
        </div>

        <div class="snap-center shrink-0 w-64 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
             <div class="flex items-center gap-2 mb-2 text-orange-400">
                <AlertTriangle class="w-4 h-4" /> <span class="text-xs font-bold uppercase tracking-wider">Alerte Trafic</span>
            </div>
            {#if widgetsData?.traffic && widgetsData.traffic.length > 0}
                <div class="text-white font-medium text-sm line-clamp-2">{widgetsData.traffic[0].message}</div>
            {:else}
                <div class="text-green-400 text-sm font-medium flex items-center gap-2">
                    <Check class="w-4 h-4"/> Trafic fluide
                </div>
            {/if}
        </div>
    </div>

    <div>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ml-1">Accès Rapide</h3>
        <div class="grid grid-cols-2 gap-3">
            {#each mobileShortcuts as link}
                <a href={link.href} class="flex flex-col items-center justify-center p-4 rounded-2xl border border-white/5 {link.bg} active:scale-95 transition-transform duration-100">
                    <svelte:component this={link.icon} class="w-8 h-8 mb-2 {link.color}" />
                    <span class="text-sm font-bold text-gray-200">{link.label}</span>
                </a>
            {/each}
        </div>
    </div>

    <div>
        <div class="flex items-center justify-between mb-3 px-1">
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Derniers faits</h3>
            <a href="/journal" class="text-xs text-blue-400 font-bold">Voir tout</a>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-1">
             <WidgetJournal compact={true} ssrData={widgetsData?.journal} />
        </div>
    </div>

</div>


<div class="hidden lg:block space-y-6 relative pb-20 transition-all duration-300" class:mr-96={isDrawerOpen}>
    
    <div class="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md shadow-lg">
        <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-500/10 rounded-lg"><LayoutGrid class="text-blue-400 w-6 h-6" /></div>
            <h2 class="text-xl font-bold text-white tracking-tight">Mon Tableau de Bord</h2>
        </div>
        <div class="flex items-center gap-4">
            {#if isSaving}
                <span class="text-xs text-blue-300 flex items-center gap-1.5" transition:fade><Loader2 class="w-3 h-3 animate-spin"/> Sauvegarde...</span>
            {:else}
                <span class="text-xs text-green-400/80 flex items-center gap-1.5" transition:fade><Cloud class="w-3 h-3"/> Synchro</span>
            {/if}
            <button onclick={toggleDrawer} class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border cursor-pointer {isDrawerOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}">
                <Settings2 class="w-4 h-4" /> <span>{isDrawerOpen ? 'Fermer' : 'Personnaliser'}</span>
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
                            <div class="h-full w-full rounded-2xl transition-all duration-300 relative bg-black/20 border border-white/5 backdrop-blur-md shadow-xl overflow-hidden flex flex-col {isDrawerOpen ? 'ring-2 ring-blue-500/50 scale-[0.98]' : ''}">
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
                                <button onclick={() => removeWidget(item.id)} class="bg-red-500 text-white p-2 rounded-full shadow-lg cursor-pointer border-2 border-[#0f1115]"><X size={14} /></button>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
    </div>
</div>

<div class="hidden lg:flex fixed inset-y-0 right-0 w-96 bg-[#0f1115]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex-col" class:translate-x-0={isDrawerOpen} class:translate-x-full={!isDrawerOpen}>
    <div class="p-0 border-b border-white/10 bg-white/5">
        <div class="flex justify-between items-center p-6 pb-4">
            <div><h3 class="text-xl font-bold text-white tracking-tight">Personnaliser</h3><p class="text-sm text-gray-400 mt-1">Configurez votre espace</p></div>
            <button onclick={toggleDrawer} class="text-gray-400 hover:text-white transition-colors cursor-pointer bg-white/5 p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
        </div>
        <div class="flex px-6 gap-4 pb-4">
            <button onclick={() => drawerTab = 'widgets'} class="flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer {drawerTab === 'widgets' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400'}"><LayoutGrid size={14} /> Widgets</button>
            <button onclick={() => drawerTab = 'themes'} class="flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer {drawerTab === 'themes' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400'}"><Palette size={14} /> Thèmes</button>
        </div>
    </div>
    <div class="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {#if drawerTab === 'widgets'}
            <div class="space-y-3">
                {#each Object.entries(WIDGET_REGISTRY) as [type, def]}
                    <button onclick={() => addWidget(type)} class="w-full text-left group relative bg-white/5 hover:bg-white/10 border border-white/5 p-4 rounded-2xl cursor-pointer">
                        <div class="flex items-start gap-4"><div class="p-3 rounded-xl bg-blue-500/20 text-blue-400"><svelte:component this={def.icon} size={20} /></div><div><h4 class="font-bold text-gray-200">{def.label}</h4><p class="text-xs text-gray-400 mt-1">{def.desc}</p></div></div>
                    </button>
                {/each}
            </div>
        {:else}
            <div class="grid grid-cols-1 gap-4">
                {#each Object.entries(themesConfig) as [key, theme]}
                    <button onclick={() => selectTheme(key)} class="relative w-full p-4 rounded-2xl border bg-black/40 border-white/10 hover:border-white/30 cursor-pointer"><h4 class="font-bold text-white">{theme.name}</h4></button>
                {/each}
            </div>
        {/if}
    </div>
</div>