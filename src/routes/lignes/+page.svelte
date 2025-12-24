<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade } from 'svelte/transition';
  import { 
    Route, MapPin, TrainTrack, Milestone, Building2, Tag, Info, Loader2, Filter, CheckSquare, Square, Map 
  } from 'lucide-svelte';

  // --- ÉTAT ---
  let availableLines = [];
  let linesToDistricts = {}; 
  let isLoadingFilters = true;
  let isLoadingResults = false;

  let selectedDistricts = []; 
  let selectedCategories = []; 
  let selectedLines = [];
  let selectedZones = []; 

  let results = {};

  onMount(async () => {
    await loadLineFilters();
  });

  async function loadLineFilters() {
    isLoadingFilters = true;
    try {
      const [pn, spi, gares] = await Promise.all([
        supabase.from('pn_data').select('ligne_nom'),
        supabase.from('spi_data').select('ligne_nom'),
        supabase.from('ligne_data').select('ligne_nom, district') 
      ]);

      (gares.data || []).forEach(g => {
        if (g.ligne_nom && g.district) {
            linesToDistricts[g.ligne_nom] = g.district;
        }
      });

      const allLines = [
        ...(pn.data || []).map(i => i.ligne_nom),
        ...(spi.data || []).map(i => i.ligne_nom),
        ...(gares.data || []).map(i => i.ligne_nom)
      ];

      availableLines = [...new Set(allLines.filter(Boolean))].sort((a, b) => {
        const parseLine = (str) => parseFloat(str.replace('L.', '').replace('A', '.1').replace('C', '.2'));
        return parseLine(a) - parseLine(b);
      });
    } catch (e) {
      console.error("Erreur chargement lignes:", e);
    } finally {
      isLoadingFilters = false;
    }
  }

  $: filteredAvailableLines = availableLines.filter(line => {
    if (selectedDistricts.length === 0) return true;
    const dist = linesToDistricts[line];
    return dist && selectedDistricts.includes(dist);
  });

  $: {
     const visibleLines = new Set(filteredAvailableLines);
     selectedLines = selectedLines.filter(l => visibleLines.has(l));
  }

  async function updateDisplay() {
    if (selectedCategories.length === 0 || selectedLines.length === 0) {
      results = {};
      return;
    }

    isLoadingResults = true;
    const newResults = {};
    selectedLines.forEach(line => {
      newResults[line] = { gares: [], pn: [], spi: [] };
    });

    try {
      const promises = [];
      if (selectedCategories.includes("Lignes")) {
        promises.push(
          supabase.from('ligne_data')
            .select('ligne_nom, gare')
            .in('ligne_nom', selectedLines)
            .order('ordre')
            .then(res => ({ type: 'gares', data: res.data || [] }))
        );
      }
      
      if (selectedCategories.includes("Adresse PN")) {
        promises.push(supabase.from('pn_data').select('*').in('ligne_nom', selectedLines).then(res => ({ type: 'pn', data: res.data || [] })));
      }
      if (selectedCategories.includes("Zone SPI")) {
        let q = supabase.from('spi_data').select('*').in('ligne_nom', selectedLines);
        if (selectedZones.length > 0) q = q.in('zone', selectedZones);
        promises.push(q.then(res => ({ type: 'spi', data: res.data || [] })));
      }

      const responses = await Promise.all(promises);
      responses.forEach(res => {
        res.data.forEach(item => {
          if (newResults[item.ligne_nom]) {
            newResults[item.ligne_nom][res.type].push(item);
          }
        });
      });
      results = newResults;

    } catch (e) {
      console.error("Erreur chargement données:", e);
    } finally {
      isLoadingResults = false;
    }
  }

  $: if (selectedCategories || selectedLines || selectedZones || selectedDistricts) {
    updateDisplay();
  }

  // --- MISE À JOUR DE LA CLASSE DYNAMIQUE ---
  const toggleBtnClass = (active) => `flex items-center space-x-2 px-4 py-2 border rounded-full transition-all duration-300 text-sm font-medium shadow-sm hover:scale-105 active:scale-95 ${active ? 'btn-active-themed' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}`;
</script>

