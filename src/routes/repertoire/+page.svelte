<script>
    import { onMount } from 'svelte';
    import { fly, fade, slide } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    
    // Icons
    import { 
        Search, Contact, Phone, Mail, LayoutGrid, List, 
        ArrowDownAZ, ArrowDownZA, Plus, FileText, 
        Pencil, Trash2, ChevronDown, CheckSquare, Square, 
        Loader2, FolderOpen, UserX, Save, X, Filter, MapPin, Layers 
    } from 'lucide-svelte';

    // Libs
    import { supabase } from '$lib/supabase';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { RepertoireService } from '$lib/services/repertoire.service.js';

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let isLoading = $state(true);
    let isSaving = $state(false);

    // Données
    let allContacts = $state([]);
    let categories = $state([]);
    // Listes complètes disponibles
    let allZones = $state([]);
    let allGroups = $state([]);

    // Filtres
    let searchQuery = $state("");
    let selectedCategories = $state([]);
    let selectedZones = $state([]);
    let selectedGroups = $state([]);
    let sortOrder = $state('az'); 

    // Vue
    let viewMode = $state('grid');
    let openGroups = $state({}); 

    // Modal
    let isModalOpen = $state(false);
    let editingContact = $state(getInitialContact());

    // --- LOGIQUE METIER "ZONE vs GROUPE" ---
    // Si la catégorie est MIA ou BORNE PMR, on utilise les Zones. Sinon, les Groupes.
    let filterMode = $derived.by(() => {
        if (selectedCategories.length === 0) return 'none';
        const specialCats = ['MIA', 'BORNE PMR'];
        // Si une des catégories sélectionnées est spéciale, on passe en mode ZONE
        const hasSpecial = selectedCategories.some(c => specialCats.includes(c));
        return hasSpecial ? 'zone' : 'groupe';
    });

    // Listes filtrées à afficher (pour éviter d'afficher des zones/groupes vides)
    let visibleFilters = $derived.by(() => {
        // Contacts correspondant à la catégorie sélectionnée
        const currentContacts = selectedCategories.length > 0 
            ? allContacts.filter(c => selectedCategories.includes(c.categorie_principale))
            : []; // Si pas de cat, on n'affiche pas de sous-filtres

        if (filterMode === 'zone') {
            // Retourne les zones uniques présentes dans ces contacts
            return [...new Set(currentContacts.map(c => c.zone).filter(Boolean))].sort();
        } else if (filterMode === 'groupe') {
            // Retourne les groupes uniques
            return [...new Set(currentContacts.map(c => c.groupe).filter(Boolean))].sort();
        }
        return [];
    });

    // --- FILTRAGE FINAL ---
    let filteredContacts = $derived.by(() => {
        let res = allContacts.filter(c => {
            // 1. Recherche Texte
            const q = searchQuery.toLowerCase().trim();
            const searchMatch = !q || 
                (c.nom && c.nom.toLowerCase().includes(q)) ||
                (c.tel && c.tel.includes(q)) ||
                (c.email && c.email.toLowerCase().includes(q)) ||
                (c.groupe && c.groupe.toLowerCase().includes(q));
            
            // 2. Filtre Catégorie
            const catMatch = selectedCategories.length === 0 || selectedCategories.includes(c.categorie_principale);
            
            // 3. Filtre Contextuel (Zone OU Groupe)
            let subMatch = true;
            if (selectedCategories.length > 0) {
                if (filterMode === 'zone' && selectedZones.length > 0) {
                    subMatch = selectedZones.includes(c.zone);
                } else if (filterMode === 'groupe' && selectedGroups.length > 0) {
                    subMatch = selectedGroups.includes(c.groupe);
                }
            }

            return searchMatch && catMatch && subMatch;
        });

        // Tri
        res.sort((a, b) => {
            const valA = (a.nom || '').toLowerCase();
            const valB = (b.nom || '').toLowerCase();
            return sortOrder === 'az' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        return res;
    });

    // Groupement (pour l'affichage en mode liste)
    let groupedContacts = $derived.by(() => {
        const groups = {};
        filteredContacts.forEach(c => {
            // Si on filtre déjà par groupe, grouper par groupe est redondant -> On peut grouper par Zone ou Première lettre
            // Mais gardons la logique simple: Grouper par "Groupe" (s'il existe) ou "Autre"
            const g = c.groupe || 'Autre';
            if (!groups[g]) groups[g] = [];
            groups[g].push(c);
        });
        return groups;
    });

    // --- INIT ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.REPERTOIRE_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        const savedView = localStorage.getItem('baco-repertoire-view');
        if (savedView) viewMode = savedView;

        await loadData();
    });

    async function loadData() {
        isLoading = true;
        try {
            allContacts = await RepertoireService.loadContacts();
            const { categories: c, zones: z, groupes: g } = RepertoireService.extractFilters(allContacts);
            categories = c;
            allZones = z;
            allGroups = g;
        } catch(e) {
            toast.error("Erreur chargement données");
        } finally {
            isLoading = false;
        }
    }

    // --- ACTIONS ---

    function setView(mode) {
        viewMode = mode;
        try { localStorage.setItem('baco-repertoire-view', mode); } catch(e) {}
    }

    function toggleCategory(cat) {
        if (selectedCategories.includes(cat)) {
            selectedCategories = selectedCategories.filter(c => c !== cat);
            // Reset sous-filtres si on désélectionne tout ou si on change de mode implicitement
            if (selectedCategories.length === 0) {
                selectedZones = [];
                selectedGroups = [];
            }
        } else {
            selectedCategories = [...selectedCategories, cat];
            // Reset pour éviter des filtres fantômes incohérents
            selectedZones = [];
            selectedGroups = [];
        }
    }

    function toggleSubFilter(val) {
        if (filterMode === 'zone') {
            selectedZones = selectedZones.includes(val) 
                ? selectedZones.filter(z => z !== val) 
                : [...selectedZones, val];
        } else {
            selectedGroups = selectedGroups.includes(val) 
                ? selectedGroups.filter(g => g !== val) 
                : [...selectedGroups, val];
        }
    }

    function toggleGroupAccordion(groupName) {
        openGroups[groupName] = !openGroups[groupName];
    }

    function openModal(contact = null) {
        if (!hasPermission(currentUser, ACTIONS.REPERTOIRE_WRITE)) return;
        editingContact = contact ? { ...contact } : getInitialContact();
        isModalOpen = true;
    }

    async function handleSave() {
        if (!editingContact.nom) return toast.warning("Nom requis");
        isSaving = true;
        try {
            await RepertoireService.saveContact(editingContact);
            toast.success(editingContact.id ? "Modifié" : "Créé");
            isModalOpen = false;
            await loadData(); 
        } catch(e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSaving = false;
        }
    }

    function handleDelete(contact) {
        if (!hasPermission(currentUser, ACTIONS.REPERTOIRE_DELETE)) return;
        openConfirmModal(`Supprimer ${contact.nom} ?`, async () => {
            try {
                await RepertoireService.deleteContact(contact.id);
                toast.success("Supprimé");
                await loadData();
            } catch(e) {
                toast.error("Erreur suppression");
            }
        });
    }

    function handleExport(type) {
        if (filteredContacts.length === 0) return toast.warning("Rien à exporter");
        RepertoireService.exportData(filteredContacts, type);
    }

    // --- HELPERS ---
    function getInitialContact() {
        return { id: null, nom: '', tel: '', email: '', categorie_principale: '', zone: '', groupe: '' };
    }

    const cleanPhone = (tel) => tel ? tel.replace(/[^0-9]/g, '') : '';
    const formatPhone = (tel) => {
        if(!tel) return '';
        const cleaned = cleanPhone(tel);
        return cleaned.length >= 10 ? cleaned.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1/$2.$3.$4') : tel;
    };

    const inputClass = "block w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none";
    const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";

