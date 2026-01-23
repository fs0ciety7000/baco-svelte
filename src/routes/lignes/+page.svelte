<script>
    import { onMount } from 'svelte';
    import { fly, fade, slide } from 'svelte/transition';
    import { 
        Route, MapPin, TrainTrack, Milestone, Building2, Tag, Info, 
        Loader2, CheckSquare, Square, Filter 
    } from 'lucide-svelte';

    // Libs
    import { LignesService } from '$lib/services/lignes.service.js';

    // --- ÉTAT (RUNES) ---
    let isLoadingFilters = $state(true);
    let isLoadingResults = $state(false);

    // Données de base
    let availableLines = $state([]);
    let linesToDistricts = $state({});

    // Sélections
    let selectedDistricts = $state([]); 
    let selectedCategories = $state([]); 
    let selectedLines = $state([]);
    let selectedZones = $state([]);

    // Résultats
    let results = $state({});

    // --- DERIVED ---
    // Filtre les lignes disponibles selon les districts cochés
    let filteredAvailableLines = $derived.by(() => {
        return availableLines.filter(line => {
            if (selectedDistricts.length === 0) return true;
            const dist = linesToDistricts[line];
            // Si pas de district connu, on l'affiche si DSO est coché (convention) ou on le masque ?
            // Ici on affiche seulement si le district correspond explicitement
            return dist && selectedDistricts.includes(dist);
        });
    });

    // --- EFFECTS ---
    
    // 1. Nettoyage de la sélection si les lignes filtrées changent
    $effect(() => {
        const visibleSet = new Set(filteredAvailableLines);
        // On ne garde que les lignes qui sont toujours visibles
        // (Sauf si on veut permettre de garder une sélection masquée, mais c'est souvent confus)
        // Ici on garde l'approche "ce qui est masqué est désélectionné"
        if (selectedLines.some(l => !visibleSet.has(l))) {
             selectedLines = selectedLines.filter(l => visibleSet.has(l));
        }
    });

    // 2. Chargement automatique des résultats
    $effect(() => {
        if (selectedCategories.length > 0 && selectedLines.length > 0) {
            loadResults();
        } else {
            results = {};
        }
    });

    // --- INIT ---
    onMount(async () => {
        await loadFilters();
    });

    async function loadFilters() {
        isLoadingFilters = true;
        try {
            const data = await LignesService.loadFilters();
            availableLines = data.availableLines;
            linesToDistricts = data.linesToDistricts;
        } catch (e) {
            console.error(e);
        } finally {
            isLoadingFilters = false;
        }
    }

    async function loadResults() {
        isLoadingResults = true;
        try {
            results = await LignesService.loadDetails(selectedLines, selectedCategories, selectedZones);
        } catch (e) {
            console.error(e);
        } finally {
            isLoadingResults = false;
        }
    }

    // --- UTILS UI ---
    function toggleItem(list, item) {
        if (list.includes(item)) return list.filter(i => i !== item);
        return [...list, item];
    }

    const btnClass = (active, color = 'blue') => 
        `flex items-center space-x-2 px-4 py-2 border rounded-full transition-all duration-300 text-sm font-bold shadow-sm cursor-pointer select-none hover:scale-105 active:scale-95 ${
            active 
            ? `bg-${color}-500/20 border-${color}-500/40 text-${color}-400 shadow-[0_0_10px_rgba(0,0,0,0.2)]` 
            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'
        }`;

</script>

