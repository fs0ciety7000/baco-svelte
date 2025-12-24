<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { 
    Plus, Search, Filter, MapPin, 
    AlertTriangle, X, Save, Trash2, Pencil, PenTool, Accessibility, Train, Info, FileText
  } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';

  let pmrs = [];
  let isLoading = true;
  let isSaving = false;
  let isModalOpen = false;
  let filters = { search: "", zone: "all", etat: "all", type: "all" };
  let editingPmr = { id: null, gare: "", quai: "", zone: "", type_assistance: "N/A", type_rampe: "", rampe_id: "", etat_rampe: "OK", validite: "", cadenas: "", reparation_demandee: false, remarque_rampe: "", restrictions_gare: "", remarque_gare: "" };

  onMount(() => { loadPmrData(); });

  async function loadPmrData() {
    isLoading = true;
    let query = supabase.from('pmr_data').select('*').order('gare', { ascending: true });
    if (filters.zone !== 'all') query = query.eq('zone', filters.zone);
    if (filters.etat !== 'all') query = query.eq('etat_rampe', filters.etat);
    if (filters.type !== 'all') query = query.eq('type_assistance', filters.type);
    if (filters.search.trim()) query = query.or(`gare.ilike.%${filters.search.trim()}%,quai.ilike.%${filters.search.trim()}%,rampe_id.ilike.%${filters.search.trim()}%`);
    const { data } = await query;
    pmrs = data || [];
    isLoading = false;
  }

  async function handleSave() {
    isSaving = true;
    const payload = { ...editingPmr };
    Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === 'N/A') payload[k] = null; });
    delete payload.id;
    const query = editingPmr.id ? supabase.from('pmr_data').update(payload).eq('id', editingPmr.id) : supabase.from('pmr_data').insert([payload]);
    await query;
    isSaving = false;
    closeModal();
    loadPmrData();
  }

  async function deleteEntry(id) {
    if (confirm("Supprimer cette entrée ?")) {
      await supabase.from('pmr_data').delete().eq('id', id);
      loadPmrData();
    }
  }

  function openModal(entry = null) {
    editingPmr = entry ? { ...entry, type_assistance: entry.type_assistance || 'N/A', etat_rampe: entry.etat_rampe || 'OK' } : { id: null, gare: "", quai: "", zone: "", type_assistance: "N/A", type_rampe: "", rampe_id: "", etat_rampe: "OK", validite: "", cadenas: "", reparation_demandee: false, remarque_rampe: "", restrictions_gare: "", remarque_gare: "" };
    isModalOpen = true;
  }
  function closeModal() { isModalOpen = false; }

  const statusColors = {
    'OK': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
    'HS': 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]',
    'En attente': 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
  };
  function getBadgeClass(status) { return statusColors[status] || 'bg-gray-700 text-gray-300 border-gray-600'; }
  
  // Styles communs pour les inputs dans la modale (Dark Theme)
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none";
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Accessibility size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Gestion PMR & Rampes</h1>
          <p class="text-gray-500 text-sm mt-1">Suivi des équipements et de l'accessibilité en gare.</p>
        </div>
      </div>
    </div>
    
 <button 
  on:click={() => openModal()} 
  class="btn-themed px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group border shadow-lg"
  style="--primary-rgb: var(--color-primary);"
>
  <Plus size={20} class="group-hover:rotate-90 transition-transform" />
  <span class="font-semibold">Nouvelle Entrée</span>