<svelte:head>
  <title>Lignes | BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }} style="--primary-rgb: var(--color-primary);">
    <div class="flex items-center gap-3">
        <div class="main-icon-container p-3 rounded-xl border transition-all duration-500">
          <Route size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire des Lignes</h1>
          <p class="text-gray-500 text-sm mt-1">Infrastructures, PN et Zones SPI.</p>
        </div>
    </div>
  </header>

  <main class="space-y-8" style="--primary-rgb: var(--color-primary);">
    
    <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600, delay: 50 }}>
      <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <div class="step-number">1</div>
        Choisir le District
      </h3>
      <div class="flex flex-wrap gap-3">
        {#each ['DSO', 'DSE'] as dist}
          <label class="{toggleBtnClass(selectedDistricts.includes(dist))} cursor-pointer select-none">
            <input type="checkbox" value={dist} bind:group={selectedDistricts} class="hidden">
            {#if selectedDistricts.includes(dist)}<CheckSquare class="w-4 h-4 text-themed" />{:else}<Square class="w-4 h-4" />{/if}
            <span>{dist}</span>
          </label>
        {/each}
      </div>
    </div>

    <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600, delay: 100 }}>
      <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <div class="step-number">2</div>
        Choisir les catégories
      </h3>
      <div class="flex flex-wrap gap-3">
        {#each ['Lignes', 'Adresse PN', 'Zone SPI'] as cat}
          <label class="{toggleBtnClass(selectedCategories.includes(cat))} cursor-pointer select-none">
            <input type="checkbox" value={cat} bind:group={selectedCategories} class="hidden">
            {#if selectedCategories.includes(cat)}<CheckSquare class="w-4 h-4 text-themed" />{:else}<Square class="w-4 h-4" />{/if}
            <span>{cat}</span>
          </label>
        {/each}
      </div>
    </div>

    {#if selectedCategories.length > 0}
      <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600 }}>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <div class="step-number">3</div>
          Sélectionner les lignes 
          {#if selectedDistricts.length > 0}<span class="text-gray-500 font-normal ml-2 text-[10px] normal-case">({selectedDistricts.join(', ')})</span>{/if}
        </h3>
        
        {#if isLoadingFilters}
          <div class="flex items-center gap-2 text-gray-500 p-4"><Loader2 size={20} class="animate-spin text-themed-muted"/> Chargement...</div>
        {:else if filteredAvailableLines.length === 0}
          <div class="p-4 text-center border border-dashed border-white/10 rounded-xl">
             <p class="text-gray-400 text-sm">Aucune ligne trouvée pour ce district.</p>
          </div>
        {:else}
          <div class="flex flex-wrap gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
          {#each filteredAvailableLines as line}
              <label class="{toggleBtnClass(selectedLines.includes(line))} cursor-pointer select-none py-1.5 px-3 text-xs">
                <input type="checkbox" value={line} bind:group={selectedLines} class="hidden">
                {#if selectedLines.includes(line)}<CheckSquare class="w-3.5 h-3.5 text-themed" />{:else}<Square class="w-3.5 h-3.5" />{/if}
                <span>{line}</span>
              </label>
            {/each} </div>
        {/if}
      </div>
    {/if}

    {#if selectedCategories.includes('Zone SPI') && selectedLines.length > 0}
      <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600 }}>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs font-bold border border-purple-500/20">4</div>
          Filtres SPI (Optionnel)
        </h3>
        <div class="flex flex-wrap gap-3">
          {#each ['FTY', 'FMS', 'FCR'] as zone}
            <label class="{toggleBtnClass(selectedZones.includes(zone)).replace('btn-active-themed', 'bg-purple-500/20 border-purple-500/40 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]')} cursor-pointer select-none">
              <input type="checkbox" value={zone} bind:group={selectedZones} class="hidden">
              {#if selectedZones.includes(zone)}<CheckSquare class="w-4 h-4 text-purple-400" />{:else}<Square class="w-4 h-4" />{/if}
              <span>{zone}</span>
            </label>
          {/each}
        </div>
      </div>
    {/if}

    <div class="border-t border-white/10 my-8"></div>

    <div id="resultDisplay" class="min-h-[200px]">
      {#if isLoadingResults}
        <div class="flex flex-col items-center justify-center py-20 text-gray-500">
            <Loader2 class="w-10 h-10 text-themed-muted animate-spin mb-3" />
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
            
            <div class="mb-10 animate-in fade-in duration-500 bg-black/20 rounded-3xl border border-white/5 p-6 md:p-8">
              <div class="flex items-center gap-4 mb-8 pb-4 border-b border-white/5">
                <span class="line-pill">{line}</span>
                <div class="h-px bg-white/10 flex-grow"></div>
              </div>

              {#if results[line].gares.length > 0}
                <div class="mb-8">
                  <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                    <Building2 size={20} class="text-themed" /> Gares
                  </h3>
                  <div class="flex flex-wrap gap-3">
                    {#each results[line].gares as gare}
                      <div class="bg-white/5 px-4 py-2.5 rounded-xl border border-white/5 text-gray-200 font-medium hover:bg-white/10 transition-colors shadow-sm">
                        {gare.gare}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if results[line].pn.length > 0}
                <div class="mb-8">
                  <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                    <TrainTrack size={20} class="text-themed" /> Passages à Niveau
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each results[line].pn as pn}
                      <div class="card-themed group">
                        <div class="flex justify-between items-center">
                          <span class="pn-number">{pn.pn}</span>
                          <span class="bk-pill"><Milestone size={14} /> {pn.bk}</span>
                        </div>
                        <div class="flex items-start gap-2 text-sm text-gray-400 mt-2 pl-1 border-t border-white/5 pt-2">
                          <MapPin size={16} class="flex-shrink-0 mt-0.5 opacity-50 group-hover:text-themed transition-colors" />
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
                      <div class="bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-purple-500/20 shadow-sm flex flex-col gap-2 hover:bg-white/10 transition-all group">
                        <div class="flex justify-between items-center">
                          <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 text-gray-200 text-sm font-bold border border-white/5">{spi.lieu}</span>
                          <span class="flex items-center gap-1.5 text-sm font-bold font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                            <Tag size={14} /> {spi.zone}
                          </span>
                        </div>
                        <div class="flex items-start gap-2 text-sm text-gray-400 mt-2 pl-1 border-t border-white/5 pt-2">
                          <MapPin size={16} class="flex-shrink-0 mt-0.5 opacity-50 group-hover:text-purple-400 transition-colors" />
                          <span>{spi.adresse}</span>
                        </div>
                        {#if spi.remarques}
                          <div class="flex items-start gap-2 text-xs text-gray-500 mt-2 pt-2 bg-black/20 p-2 rounded-lg border border-white/5">
                            <Info size={14} class="flex-shrink-0 mt-0.5 text-themed" />
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

<style>
  /* CONFIGURATION DU THÈME DYNAMIQUE */
  .text-themed { color: rgb(var(--primary-rgb)); }
  .text-themed-muted { color: rgba(var(--primary-rgb), 0.5); }
  
  .main-icon-container { 
    background-color: rgba(var(--primary-rgb), 0.1); 
    color: rgb(var(--primary-rgb)); 
    border-color: rgba(var(--primary-rgb), 0.2); 
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15); 
  }

  .step-number {
    width: 1.5rem; height: 1.5rem; border-radius: 999px;
    background-color: rgba(var(--primary-rgb), 0.1);
    color: rgb(var(--primary-rgb));
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: bold;
    border: 1px solid rgba(var(--primary-rgb), 0.2);
  }

  .btn-active-themed {
    background-color: rgba(var(--primary-rgb), 0.2);
    border-color: rgba(var(--primary-rgb), 0.4);
    color: rgb(var(--primary-rgb));
    box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.2);
  }

  .line-pill {
    background-color: rgb(var(--primary-rgb));
    color: white;
    padding: 0.375rem 1rem;
    border-radius: 0.75rem;
    font-size: 1.25rem;
    font-weight: bold;
    box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.4);
  }

  .card-themed {
    background-color: rgba(255, 255, 255, 0.05);
    padding: 1rem; border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
    transition: all 0.3s;
  }
  .card-themed:hover {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(var(--primary-rgb), 0.3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .pn-number {
    display: flex; align-items: center; gap: 0.375rem;
    padding: 0.25rem 0.625rem; border-radius: 0.5rem;
    background-color: rgba(0, 0, 0, 0.3);
    color: #e5e7eb; font-size: 0.875rem; font-weight: bold;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .bk-pill {
    display: flex; align-items: center; gap: 0.375rem;
    font-size: 0.875rem; font-weight: bold; font-family: monospace;
    color: rgb(var(--primary-rgb));
    background-color: rgba(var(--primary-rgb), 0.1);
    padding: 0.125rem 0.5rem; border-radius: 0.375rem;
    border: 1px solid rgba(var(--primary-rgb), 0.2);
  }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>