<svelte:head>
  <title>Lignes | BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Route size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire des Lignes</h1>
          <p class="text-gray-500 text-sm mt-1">Infrastructures, PN et Zones SPI.</p>
        </div>
    </div>
  </header>

  <main class="space-y-8">
    
    <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, delay: 50 }}>
      <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <div class="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px]">1</div>
        Choisir le District
      </h3>
      <div class="flex flex-wrap gap-3">
        {#each ['DSO', 'DSE'] as dist}
          <button 
            onclick={() => selectedDistricts = toggleItem(selectedDistricts, dist)}
            class={btnClass(selectedDistricts.includes(dist), 'blue')}
          >
            {#if selectedDistricts.includes(dist)}<CheckSquare class="w-4 h-4" />{:else}<Square class="w-4 h-4" />{/if}
            <span>{dist}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, delay: 100 }}>
      <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <div class="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px]">2</div>
        Choisir les catégories
      </h3>
      <div class="flex flex-wrap gap-3">
        {#each ['Lignes', 'Adresse PN', 'Zone SPI'] as cat}
          <button 
            onclick={() => selectedCategories = toggleItem(selectedCategories, cat)}
            class={btnClass(selectedCategories.includes(cat), 'blue')}
          >
            {#if selectedCategories.includes(cat)}<CheckSquare class="w-4 h-4" />{:else}<Square class="w-4 h-4" />{/if}
            <span>{cat}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if selectedCategories.length > 0}
      <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:slide>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px]">3</div>
          Sélectionner les lignes 
          {#if selectedDistricts.length > 0}
            <span class="text-blue-400 font-normal ml-2 text-[10px] normal-case bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                {selectedDistricts.join(', ')}
            </span>
          {/if}
        </h3>
        
        {#if isLoadingFilters}
          <div class="flex items-center gap-2 text-gray-500 p-4"><Loader2 size={20} class="animate-spin"/> Chargement...</div>
        {:else if filteredAvailableLines.length === 0}
          <div class="p-6 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
             <p class="text-gray-400 text-sm">Aucune ligne trouvée pour ce district.</p>
          </div>
        {:else}
          <div class="flex flex-wrap gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
            {#each filteredAvailableLines as line}
               <button 
                 onclick={() => selectedLines = toggleItem(selectedLines, line)}
                 class="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 {selectedLines.includes(line) ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'}"
               >
                 {#if selectedLines.includes(line)}<CheckSquare class="w-3 h-3" />{:else}<Square class="w-3 h-3" />{/if}
                 {line}
               </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if selectedCategories.includes('Zone SPI') && selectedLines.length > 0}
      <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:slide>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs font-bold border border-purple-500/20">4</div>
          Filtres SPI (Optionnel)
        </h3>
        <div class="flex flex-wrap gap-3">
          {#each ['FTY', 'FMS', 'FCR'] as zone}
            <button 
                onclick={() => selectedZones = toggleItem(selectedZones, zone)}
                class={btnClass(selectedZones.includes(zone), 'purple')}
            >
              {#if selectedZones.includes(zone)}<CheckSquare class="w-4 h-4" />{:else}<Square class="w-4 h-4" />{/if}
              <span>{zone}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>

    <div id="resultDisplay" class="min-h-[200px]">
      {#if isLoadingResults}
        <div class="flex flex-col items-center justify-center py-20 text-gray-500">
            <Loader2 class="w-10 h-10 text-blue-500/50 animate-spin mb-3" />
            <p>Chargement des données...</p>
        </div>
      {:else if selectedLines.length === 0}
        <div class="text-center py-16 bg-black/20 rounded-3xl border border-dashed border-white/10" in:fade>
          <Filter size={48} class="mx-auto mb-4 opacity-30 text-gray-500" />
          <h3 class="text-lg font-bold text-gray-400">En attente de sélection</h3>
          <p class="text-gray-600">Choisissez au moins une catégorie et une ligne pour voir les résultats.</p>
        </div>
      {:else}
        {#each selectedLines as line}
          {#if results[line] && (results[line].gares.length > 0 || results[line].pn.length > 0 || results[line].spi.length > 0)}
            
            <div class="mb-10 animate-in fade-in duration-500 bg-black/20 rounded-3xl border border-white/5 p-6 md:p-8 relative overflow-hidden">
              <div class="flex items-center gap-4 mb-8 pb-4 border-b border-white/5">
                <span class="px-4 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xl shadow-lg shadow-blue-500/20">{line}</span>
                <div class="h-px bg-white/10 flex-grow"></div>
              </div>

              {#if results[line].gares.length > 0}
                <div class="mb-8">
                  <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                    <Building2 size={20} class="text-blue-400" /> Gares
                  </h3>
                  <div class="flex flex-wrap gap-3">
                    {#each results[line].gares as gare}
                      <div class="bg-white/5 px-4 py-2.5 rounded-xl border border-white/5 text-gray-200 font-medium hover:bg-white/10 transition-colors shadow-sm cursor-default">
                        {gare.gare}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if results[line].pn.length > 0}
                <div class="mb-8">
                  <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                    <TrainTrack size={20} class="text-blue-400" /> Passages à Niveau
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each results[line].pn as pn}
                      <div class="bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all group hover:bg-white/[0.05]">
                        <div class="flex justify-between items-center mb-2">
                          <span class="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-gray-200 font-bold text-sm shadow-sm">
                              {pn.pn}
                          </span>
                          <span class="flex items-center gap-1 text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                              <Milestone size={12} /> {pn.bk}
                          </span>
                        </div>
                        <div class="flex items-start gap-2 text-sm text-gray-400 mt-2 pl-1 border-t border-white/5 pt-2">
                          <MapPin size={16} class="flex-shrink-0 mt-0.5 opacity-50 group-hover:text-blue-400 transition-colors" />
                          <span>{pn.adresse}</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if results[line].spi.length > 0}
                <div class="mb-6">
                  <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                    <Tag size={20} class="text-purple-400" /> Zones SPI
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each results[line].spi as spi}
                      <div class="bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:border-purple-500/20 transition-all group flex flex-col gap-2 hover:bg-white/[0.05]">
                        <div class="flex justify-between items-center">
                          <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 text-gray-200 text-sm font-bold border border-white/5">{spi.lieu}</span>
                          <span class="flex items-center gap-1.5 text-sm font-bold font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                             <Tag size={12} /> {spi.zone}
                          </span>
                        </div>
                        <div class="flex items-start gap-2 text-sm text-gray-400 mt-2 pl-1 border-t border-white/5 pt-2">
                           <MapPin size={16} class="flex-shrink-0 mt-0.5 opacity-50 group-hover:text-purple-400 transition-colors" />
                          <span>{spi.adresse}</span>
                        </div>
                        {#if spi.remarques}
                          <div class="flex items-start gap-2 text-xs text-gray-500 mt-2 pt-2 bg-black/20 p-2 rounded-lg border border-white/5">
                            <Info size={14} class="flex-shrink-0 mt-0.5 text-blue-400" />
                            <span class="italic">{spi.remarques}</span>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </main>
</div>