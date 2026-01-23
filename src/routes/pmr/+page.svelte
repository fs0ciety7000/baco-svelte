<script>
    import { onMount } from 'svelte';
    import { fly, fade, scale } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { 
        Plus, Search, Filter, MapPin, AlertTriangle, X, Save, Trash2, 
        Pencil, PenTool, Accessibility, Train, Info, Loader2, RefreshCw, CheckCircle2 
    } from 'lucide-svelte';

    // Libs
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { PmrService } from '$lib/services/pmr.service.js';
    import { openConfirmModal } from '$lib/stores/modal.js';

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let isLoading = $state(true);
    let isSaving = $state(false);
    
    // Données
    let pmrs = $state([]);
    
    // Filtres
    let filters = $state({ search: "", zone: "all", etat: "all", type: "all" });
    
    // Modal
    let isModalOpen = $state(false);
    let editingPmr = $state(getInitialPmr());

    // --- CONSTANTES ---
    const STATUS_COLORS = {
        'OK': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
        'HS': 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.15)] animate-pulse',
        'En attente': 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    };

    // --- INIT ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.PMR_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        await loadData();
    });

    async function loadData() {
        isLoading = true;
        try {
            pmrs = await PmrService.loadPmrData(filters);
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement données");
        } finally {
            isLoading = false;
        }
    }

    // --- HELPERS ---
    function getInitialPmr() {
        return { 
            id: null, gare: "", quai: "", zone: "", 
            type_assistance: "N/A", type_rampe: "", rampe_id: "", 
            etat_rampe: "OK", validite: "", cadenas: "", 
            reparation_demandee: false, remarque_rampe: "", 
            restrictions_gare: "", remarque_gare: "" 
        };
    }

    function getBadgeClass(status) { 
        return STATUS_COLORS[status] || 'bg-white/5 text-gray-400 border-white/10'; 
    }

    // --- ACTIONS ---
    function openModal(entry = null) {
        if (!hasPermission(currentUser, ACTIONS.PMR_WRITE)) return;
        
        if (entry) {
            // Copie profonde pour éviter de modifier la liste en direct avant save
            editingPmr = { 
                ...entry, 
                type_assistance: entry.type_assistance || 'N/A', 
                etat_rampe: entry.etat_rampe || 'OK' 
            };
        } else {
            editingPmr = getInitialPmr();
        }
        isModalOpen = true;
    }

    async function handleSave() {
        if (!hasPermission(currentUser, ACTIONS.PMR_WRITE)) return toast.error("Non autorisé");
        if (!editingPmr.gare) return toast.warning("Code Gare requis");

        isSaving = true;
        try {
            await PmrService.savePmr(editingPmr);
            toast.success(editingPmr.id ? "Modifié !" : "Ajouté !");
            isModalOpen = false;
            await loadData();
        } catch(e) {
            toast.error("Erreur sauvegarde: " + e.message);
        } finally {
            isSaving = false;
        }
    }

    function handleDelete(id) {
        if (!hasPermission(currentUser, ACTIONS.PMR_DELETE)) return toast.error("Non autorisé");
        
        openConfirmModal("Supprimer cet équipement ?", async () => {
            try {
                await PmrService.deletePmr(id);
                toast.success("Supprimé");
                await loadData();
            } catch(e) {
                toast.error("Erreur suppression");
            }
        });
    }

    // --- CSS CLASSES ---
    const labelClass = "block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider";
    const inputClass = "block w-full rounded-xl border border-white/10 bg-black/40 p-2.5 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none";

</script>

