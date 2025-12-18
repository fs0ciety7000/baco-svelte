<script>
  import { onMount } from 'svelte';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { supabase } from '$lib/supabase';
  import { fade, fly } from 'svelte/transition';
  
  // --- IMPORTS DES WIDGETS ---
  import WidgetWeather from '$lib/components/widgets/WidgetWeather.svelte';
  import WidgetTraffic from '$lib/components/widgets/WidgetTraffic.svelte';
  import WidgetTrains from '$lib/components/widgets/WidgetTrains.svelte';
  import WidgetPmr from '$lib/components/widgets/WidgetPmr.svelte';
  import WidgetLinks from '$lib/components/widgets/WidgetLinks.svelte';
  import WidgetPlanning from '$lib/components/widgets/WidgetPlanning.svelte';
  import WidgetJournal from '$lib/components/widgets/WidgetJournal.svelte';
  import WidgetNotepad from '$lib/components/widgets/WidgetNotepad.svelte';
import WidgetShift from '$lib/components/widgets/WidgetShift.svelte';

  // Icônes
  import { Plus, LayoutGrid, Save, Cloud, Loader2 } from 'lucide-svelte';
  import { toast } from '$lib/stores/toast';

  // --- REGISTRE DES WIDGETS DISPONIBLES ---
  // C'est le "Menu" dans lequel l'utilisateur peut piocher
  const WIDGET_REGISTRY = {
    weather: { label: 'Météo', component: WidgetWeather, defaultSize: 'col-span-1' },
    traffic: { label: 'Trafic', component: WidgetTraffic, defaultSize: 'col-span-1' },
    trains:  { label: 'Trains', component: WidgetTrains, defaultSize: 'col-span-1' },
    pmr:     { label: 'PMR', component: WidgetPmr, defaultSize: 'col-span-1 md:col-span-2' },
    links:   { label: 'Liens Rapides', component: WidgetLinks, defaultSize: 'col-span-1' },
    planning:{ label: 'Planning', component: WidgetPlanning, defaultSize: 'col-span-1 md:col-span-2' },
    journal: { label: 'Journal', component: WidgetJournal, defaultSize: 'col-span-full' },
    notepad: { 
        label: 'Bloc-notes', 
        component: WidgetNotepad, 
        defaultSize: 'col-span-1' 
    },
    shift: { 
        label: 'Mon Service', 
        component: WidgetShift, 
        defaultSize: 'col-span-1 md:col-span-2' // Plus large pour voir la barre
    }
  };

  // --- ÉTAT ---
  let items = []; // La liste active des widgets affichés
  let user = null;
  let isSaving = false;
  let isEditing = false; // Mode édition pour ajouter/supprimer
  let saveTimeout; // Pour le debounce

  // Configuration par défaut (si l'utilisateur est nouveau)
  const DEFAULT_LAYOUT = [
    { id: 'def-1', type: 'weather' },
    { id: 'def-2', type: 'traffic' },
    { id: 'def-3', type: 'links' },
    { id: 'def-4', type: 'planning' }
  ];

  // --- CHARGEMENT ---
  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;

    // 1. Tenter de charger depuis le LocalStorage (Rapide/Cache)
    const localConfig = localStorage.getItem('baco_dashboard_config');
    if (localConfig) {
      items = JSON.parse(localConfig);
    } else {
      items = DEFAULT_LAYOUT.map(i => ({ ...i, id: crypto.randomUUID() })); // Générer de vrais IDs au premier lancement
    }

    // 2. Charger la vérité depuis Supabase (Cloud)
    if (user) {
      const { data } = await supabase.from('profiles').select('dashboard_config').eq('id', user.id).single();
      
      // Si une config cloud existe et qu'elle est différente du local, on met à jour
      if (data?.dashboard_config && Array.isArray(data.dashboard_config) && data.dashboard_config.length > 0) {
         // On compare la version stringifiée pour éviter des re-renders inutiles
         if (JSON.stringify(data.dashboard_config) !== localConfig) {
             items = data.dashboard_config;
             saveToLocal(items); // Mettre à jour le cache local
         }
      }
    }
  });

  // --- ACTIONS ---

  // Ajoute une NOUVELLE instance d'un widget (Multi-instance)
  function addWidget(type) {
    const newWidget = {
      id: crypto.randomUUID(), // GÉNÉRATION UUID UNIQUE
      type: type
    };
    items = [newWidget, ...items];
    triggerSave();
    toast.success(`Widget ${WIDGET_REGISTRY[type].label} ajouté`);
  }

  function removeWidget(id) {
    items = items.filter(item => item.id !== id);
    triggerSave();
  }

  // --- PERSISTANCE ---

  // Sauvegarde Locale instantanée
  function saveToLocal(newItems) {
    localStorage.setItem('baco_dashboard_config', JSON.stringify(newItems));
  }

  // Sauvegarde Cloud (Debounced)
  // Attend 2 secondes après la dernière modif avant d'envoyer à Supabase
  function triggerSave() {
    saveToLocal(items); // Toujours sauver en local tout de suite
    if (!user) return;

    isSaving = true;
    clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(async () => {
      try {
        const { error } = await supabase
            .from('profiles')
            .update({ dashboard_config: items })
            .eq('id', user.id);
            
        if (error) throw error;
      } catch (e) {
        console.error("Erreur sauvegarde layout:", e);
        toast.error("Erreur de sauvegarde Cloud");
      } finally {
        isSaving = false;
      }
    }, 2000);
  }

  // --- GESTION DRAG & DROP ---
  const flipDurationMs = 300;
  
  function handleDndConsider(e) {
    items = e.detail.items;
  }
  
  function handleDndFinalize(e) {
    items = e.detail.items;
    triggerSave(); // Sauvegarder quand l'utilisateur lâche le widget
  }
