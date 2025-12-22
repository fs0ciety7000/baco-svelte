<script>
  import { onMount } from 'svelte';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  
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

  import { 
    LayoutGrid, Cloud, Loader2, Plus, X, 
    Sun, Car, TrainFront, Accessibility, Link, Calendar, BookOpen, PenLine, Briefcase,
    Settings2, Users 
  } from 'lucide-svelte';
  import { toast } from '$lib/stores/toast';

  let { data } = $props();

  let session = $derived(data.session);
  let savedConfig = $derived(data.savedConfig);
  let widgetsData = $derived(data.widgetsData);
  let supabase = $derived(data.supabase);

  const WIDGET_REGISTRY = {
    weather: { label: 'Météo', component: WidgetWeather, defaultSize: 'col-span-1', defaultRows: 'row-span-1', icon: Sun, desc: 'Prévisions.' },
    shift: { label: 'Mon Service', component: WidgetShift, defaultSize: 'col-span-1 md:col-span-2', defaultRows: 'row-span-1', icon: Briefcase, desc: 'Suivi de shift.' },
    notepad: { label: 'Bloc-notes', component: WidgetNotepad, defaultSize: 'col-span-1', defaultRows: 'row-span-1', icon: PenLine, desc: 'Notes.' },
    traffic: { label: 'Info Trafic', component: WidgetTraffic, defaultSize: 'col-span-1', defaultRows: 'row-span-1', icon: Car, desc: 'Incidents.' },
    trains:  { label: 'Trains', component: WidgetTrains, defaultSize: 'col-span-1 md:col-span-2', defaultRows: 'row-span-1', icon: TrainFront, desc: 'Départs.' },
    pmr:     { label: 'PMR', component: WidgetPmr, defaultSize: 'col-span-1 md:col-span-2', defaultRows: 'row-span-1', icon: Accessibility, desc: 'Assistances.' },
    links:   { label: 'Raccourcis', component: WidgetLinks, defaultSize: 'col-span-1', defaultRows: 'row-span-1', icon: Link, desc: 'Liens.' },
    planning:{ label: 'Planning', component: WidgetPlanning, defaultSize: 'col-span-1', defaultRows: 'row-span-2', icon: Calendar, desc: 'Effectifs.' },
    journal: { label: 'Journal', component: WidgetJournal, defaultSize: 'col-span-full', defaultRows: 'row-span-1', icon: BookOpen, desc: 'Main courante.' },
    teamboard: { label: 'Tableau Équipe', component: WidgetTeamBoard, defaultSize: 'col-span-1 md:col-span-2', defaultRows: 'row-span-1', icon: Users, desc: 'Infos équipe.' },
  };

  const DEFAULT_LAYOUT = [
    { id: 'def-1', type: 'weather' },
    { id: 'def-2', type: 'planning' },
    { id: 'def-3', type: 'links' },
    { id: 'def-4', type: 'trains' }
  ];

  let items = $state([]); 
  let isSaving = $state(false);
  let isDrawerOpen = $state(false);
  let saveTimeout;
  const flipDurationMs = 300;

  onMount(() => {
    if (data.savedConfig) {
        items = data.savedConfig;
    } else {
        const localConfig = localStorage.getItem('baco_dashboard_config_v2');
        if (localConfig) {
            items = JSON.parse(localConfig);
        } else {
            items = DEFAULT_LAYOUT.map(i => ({ ...i, id: crypto.randomUUID() }));
        }
    }
  });

  function toggleDrawer() { isDrawerOpen = !isDrawerOpen; }

  function addWidget(type) {
    const newWidget = { id: crypto.randomUUID(), type: type };
    items = [newWidget, ...items];
    triggerSave();
    toast.success(`${WIDGET_REGISTRY[type].label} ajouté`);
  }

  function removeWidget(id) {
    items = items.filter(item => item.id !== id);
    triggerSave();
  }

  function saveToLocal(newItems) {
    localStorage.setItem('baco_dashboard_config_v2', JSON.stringify(newItems));
  }

  function triggerSave() {
    saveToLocal(items);
    if (data.session?.user) {
        isSaving = true;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            try {
                await data.supabase.from('user_preferences').upsert({ 
                    user_id: data.session.user.id, 
                    dashboard_config: items,
                    updated_at: new Date()
                }, { onConflict: 'user_id' });
            } catch (err) {
                console.error("Erreur sauvegarde", err);
            } finally {
                isSaving = false;
            }
        }, 2000);
    }
  }

  function handleDndConsider(e) { items = e.detail.items; }
  function handleDndFinalize(e) { items = e.detail.items; triggerSave(); }
</script>

<div class="space-y-6 relative">
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

  <section 
    use:dndzone={{items, flipDurationMs, dropTargetStyle: { outline: '2px dashed rgba(59,130,246,0.5)', borderRadius: '1rem' }}} 
    onconsider={handleDndConsider} 
    onfinalize={handleDndFinalize}
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20 min-h-[50vh] auto-rows-[280px] grid-flow-dense"
  >
    {#each items as item (item.id)}
      <div 
        animate:flip={{duration: flipDurationMs}}
        class="{WIDGET_REGISTRY[item.type]?.defaultSize || 'col-span-1'} {WIDGET_REGISTRY[item.type]?.defaultRows || 'row-span-1'} relative group hover:z-50 focus-within:z-50 transition-all duration-200"
      >
        {#if WIDGET_REGISTRY[item.type]}
            {@const WidgetComponent = WIDGET_REGISTRY[item.type].component}
            
            <div class="h-full w-full {isDrawerOpen ? 'pointer-events-none opacity-80' : ''}">
                <WidgetComponent 
                    {...item} 
                    ssrData={data.widgetsData ? data.widgetsData[item.type] : null}
                />
            </div>
        {/if}

        {#if isDrawerOpen}
            <div 
                transition:fade={{duration: 150}}
                class="absolute inset-0 bg-blue-900/10 border-2 border-blue-500/50 rounded-xl z-20 flex items-center justify-center backdrop-blur-[2px]"
            >
                <button 
                    onclick={() => removeWidget(item.id)}
                    class="transform hover:scale-110 transition-transform bg-red-500 text-white p-3 rounded-full shadow-xl flex items-center gap-2 cursor-pointer"
                >
                    <X size={20} />
                    <span class="font-bold text-sm">Supprimer</span>
                </button>
            </div>
        {/if}
      </div>
    {/each}
  </section>
</div>

<div 
    class="fixed inset-y-0 right-0 w-96 bg-[#0f1115]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col"
    class:translate-x-0={isDrawerOpen}
    class:translate-x-full={!isDrawerOpen}
>
    <div class="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
        <div>
            <h3 class="text-xl font-bold text-white">Ajouter un widget</h3>
            <p class="text-sm text-gray-400">Cliquez pour ajouter</p>
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
                    </div>

                    <div class="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity -mr-2 group-hover:mr-0 text-blue-400">
                        <Plus size={24} />
                    </div>
                </div>
            </button>
        {/each}
    </div>
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 10px; }
</style>