<svelte:head>
  <title>PMR & Rampes | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-blue-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
              <Accessibility class="w-8 h-8" />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">PMR & Rampes</h1>
              <p class="text-gray-500 text-sm mt-1">Inventaire des équipements et accessibilité.</p>
            </div>
        </div>
        
        {#if hasPermission(currentUser, ACTIONS.PMR_WRITE)}
            <button onclick={() => openModal()} class="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all hover:scale-105">
                <Plus class="w-5 h-5" /> 
                <span class="hidden sm:inline">Ajouter</span>
            </button>
        {/if}
      </header>

      <div class="bg-black/20 border border-white/5 rounded-2xl p-5" in:fly={{ y: 20, delay: 100 }}>
        <div class="flex flex-col md:flex-row gap-4 items-end">
            <div class="flex-grow w-full md:w-auto relative group">
                <label class={labelClass}>Recherche Rapide</label>
                <div class="relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors"/>
                    <input 
                        type="text" 
                        bind:value={filters.search} 
                        oninput={() => loadData()} 
                        placeholder="Gare, quai, n° rampe..." 
                        class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-gray-200 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all" 
                    />
                </div>
            </div>

            {#each [
                { label: 'Zone', val: 'zone', opts: ['FTY', 'FMS', 'FCR'] }, 
                { label: 'État', val: 'etat', opts: ['OK', 'HS', 'En attente'] }, 
                { label: 'Type', val: 'type', opts: ['Full', 'Light', 'Taxi'] }
            ] as f}
                <div class="w-full md:w-40">
                    <label class={labelClass}>{f.label}</label>
                    <div class="relative">
                        <select bind:value={filters[f.val]} onchange={() => loadData()} class="w-full pl-3 pr-8 py-2.5 bg-black/40 border border-white/10 rounded-xl text-gray-300 appearance-none focus:ring-2 focus:ring-blue-500/30 outline-none cursor-pointer text-sm font-medium">
                            <option value="all">Tous</option>
                            {#each f.opts as opt}<option value={opt}>{opt}</option>{/each}
                        </select>
                        <Filter class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                    </div>
                </div>
            {/each}
            
            <button onclick={() => loadData()} class="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                <RefreshCw class="w-5 h-5 {isLoading ? 'animate-spin' : ''}" />
            </button>
        </div>
      </div>

      {#if isLoading && pmrs.length === 0}
        <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-blue-500/50" /></div>
      {:else if pmrs.length === 0}
        <div class="text-center py-20 bg-black/20 rounded-2xl border border-dashed border-white/10">
          <p class="text-gray-500">Aucun équipement trouvé.</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" in:fly={{ y: 20 }}>
          {#each pmrs as item (item.id)}
            <div class="group bg-black/20 rounded-2xl border border-white/5 hover:border-blue-500/30 p-0 hover:shadow-xl hover:shadow-black/50 transition-all duration-300 relative flex flex-col hover:-translate-y-1 overflow-hidden">
              
              <div class="p-5 border-b border-white/5 bg-white/[0.02] flex justify-between items-start">
                <div>
                   <h3 class="text-xl font-bold text-gray-200 flex items-center gap-2">
                    {item.gare}
                    {#if item.zone}
                        <span class="text-[9px] font-black px-2 py-0.5 rounded border border-white/10 bg-white/5 text-gray-500 uppercase tracking-wider">{item.zone}</span>
                    {/if}
                  </h3>
                  <div class="flex items-center gap-2 mt-1">
                      <span class="flex items-center gap-1 text-xs font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                        <Train size={12} /> Quai {item.quai || '?'}
                      </span>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wide {getBadgeClass(item.etat_rampe)}">
                    {item.etat_rampe || 'N/A'}
                </span>
              </div>

              <div class="p-5 space-y-4 flex-grow">
                
                <div class="grid grid-cols-2 gap-3 text-xs">
                    {#if item.rampe_id}
                        <div class="bg-black/40 p-2 rounded-lg border border-white/5">
                            <span class="block text-[9px] font-bold text-gray-600 uppercase mb-0.5">ID Rampe</span>
                            <span class="font-mono text-gray-300 tracking-wide">{item.rampe_id}</span>
                        </div>
                    {/if}
                    {#if item.type_assistance && item.type_assistance !== 'N/A'}
                        <div class="bg-black/40 p-2 rounded-lg border border-white/5">
                            <span class="block text-[9px] font-bold text-gray-600 uppercase mb-0.5">Assistance</span>
                            <span class="font-bold text-blue-300">{item.type_assistance}</span>
                        </div>
                    {/if}
                </div>

                {#if item.reparation_demandee}
                    <div class="bg-yellow-500/10 text-yellow-500 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-yellow-500/20 animate-pulse">
                        <AlertTriangle size={14} /> 
                        Réparation demandée
                    </div>
                {/if}

                {#if item.restrictions_gare || item.remarque_rampe}
                    <div class="text-xs text-gray-400 bg-white/5 p-3 rounded-xl border border-white/5 leading-relaxed relative pl-8">
                        <Info size={14} class="absolute top-3 left-2.5 text-blue-500/50" />
                        {item.restrictions_gare || item.remarque_rampe}
                    </div>
                {/if}
              </div>

              <div class="p-3 bg-black/40 border-t border-white/5 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 {#if hasPermission(currentUser, ACTIONS.PMR_WRITE)}
                     <button onclick={() => openModal(item)} class="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all border border-transparent hover:border-blue-500/20" title="Modifier">
                        <Pencil size={16} />
                     </button>
                 {/if}
                 {#if hasPermission(currentUser, ACTIONS.PMR_DELETE)}
                     <button onclick={() => handleDelete(item.id)} class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all border border-transparent hover:border-red-500/20" title="Supprimer">
                        <Trash2 size={16} />
                     </button>
                 {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if isModalOpen}
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
            <div class="bg-[#1a1d24] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10" transition:fly={{ y: 20 }}>
                
                <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/[0.02]">
                    <h3 class="text-lg font-bold text-gray-200 flex items-center gap-3">
                        {#if editingPmr.id} 
                            <div class="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 text-blue-400"><PenTool size={18}/></div> Modifier
                        {:else}
                            <div class="p-2 bg-green-500/10 rounded-lg border border-green-500/20 text-green-400"><Plus size={18}/></div> Nouveau
                        {/if} 
                    </h3>
                    <button onclick={() => isModalOpen = false} class="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"><X size={20} /></button>
                </div>

                <div class="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                    
                    <section>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-blue-400 mb-4 flex items-center gap-2">
                            <MapPin size={14} /> Localisation
                        </h4>
                        <div class="grid grid-cols-3 gap-4">
                            <div class="col-span-1"><label class={labelClass}>Zone</label><input type="text" bind:value={editingPmr.zone} class={inputClass} placeholder="FTY..." /></div>
                            <div class="col-span-1"><label class={labelClass}>Code Gare</label><input type="text" bind:value={editingPmr.gare} class={inputClass} placeholder="ABC" /></div>
                            <div class="col-span-1"><label class={labelClass}>Quai</label><input type="text" bind:value={editingPmr.quai} class={inputClass} placeholder="1" /></div>
                        </div>
                    </section>

                    <div class="h-px bg-white/5 w-full"></div>

                    <section>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-orange-400 mb-4 flex items-center gap-2">
                            <Accessibility size={14} /> Matériel & État
                        </h4>
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
                            <div><label class={labelClass}>ID Rampe</label><input type="text" bind:value={editingPmr.rampe_id} class={inputClass} placeholder="R-123..." /></div>
                            <div><label class={labelClass}>Type Rampe</label><input type="text" bind:value={editingPmr.type_rampe} class={inputClass} placeholder="Stabag, Hercules..." /></div>
                            <div><label class={labelClass}>Cadenas</label><input type="text" bind:value={editingPmr.cadenas} class={inputClass} placeholder="Type cadenas" /></div>
                            <div><label class={labelClass}>Validité</label><input type="text" bind:value={editingPmr.validite} class={inputClass} placeholder="MM/YY" /></div>
                        </div>
                        
                        <div class="mt-4">
                            <label class="flex items-center gap-3 p-3 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors bg-black/20 group">
                                <input type="checkbox" bind:checked={editingPmr.reparation_demandee} class="w-4 h-4 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-offset-gray-900" />
                                <span class="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Une réparation est demandée pour cet équipement</span>
                            </label>
                        </div>
                    </section>

                    <div class="h-px bg-white/5 w-full"></div>

                    <section>
                        <h4 class="text-xs font-bold uppercase tracking-wider text-purple-400 mb-4 flex items-center gap-2">
                            <Info size={14} /> Notes & Remarques
                        </h4>
                        <div class="space-y-4">
                            <div>
                                <label class={labelClass}>Remarque Rampe</label>
                                <textarea rows="2" bind:value={editingPmr.remarque_rampe} class="{inputClass} resize-none"></textarea>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="{labelClass} text-rose-400">Restrictions Gare</label>
                                    <textarea rows="2" bind:value={editingPmr.restrictions_gare} class="{inputClass} resize-none border-rose-500/20 focus:border-rose-500/50 bg-rose-500/5"></textarea>
                                </div>
                                <div>
                                    <label class="{labelClass} text-blue-400">Infos Générales</label>
                                    <textarea rows="2" bind:value={editingPmr.remarque_gare} class="{inputClass} resize-none border-blue-500/20 focus:border-blue-500/50 bg-blue-500/5"></textarea>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div class="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end gap-3">
                    <button onclick={() => isModalOpen = false} class="px-5 py-2.5 text-sm font-medium text-gray-400 border border-white/10 rounded-xl hover:bg-white/5 hover:text-white transition-all">Annuler</button>
                    <button 
                        onclick={handleSave} 
                        disabled={isSaving} 
                        class="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 border border-blue-500/30 rounded-xl flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {#if isSaving}<Loader2 size={16} class="animate-spin" />{:else}<Save size={16}/>{/if} Enregistrer
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}