</script>

<div class="space-y-6">
  
  <div class="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md">
    <div class="flex items-center gap-3">
        <LayoutGrid class="text-blue-400" />
        <h2 class="text-xl font-bold text-white">Mon Tableau de Bord</h2>
    </div>

    <div class="flex items-center gap-3">
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
            on:click={() => isEditing = !isEditing}
            class="px-4 py-2 rounded-lg text-sm font-bold transition-colors border border-white/10 
            {isEditing ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-white/5 hover:bg-white/10 text-gray-300'}"
        >
            {isEditing ? 'Terminer' : 'Personnaliser'}
        </button>
    </div>
  </div>

  {#if isEditing}
    <div transition:fly={{ y: -20, duration: 300 }} class="p-6 rounded-2xl bg-blue-900/20 border border-blue-500/30 border-dashed">
        <p class="text-sm font-bold text-blue-200 mb-4 uppercase tracking-wider">Ajouter un widget</p>
        <div class="flex flex-wrap gap-3">
            {#each Object.entries(WIDGET_REGISTRY) as [type, def]}
                <button 
                    on:click={() => addWidget(type)}
                    class="flex items-center gap-2 px-4 py-3 bg-[#0f1115] hover:bg-blue-600/20 border border-white/10 hover:border-blue-400/50 rounded-xl transition-all group"
                >
                    <Plus class="w-4 h-4 text-gray-400 group-hover:text-blue-400" />
                    <span class="text-sm font-medium text-gray-300 group-hover:text-white">{def.label}</span>
                </button>
            {/each}
        </div>
    </div>
  {/if}

  <section 
    use:dndzone={{items, flipDurationMs, dropTargetStyle: { outline: '2px dashed rgba(59,130,246,0.5)', borderRadius: '1rem' }}} 
    on:consider={handleDndConsider} 
    on:finalize={handleDndFinalize}
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20"
  >
    {#each items as item (item.id)}
    <div animate:flip={{duration: flipDurationMs}} class="{WIDGET_REGISTRY[item.type]?.defaultSize || 'col-span-1'} relative group">

       {#if WIDGET_REGISTRY[item.type]}
        <svelte:component this={WIDGET_REGISTRY[item.type].component} {...item} />
    {:else}
            <div class="p-4 bg-red-500/10 border border-red-500 rounded-xl text-red-500">Widget inconnu: {item.type}</div>
        {/if}

        {#if isEditing}
            <div class="absolute -top-2 -right-2 z-10">
                <button 
                    on:click={() => removeWidget(item.id)}
                    class="p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 hover:scale-110 transition-all"
                    title="Supprimer ce widget"
                >
                    <div class="w-3 h-3 flex items-center justify-center font-bold">✕</div>
                </button>
            </div>
            <div class="absolute inset-0 bg-white/5 border-2 border-dashed border-white/20 rounded-3xl pointer-events-none"></div>
        {/if}
      </div>
    {/each}
  </section>

</div>