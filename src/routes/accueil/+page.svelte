<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { Settings, Save, Maximize, Minimize, GripHorizontal, EyeOff, Eye, Plus, LayoutDashboard } from 'lucide-svelte';
  import { slide, fade } from 'svelte/transition';
  
  // --- IMPORTS DES WIDGETS ---
  import WidgetWeather from '$lib/components/widgets/WidgetWeather.svelte';
  import WidgetTrains from '$lib/components/widgets/WidgetTrains.svelte';
  import WidgetTraffic from '$lib/components/widgets/WidgetTraffic.svelte';
  import WidgetPmr from '$lib/components/widgets/WidgetPmr.svelte';
  import WidgetJournal from '$lib/components/widgets/WidgetJournal.svelte';
  import WidgetPlanning from '$lib/components/widgets/WidgetPlanning.svelte';
  import WidgetLinks from '$lib/components/widgets/WidgetLinks.svelte';

  let userProfile = null;
  let isEditMode = false;
  const flipDurationMs = 300;

  const WIDGET_TYPES = {
    weather: WidgetWeather,
    trains: WidgetTrains,
    traffic: WidgetTraffic,
    pmr: WidgetPmr,
    journal: WidgetJournal,
    planning: WidgetPlanning,
    links: WidgetLinks
  };

  // Liste de TOUS les widgets possibles avec leur état par défaut
  const ALL_WIDGETS_CONFIG = [
    { id: 1, type: 'weather', title: 'Météo', cols: 1, visible: true },
    { id: 2, type: 'trains', title: 'Départs', cols: 2, visible: true },
    { id: 3, type: 'traffic', title: 'Info Trafic', cols: 1, visible: true },
    { id: 4, type: 'pmr', title: 'Rampes PMR', cols: 1, visible: true },
    { id: 5, type: 'journal', title: 'Journal', cols: 1, visible: true },
    { id: 6, type: 'planning', title: 'Planning', cols: 1, visible: true },
    { id: 7, type: 'links', title: 'Raccourcis', cols: 2, visible: true }
  ];

  // État local des widgets (ordre + visibilité + taille)
  let items = ALL_WIDGETS_CONFIG;

  // Filtrer pour n'afficher que les visibles dans la grille principale
  $: displayedItems = items.filter(i => i.visible);
  
  // Filtrer pour afficher les masqués dans le menu d'ajout
  $: hiddenItems = items.filter(i => !i.visible);

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single();
        userProfile = data;
    }

    const saved = localStorage.getItem('baco_dashboard_layout_v4'); // v4 pour la nouvelle structure avec 'visible'
    if (saved) {
        try { 
            const parsed = JSON.parse(saved);
            // On vérifie si de nouveaux widgets ont été ajoutés par le dev depuis la sauvegarde
            const merged = ALL_WIDGETS_CONFIG.map(def => {
                const existing = parsed.find(p => p.id === def.id);
                return existing ? existing : def; // Si existe on prend la config user, sinon la default
            });
            // On respecte l'ordre sauvegardé pour ceux qui existent
            // (C'est un peu complexe à merger parfaitement, ici on simplifie : on prend le saved et on ajoute les manquants à la fin)
            const newItems = parsed.filter(p => ALL_WIDGETS_CONFIG.some(def => def.id === p.id));
            const missingItems = ALL_WIDGETS_CONFIG.filter(def => !parsed.some(p => p.id === def.id));
            items = [...newItems, ...missingItems];
        } catch (e) { console.error(e); }
    }
  });

  // --- DND HANDLERS ---
  function handleDndConsider(e) {
    // On met à jour l'ordre visuel des items affichés
    // Il faut être prudent car dndzone ne renvoie que les éléments affichés
    // On reconstruit la liste complète en gardant les masqués à part
    const newDisplayed = e.detail.items;
    items = [...newDisplayed, ...hiddenItems];
  }
  
  function handleDndFinalize(e) {
    const newDisplayed = e.detail.items;
    items = [...newDisplayed, ...hiddenItems];
    saveLayout(); 
  }

  // --- ACTIONS WIDGETS ---
  function toggleSize(id) {
    items = items.map(i => i.id === id ? { ...i, cols: i.cols === 2 ? 1 : 2 } : i);
    saveLayout();
  }

  function toggleVisibility(id) {
    items = items.map(i => i.id === id ? { ...i, visible: !i.visible } : i);
    saveLayout();
  }

  function saveLayout() { 
      localStorage.setItem('baco_dashboard_layout_v4', JSON.stringify(items)); 
  }

  function toggleEditMode() { 
      isEditMode = !isEditMode; 
      if(!isEditMode) saveLayout(); 
  }
  
  function handleSearch() { 
      window.dispatchEvent(new CustomEvent('openGlobalSearch')); 
  }