</button>
  </header>

  <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600, delay: 100 }}>
    <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
      
      <div class="md:col-span-5">
        <label class="block text-xs font-bold uppercase text-gray-500 mb-2 ml-1">Recherche Rapide</label>
        <div class="relative group">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-blue-400 transition-colors">
              <Search size={18} />
          </div>
          <input 
            type="text" 
            bind:value={filters.search} 
            on:input={loadPmrData} 
            placeholder="Gare, quai, n° rampe..." 
            class="block w-full pl-10 pr-3 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:ring-2 focus:ring-blue-500/30 focus:border-transparent transition-all outline-none" 
          />
        </div>
      </div>

      {#each [{ label: 'Zone', val: 'zone', opts: ['FTY', 'FMS', 'FCR'] }, { label: 'État', val: 'etat', opts: ['OK', 'HS', 'En attente'] }, { label: 'Type', val: 'type', opts: ['Full', 'Light', 'Taxi'] }] as f}
        <div class="md:col-span-2">
          <label class="block text-xs font-bold uppercase text-gray-500 mb-2 ml-1">{f.label}</label>
          <div class="relative">
            <select bind:value={filters[f.val]} on:change={loadPmrData} class="block w-full pl-3 pr-8 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-gray-300 appearance-none focus:ring-2 focus:ring-blue-500/30 focus:border-transparent cursor-pointer outline-none">
              <option value="all">Tous</option>
              {#each f.opts as opt}<option value={opt}>{opt}</option>{/each}
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500"><Filter size={14} /></div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if isLoading}
    <div class="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
        <div class="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p>Chargement des données...</p>
    </div>
  {:else if pmrs.length === 0}
    <div class="text-center py-20 bg-black/20 rounded-2xl border border-dashed border-white/10" in:fade>
      <Search size={40} class="mx-auto text-gray-600 mb-4" />
      <h3 class="text-lg font-medium text-gray-400">Aucun résultat trouvé</h3>
      <p class="text-sm text-gray-600 mt-1">Essayez de modifier vos filtres.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each pmrs as item (item.id)}
        <div class="group bg-black/20 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all duration-300 flex flex-col overflow-hidden hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50" in:fly={{ y: 20, duration: 400 }}>
          
          <div class="p-5 border-b border-white/5 bg-white/[0.02] flex justify-between items-start">
            <div>
              <h3 class="text-xl font-bold text-gray-200 flex items-center gap-2">
                {item.gare}
                {#if item.zone}
                    <span class="text-[10px] font-extrabold px-2 py-0.5 rounded border border-white/10 bg-white/5 text-gray-400 uppercase tracking-wider">{item.zone}</span>
                {/if}
              </h3>
              <p class="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <Train size={14} /> Quai <strong class="text-gray-300">{item.quai || '?'}</strong>
              </p>
            </div>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold border {getBadgeClass(item.etat_rampe)}">
                {item.etat_rampe || 'N/A'}
            </span>
          </div>

          <div class="p-5 space-y-4 flex-grow text-sm">
            
            <div class="grid grid-cols-2 gap-4">
                {#if item.rampe_id}
                    <div class="bg-black/30 p-2 rounded-lg border border-white/5">
                        <span class="block text-xs text-gray-500 uppercase">ID Rampe</span>
                        <span class="font-mono text-gray-300">{item.rampe_id}</span>
                    </div>
                {/if}
                {#if item.type_assistance && item.type_assistance !== 'N/A'}
                    <div class="bg-black/30 p-2 rounded-lg border border-white/5">
                        <span class="block text-xs text-gray-500 uppercase">Assistance</span>
                        <span class="font-medium text-blue-400">{item.type_assistance}</span>
                    </div>
                {/if}
            </div>

            {#if item.reparation_demandee}
                <div class="bg-yellow-500/10 text-yellow-500 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 border border-yellow-500/20 animate-pulse">
                    <AlertTriangle size={14} /> 
                    Réparation en cours demandée
                </div>
            {/if}

            {#if item.restrictions_gare || item.remarque_rampe}
                <div class="text-xs text-gray-400 bg-black/40 p-3 rounded-xl border border-white/5 leading-relaxed relative pl-8">
                    <Info size={14} class="absolute top-3 left-2.5 text-gray-600" />
                    {item.restrictions_gare || item.remarque_rampe}
                </div>
            {/if}
          </div>

          <div class="p-4 bg-black/30 border-t border-white/5 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
             <button on:click={() => openModal(item)} class="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all" title="Modifier">
                <Pencil size={18} />
             </button>
             <button on:click={() => deleteEntry(item.id)} class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Supprimer">
                <Trash2 size={18} />
             </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if isModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
      <div 
        class="bg-[#0f1115] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10 ring-1 ring-white/5"
        transition:fly={{ y: 20, duration: 300 }}
      >
        <div class="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
          <h2 class="text-xl font-bold text-gray-200 flex items-center gap-3">
            {#if editingPmr.id} 
                <div class="p-1.5 bg-blue-500/20 rounded-lg"><PenTool size={18} class="text-blue-400"/></div>
                Modifier la fiche
            {:else}
                <div class="p-1.5 bg-green-500/20 rounded-lg"><Plus size={18} class="text-green-400"/></div>
                Nouvelle rampe PMR
            {/if} 
          </h2>
          <button on:click={closeModal} class="text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-white/5 transition-colors"><X size={20} /></button>
        </div>

        <div class="p-8 overflow-y-auto space-y-8 custom-scrollbar">
          
          <section>
            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_currentColor]"></div> Localisation
            </h3>
            <div class="grid grid-cols-3 gap-4">
              <div class="col-span-1"><label class={labelClass}>Zone</label><input type="text" bind:value={editingPmr.zone} class={inputClass} placeholder="FTY..." /></div>
              <div class="col-span-1"><label class={labelClass}>Code Gare</label><input type="text" bind:value={editingPmr.gare} class={inputClass} placeholder="ABC" /></div>
              <div class="col-span-1"><label class={labelClass}>Quai</label><input type="text" bind:value={editingPmr.quai} class={inputClass} placeholder="1" /></div>
            </div>
          </section>

          <hr class="border-white/10" />

          <section>
            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_5px_currentColor]"></div> Matériel & État
            </h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class={labelClass}>Type Assistance</label>
                <select bind:value={editingPmr.type_assistance} class={inputClass}>
                    <option value="N/A">Non défini</option><option value="3h">3h</option><option value="Full">Full</option><option value="Light">Light</option><option value="Taxi">Taxi</option>
                </select>
              </div>
              <div>
                <label class={labelClass}>État Rampe</label>
                <select bind:value={editingPmr.etat_rampe} class={inputClass}>
                    <option value="OK">Fonctionnelle (OK)</option><option value="HS">Hors Service (HS)</option><option value="En attente">En attente</option>
                </select>
              </div>
              <div><label class={labelClass}>ID Rampe</label><input type="text" bind:value={editingPmr.rampe_id} class={inputClass} placeholder="" /></div>
              <div><label class={labelClass}>Type Rampe</label><input type="text" bind:value={editingPmr.type_rampe} class={inputClass} placeholder="Stabag, Hercules..." /></div>
              <div><label class={labelClass}>Cadenas</label><input type="text" bind:value={editingPmr.cadenas} class={inputClass} placeholder="Type cadenas" /></div>
              <div><label class={labelClass}>Validité</label><input type="text" bind:value={editingPmr.validite} class={inputClass} placeholder="MM/YY" /></div>
            </div>
            
            <div class="mt-4 pt-2">
                <label class="flex items-center gap-3 p-3 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors bg-black/20">
                    <input type="checkbox" bind:checked={editingPmr.reparation_demandee} class="w-4 h-4 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-offset-gray-900" />
                    <span class="text-sm font-medium text-gray-300">Une réparation est demandée</span>
                </label>
            </div>
          </section>

          <hr class="border-white/10" />

          <section>
            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_5px_currentColor]"></div> Notes & Remarques
            </h3>
            <div class="space-y-4">
              <div>
                <label class={labelClass}>Remarque sur la rampe</label>
                <textarea rows="2" bind:value={editingPmr.remarque_rampe} class="{inputClass} resize-none"></textarea>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="{labelClass} text-rose-400/80">Restrictions Gare</label>
                    <textarea rows="2" bind:value={editingPmr.restrictions_gare} class="{inputClass} resize-none border-rose-500/20 focus:border-rose-500/50 bg-rose-500/5"></textarea>
                </div>
                <div>
                    <label class="{labelClass} text-blue-400/80">Infos Gare</label>
                    <textarea rows="2" bind:value={editingPmr.remarque_gare} class="{inputClass} resize-none border-blue-500/20 focus:border-blue-500/50 bg-blue-500/5"></textarea>
                </div>
              </div>
            </div>
          </section>
        </div>

      <div class="px-8 py-5 border-t border-white/10 bg-white/[0.02] flex justify-end gap-3 relative">
          <div class="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none"></div>

          <button 
            on:click={closeModal} 
            class="px-5 py-2.5 text-sm font-medium text-gray-300 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-300 backdrop-blur-md"
          >
            Annuler
          </button>

         <button 
  on:click={handleSave} 
  disabled={isSaving} 
  class="btn-save px-5 py-2.5 text-sm font-bold text-white border rounded-xl transition-all duration-300 backdrop-blur-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none group"
  style="--primary-rgb: var(--color-primary);"
>
  <Save size={18} class="group-hover:scale-110 transition-transform"/> 
  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
</button>
        </div>

      </div>
    </div>
  {/if}
</div>

<style>
  .btn-themed {
    /* Fond léger basé sur le thème (20% d'opacité) */
    background-color: rgba(var(--primary-rgb), 0.2);
    /* Bordure assortie (30% d'opacité) */
    border-color: rgba(var(--primary-rgb), 0.3);
    /* Texte à la couleur du thème */
    color: rgb(var(--primary-rgb));
  }

  .btn-themed:hover {
    /* Augmentation de l'opacité et lueur au survol */
    background-color: rgba(var(--primary-rgb), 0.3);
    border-color: rgba(var(--primary-rgb), 0.5);
    /* Lueur (glow) dynamique basée sur la couleur du thème */
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.4);
  }

  .btn-themed:active {
    transform: scale(0.95);
  }

  .btn-save {
    /* Utilisation de l'opacité 0.8 pour l'action principale */
    background-color: rgba(var(--primary-rgb), 0.8);
    /* Bordure basée sur le thème */
    border-color: rgba(var(--primary-rgb), 0.3);
    /* Lueur (glow) dynamique */
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);
  }

  .btn-save:hover:not(:disabled) {
    /* Augmentation de l'opacité et de la lueur au survol */
    background-color: rgba(var(--primary-rgb), 0.9);
    box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.5);
    transform: translateY(-1px);
  }

  .btn-save:active:not(:disabled) {
    transform: scale(0.98);
  }
</style>