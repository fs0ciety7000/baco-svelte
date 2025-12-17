<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade } from 'svelte/transition';
  import { 
    Route, MapPin, TrainTrack, Milestone, Building2, Tag, Info, Loader2, Filter, CheckSquare, Square, Map 
  } from 'lucide-svelte'; // J'ai ajouté l'icône Map si dispo, sinon Building2 fera l'affaire

  // --- ÉTAT ---
  let availableLines = [];
  let linesToDistricts = {}; // Nouveau : Map ligne -> district
  let isLoadingFilters = true;
  let isLoadingResults = false;

  // Sélections
  let selectedDistricts = []; // Nouveau : ['DSO', 'DSE']
  let selectedCategories = []; 
  let selectedLines = [];
  let selectedZones = []; 

  // Résultats structurés
  let results = {};

  onMount(async () => {
    await loadLineFilters();
  });

  // --- CHARGEMENT FILTRES ---
  async function loadLineFilters() {
    isLoadingFilters = true;
    try {
      // Modifié : On récupère aussi le 'district' dans ligne_data
      const [pn, spi, gares] = await Promise.all([
        supabase.from('pn_data').select('ligne_nom'),
        supabase.from('spi_data').select('ligne_nom'),
        supabase.from('ligne_data').select('ligne_nom, district') 
      ]);

      // Nouveau : On construit le dictionnaire Ligne -> District
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

      // Unique + Tri intelligent
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

  // --- LOGIQUE DE FILTRAGE DYNAMIQUE ---
  // Nouveau : On calcule les lignes à afficher selon le district choisi
  $: filteredAvailableLines = availableLines.filter(line => {
    // Si aucun district sélectionné, on montre tout (ou rien, selon votre préférence. Ici tout).
    if (selectedDistricts.length === 0) return true;
    
    // On récupère le district de la ligne
    const dist = linesToDistricts[line];
    
    // On garde la ligne si son district est dans la sélection
    return dist && selectedDistricts.includes(dist);
  });

  // Si la liste filtrée change, on doit nettoyer les lignes sélectionnées qui ne sont plus visibles
  $: {
     const visibleLines = new Set(filteredAvailableLines);
     selectedLines = selectedLines.filter(l => visibleLines.has(l));
  }

  // --- CHARGEMENT RÉSULTATS ---
  async function updateDisplay() {
    // (Le reste de la fonction reste identique...)
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
      // 1. Gares
      if (selectedCategories.includes("Lignes")) {
        promises.push(
          supabase.from('ligne_data')
            .select('ligne_nom, gare')
            .in('ligne_nom', selectedLines)
            .order('ordre')
            .then(res => ({ type: 'gares', data: res.data || [] }))
        );
      }
      // ... (Le reste des appels PN et SPI reste identique)
      
      // ... (Suite de la fonction updateDisplay inchangée)
      
      // Pour abréger ici, je ne remets pas tout le bloc try/catch s'il est inchangé, 
      // assurez-vous de garder le code existant pour PN et SPI.
      
      // Restauration du code original pour la complétion :
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

  const toggleBtnClass = (active) => `flex items-center space-x-2 px-4 py-2 border rounded-full transition-all duration-300 text-sm font-medium shadow-sm hover:scale-105 active:scale-95 ${active ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}`;
</script>

<svelte:head>
  <title>Lignes | BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
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
    
    <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600, delay: 50 }}>
      <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <div class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/20">1</div>
        Choisir le District
      </h3>
      <div class="flex flex-wrap gap-3">
        {#each ['DSO', 'DSE'] as dist}
          <label class="{toggleBtnClass(selectedDistricts.includes(dist))} cursor-pointer select-none">
            <input type="checkbox" value={dist} bind:group={selectedDistricts} class="hidden">
            {#if selectedDistricts.includes(dist)}<CheckSquare class="w-4 h-4 text-blue-400" />{:else}<Square class="w-4 h-4" />{/if}
            <span>{dist}</span>
          </label>
        {/each}
      </div>
    </div>

    <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600, delay: 100 }}>
      <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <div class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/20">2</div>
        Choisir les catégories
      </h3>
      <div class="flex flex-wrap gap-3">
        {#each ['Lignes', 'Adresse PN', 'Zone SPI'] as cat}
          <label class="{toggleBtnClass(selectedCategories.includes(cat))} cursor-pointer select-none">
            <input type="checkbox" value={cat} bind:group={selectedCategories} class="hidden">
            {#if selectedCategories.includes(cat)}<CheckSquare class="w-4 h-4 text-blue-400" />{:else}<Square class="w-4 h-4" />{/if}
            <span>{cat}</span>
          </label>
        {/each}
      </div>
    </div>

    {#if selectedCategories.length > 0}
      <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600 }}>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/20">3</div>
          Sélectionner les lignes 
          {#if selectedDistricts.length > 0}<span class="text-gray-500 font-normal ml-2 text-[10px] normal-case">({selectedDistricts.join(', ')})</span>{/if}
        </h3>
        
        {#if isLoadingFilters}
          <div class="flex items-center gap-2 text-gray-500 p-4"><Loader2 size={20} class="animate-spin text-blue-500/50"/> Chargement...</div>
        
        {:else if filteredAvailableLines.length === 0}
          <div class="p-4 text-center border border-dashed border-white/10 rounded-xl">
             <p class="text-gray-400 text-sm">Aucune ligne trouvée pour ce district.</p>
          </div>
        {:else}
          <div class="flex flex-wrap gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
            {#each filteredAvailableLines as line}
              <label class="{toggleBtnClass(selectedLines.includes(line))} cursor-pointer select-none py-1.5 px-3 text-xs">
                <input type="checkbox" value={line} bind:group={selectedLines} class="hidden">
                {#if selectedLines.includes(line)}<CheckSquare class="w-3.5 h-3.5 text-blue-400" />{:else}<Square class="w-3.5 h-3.5" />{/if}
                <span>{line}</span>
              </label>
            {/each}
          </div>
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
            <label class="{toggleBtnClass(selectedZones.includes(zone)).replace('blue', 'purple')} cursor-pointer select-none">
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
            
            <div class="mb-10 animate-in fade-in duration-500 bg-black/20 rounded-3xl border border-white/5 p-6 md:p-8">
              <div class="flex items-center gap-4 mb-8 pb-4 border-b border-white/5">
                <span class="bg-blue-600 text-white px-4 py-1.5 rounded-xl text-xl font-bold shadow-lg shadow-blue-900/50">{line}</span>
                <div class="h-px bg-white/10 flex-grow"></div>
              </div>

              {#if results[line].gares.length > 0}
                <div class="mb-8">
                  <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                    <Building2 size={20} class="text-blue-400" /> Gares
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
                    <TrainTrack size={20} class="text-blue-400" /> Passages à Niveau
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each results[line].pn as pn}
                      <div class="bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-blue-500/20 shadow-sm flex flex-col gap-2 hover:bg-white/10 transition-all group">
                        <div class="flex justify-between items-center">
                          <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 text-gray-200 text-sm font-bold border border-white/5">
                            {pn.pn}
                          </span>
                          <span class="flex items-center gap-1.5 text-sm font-bold font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            <Milestone size={14} /> {pn.bk}
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
                      <div class="bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-purple-500/20 shadow-sm flex flex-col gap-2 hover:bg-white/10 transition-all group">
                        <div class="flex justify-between items-center">
                          <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 text-gray-200 text-sm font-bold border border-white/5">
                            {spi.lieu}
                          </span>
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