</script>

<svelte:head>
  <title>Accueil - Portail BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 pb-20">
  
  <header class="flex flex-col md:flex-row justify-between items-center gap-6">
    <div class="flex items-center gap-4">
      {#if userProfile?.avatar_url}
        <img src={userProfile.avatar_url} alt="Avatar" class="w-16 h-16 rounded-full object-cover shadow-[0_0_20px_rgba(255,255,255,0.15)] border border-white/10">
      {/if}
      <div>
        <h2 class="text-3xl font-bold text-white tracking-tight">
          Bonjour, <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">{userProfile?.full_name || 'Utilisateur'}</span>
        </h2>
        <p class="text-gray-400 text-sm">Tableau de bord.</p>
      </div>
    </div>

    <button 
        on:click={toggleEditMode} 
        class="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all shadow-lg 
        {isEditMode ? 'bg-blue-600 border-blue-500 text-white shadow-blue-500/20' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}"
    >
        {#if isEditMode} <Save class="w-4 h-4" /> Terminer {:else} <Settings class="w-4 h-4" /> Personnaliser {/if}
    </button>
  </header>

  {#if isEditMode && hiddenItems.length > 0}
    <div transition:slide class="bg-black/30 border border-white/10 rounded-2xl p-6">
        <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <EyeOff class="w-4 h-4" /> Widgets masqués ({hiddenItems.length})
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {#each hiddenItems as item (item.id)}
                <button 
                    on:click={() => toggleVisibility(item.id)}
                    class="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-green-500/50 hover:text-green-400 transition-all group"
                >
                    <Plus class="w-6 h-6 text-gray-500 group-hover:text-green-400" />
                    <span class="text-xs font-bold text-gray-300 group-hover:text-white">{item.title}</span>
                </button>
            {/each}
        </div>
    </div>
  {/if}

  <section 
    use:dndzone="{{items: displayedItems, flipDurationMs, dragDisabled: !isEditMode, dropTargetStyle: {outline: 'none'}}}" 
    on:consider={handleDndConsider} 
    on:finalize={handleDndFinalize}
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[200px]"
  >
    {#each displayedItems as item (item.id)}
        <div 
            class="relative transition-all duration-300 rounded-2xl
                   {item.cols === 2 ? 'md:col-span-2' : 'md:col-span-1'} 
                   {isEditMode ? 'z-10 ring-2 ring-blue-500/50 scale-[0.99]' : ''}"
            animate:flip="{{duration: flipDurationMs}}"
        >
            <div class="h-full min-h-[350px] {isEditMode ? 'pointer-events-none opacity-40 blur-[1px]' : ''}">
                <svelte:component this={WIDGET_TYPES[item.type]} />
            </div>

            {#if isEditMode}
                <div class="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl">
                    
                    <div class="p-3 bg-blue-600 rounded-full shadow-xl cursor-grab active:cursor-grabbing mb-3 hover:scale-110 transition-transform">
                        <GripHorizontal class="w-6 h-6 text-white" />
                    </div>
                    
                    <div class="flex items-center gap-1 bg-[#0f1115] rounded-full px-3 py-1.5 border border-white/20 shadow-2xl backdrop-blur-md">
                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">{item.title}</span>
                        
                        <div class="w-px h-3 bg-white/20 mx-1"></div>
                        
                        <button 
                            on:click|stopPropagation={() => toggleSize(item.id)} 
                            class="p-1.5 hover:bg-white/20 rounded-lg text-blue-400 hover:text-white transition-colors" 
                            title={item.cols === 2 ? "Réduire" : "Agrandir"}
                        >
                            {#if item.cols === 2} <Minimize class="w-4 h-4"/> {:else} <Maximize class="w-4 h-4"/> {/if}
                        </button>

                        <button 
                            on:click|stopPropagation={() => toggleVisibility(item.id)} 
                            class="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition-colors" 
                            title="Masquer ce widget"
                        >
                            <EyeOff class="w-4 h-4"/>
                        </button>
                    </div>

                </div>
            {/if}
        </div>
    {/each}
  </section>

  {#if displayedItems.length === 0 && !isEditMode}
    <div class="flex flex-col items-center justify-center py-20 text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed">
        <LayoutDashboard class="w-12 h-12 mb-4 opacity-50" />
        <p class="text-lg font-bold">Votre tableau de bord est vide.</p>
        <button on:click={toggleEditMode} class="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors">
            Ajouter des widgets
        </button>
    </div>
  {/if}

</div>