</script>

<svelte:head>
  <title>Répertoire | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-blue-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
              <Contact size={32} />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire</h1>
              <p class="text-gray-500 text-sm mt-1">Annuaire centralisé des contacts.</p>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <div class="hidden md:flex bg-black/20 rounded-xl p-1 border border-white/5">
                <button onclick={() => setView('grid')} class="p-2 rounded-lg transition-all {viewMode === 'grid' ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}"><LayoutGrid size={18} /></button>
                <button onclick={() => setView('list')} class="p-2 rounded-lg transition-all {viewMode === 'list' ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}"><List size={18} /></button>
            </div>
            <button onclick={() => handleExport('pdf')} class="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all shadow-lg" title="PDF"><FileText size={20} /></button>
            {#if hasPermission(currentUser, ACTIONS.REPERTOIRE_WRITE)}
                <button onclick={() => openModal()} class="px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold shadow-lg hover:scale-105">
                  <Plus size={20} /> <span class="hidden sm:inline">Ajouter</span>
                </button>
            {/if}
        </div>
      </header>

      <div class="flex flex-col md:flex-row gap-4" in:fly={{ y: 20, delay: 100 }}>
        <div class="relative flex-grow group">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
            <input type="text" bind:value={searchQuery} placeholder="Rechercher..." class="block w-full pl-10 pr-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all placeholder-gray-600" />
        </div>
        <div class="flex rounded-xl shadow-sm border border-white/10 bg-black/20 overflow-hidden shrink-0">
            <button onclick={() => sortOrder = 'az'} class="px-4 py-2 flex items-center gap-2 border-r border-white/5 transition-colors {sortOrder === 'az' ? 'bg-blue-500/10 text-blue-400' : 'text-gray-500 hover:text-gray-300'}"><ArrowDownAZ size={16}/> A-Z</button>
            <button onclick={() => sortOrder = 'za'} class="px-4 py-2 flex items-center gap-2 transition-colors {sortOrder === 'za' ? 'bg-blue-500/10 text-blue-400' : 'text-gray-500 hover:text-gray-300'}"><ArrowDownZA size={16}/> Z-A</button>
        </div>
      </div>

      <div class="bg-black/20 border border-white/5 rounded-2xl p-5 space-y-5" in:fly={{ y: 20, delay: 200 }}>
        <div>
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Filter size={12}/> Catégories</h3>
            <div class="flex flex-wrap gap-2">
                {#each categories as cat}
                    <button 
                        onclick={() => toggleCategory(cat)}
                        class="flex items-center space-x-2 px-3 py-1.5 border rounded-lg text-xs font-bold uppercase transition-all {selectedCategories.includes(cat) ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.15)]' : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'}"
                    >
                        {#if selectedCategories.includes(cat)}<CheckSquare size={12} />{:else}<Square size={12} />{/if}
                        <span>{cat}</span>
                    </button>
                {/each}
            </div>
        </div>

        {#if selectedCategories.length > 0 && visibleFilters.length > 0}
            <div in:slide>
                <div class="h-px bg-white/5 w-full mb-4"></div>
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    {#if filterMode === 'zone'}
                        <MapPin size={12}/> Zones
                    {:else}
                        <Layers size={12}/> Sous-catégories
                    {/if}
                </h3>
                
                <div class="flex flex-wrap gap-2">
                    {#each visibleFilters as filterItem}
                        <button 
                            onclick={() => toggleSubFilter(filterItem)}
                            class="flex items-center space-x-2 px-3 py-1.5 border rounded-lg text-xs font-bold uppercase transition-all 
                            { (filterMode === 'zone' ? selectedZones.includes(filterItem) : selectedGroups.includes(filterItem))
                                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' 
                                : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10' }"
                        >
                            {#if (filterMode === 'zone' ? selectedZones.includes(filterItem) : selectedGroups.includes(filterItem))}
                                <CheckSquare size={12} />
                            {:else}
                                <Square size={12} />
                            {/if}
                            <span>{filterItem}</span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
      </div>

      <div class="min-h-[300px]">
        {#if isLoading}
            <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-blue-500/50"/></div>
        {:else if filteredContacts.length === 0}
            <div class="text-center py-24 bg-black/20 rounded-3xl border border-dashed border-white/10">
                <UserX class="w-12 h-12 mx-auto text-gray-600 mb-4" />
                <p class="text-gray-400 font-medium">Aucun contact trouvé.</p>
            </div>
        {:else}
            <div class="{viewMode === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start'}" in:fade>
                {#each Object.keys(groupedContacts).sort() as group}
                    <div class="bg-black/20 rounded-2xl shadow-sm border border-white/5 overflow-hidden">
                        <button 
                            onclick={() => viewMode === 'grid' && toggleGroupAccordion(group)}
                            class="w-full flex justify-between items-center p-4 bg-white/[0.02] border-b border-white/5 text-left hover:bg-white/5 transition-colors"
                        >
                            <h3 class="font-bold text-gray-200 flex items-center gap-2">
                               <FolderOpen class="w-4 h-4 text-blue-400" /> {group} 
                               <span class="text-xs text-gray-500 font-normal px-2 py-0.5 bg-white/5 rounded-full">
                                   {groupedContacts[group].length}
                               </span>
                            </h3>
                            {#if viewMode === 'grid'}
                                <ChevronDown class="w-4 h-4 text-gray-500 transition-transform {openGroups[group] ? 'rotate-180' : ''}" />
                            {/if}
                        </button>

                        {#if viewMode === 'list' || openGroups[group]}
                            <div class="divide-y divide-white/5" transition:slide>
                                {#each groupedContacts[group] as contact}
                                    <div class="p-4 hover:bg-white/5 flex items-center justify-between group/item transition-colors">
                                        <div class="min-w-0 pr-4">
                                            <div class="font-bold text-gray-300 truncate text-sm flex items-center gap-2">
                                                {contact.nom}
                                                {#if contact.zone}<span class="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 rounded">{contact.zone}</span>{/if}
                                            </div>
                                            <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                                                {#if contact.tel}
                                                    <a href="etrali:{cleanPhone(contact.tel)}" class="flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20">
                                                        <Phone size={12} /> {formatPhone(contact.tel)}
                                                    </a>
                                                {/if}
                                                {#if contact.email}
                                                    <a href="mailto:{contact.email}" class="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 truncate">
                                                        <Mail size={12} /> {contact.email}
                                                    </a>
                                                {/if}
                                            </div>
                                        </div>
                                        <div class="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                            {#if hasPermission(currentUser, ACTIONS.REPERTOIRE_WRITE)}
                                                <button onclick={() => openModal(contact)} class="p-1.5 bg-white/5 rounded-lg text-gray-400 hover:text-blue-400 transition-colors"><Pencil size={14} /></button>
                                            {/if}
                                            {#if hasPermission(currentUser, ACTIONS.REPERTOIRE_DELETE)}
                                                <button onclick={() => handleDelete(contact)} class="p-1.5 bg-white/5 rounded-lg text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                                            {/if}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
      </div>

      {#if isModalOpen}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
          <div class="bg-[#1a1d24] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden" transition:fly={{ y: 20 }}>
            <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/[0.02]">
                <h3 class="text-xl font-bold text-gray-200">{editingContact.id ? 'Modifier' : 'Ajouter'} contact</h3>
                <button onclick={() => isModalOpen = false} class="text-gray-500 hover:text-white p-1 rounded hover:bg-white/10"><X size={20}/></button>
            </div>
            <div class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2"><label class={labelClass}>Nom</label><input bind:value={editingContact.nom} class={inputClass} placeholder="Nom du contact" /></div>
                    <div><label class={labelClass}>Téléphone</label><input bind:value={editingContact.tel} class={inputClass} placeholder="0470..." /></div>
                    <div><label class={labelClass}>Email</label><input bind:value={editingContact.email} class={inputClass} placeholder="@sncb.be" /></div>
                    <div>
                        <label class={labelClass}>Catégorie</label>
                        <input list="cat-list" bind:value={editingContact.categorie_principale} class={inputClass} placeholder="Ex: Gares" />
                        <datalist id="cat-list">{#each categories as c}<option value={c}/>{/each}</datalist>
                    </div>
                    <div>
                        <label class={labelClass}>Zone (Optionnel)</label>
                        <input list="zone-list" bind:value={editingContact.zone} class={inputClass} placeholder="Ex: Mons" />
                        <datalist id="zone-list">{#each allZones as z}<option value={z}/>{/each}</datalist>
                    </div>
                    <div class="col-span-2"><label class={labelClass}>Groupe (Sous-catégorie)</label><input bind:value={editingContact.groupe} class={inputClass} placeholder="Ex: Chefs de gare" /></div>
                </div>
            </div>
            <div class="px-6 py-4 bg-white/[0.02] border-t border-white/10 flex justify-end gap-3">
                <button onclick={() => isModalOpen = false} class="px-4 py-2 text-gray-400 hover:text-white transition-colors">Annuler</button>
                <button onclick={handleSave} disabled={isSaving} class="px-6 py-2 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 shadow-lg disabled:opacity-50">
                    {#if isSaving}<Loader2 class="w-4 h-4 animate-spin"/>{:else}<Save class="w-4 h-4"/>{/if} Enregistrer
                </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
{/if}