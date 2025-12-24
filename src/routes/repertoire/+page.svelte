<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { page } from '$app/stores'; // IMPORT AJOUTÉ
  import { fly, fade, slide } from 'svelte/transition';
  import { 
    Search, User, Phone, Mail, LayoutGrid, List, 
    ArrowDownAZ, ArrowDownZA, Plus, FileText, 
    Pencil, Trash2, ChevronDown, CheckSquare, Square, 
    Loader2, FolderOpen, UserX, Contact, Save, X 
  } from 'lucide-svelte';
  
  import jsPDF from 'jspdf';
  import autoTable from 'jspdf-autotable';
  import * as XLSX from 'xlsx';

  // IMPORT TOAST
  import { toast } from '$lib/stores/toast.js';

  // --- ÉTATS ---
  let user = null;
  let isAdmin = false;

  // Données
  let allContacts = [];
  let displayedContacts = {}; // { "Groupe A": [c1, c2], "Groupe B": [] }
  let categories = [];
  let zones = [];
  
  // Filtres
  let selectedCategories = [];
  let selectedZones = [];
  let searchTerm = "";
  let sortOrder = 'az'; // 'az' ou 'za'
  let viewMode = 'grid'; // 'grid' ou 'list'
  let rawContactData = [];

  // UI
  let loading = false;
  let loadingCategories = true;
  let showZoneFilters = false;
  
  // Modale
  let showModal = false;
  let modalLoading = false;
  let isEditMode = false;
  let modalForm = {
    id: null,
    nom: '',
    tel: '',
    email: '',
    categorie: '',
    zone: '',
    groupe: ''
  };


  // Groupes ouverts
  let openGroups = {};

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;
    if (user) {
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      isAdmin = data?.role === 'admin';
    }
    
    if (localStorage.getItem('baco-repertoire-view')) {
        viewMode = localStorage.getItem('baco-repertoire-view');
    }

    await loadCategories();
  });

  // --- LOGIQUE URL (GLOBAL SEARCH) ---
  // Si on arrive avec ?search=..., on applique le filtre
  $: {
      const q = $page.url.searchParams.get('search');
      if (q && q !== searchTerm) {
          searchTerm = q;
          // On force le chargement, même si aucune catégorie n'est sélectionnée
          // (car loadContacts se déclenche via la réactivité de searchTerm plus bas)
      }
  }

  // --- LOGIQUE DE CHARGEMENT ---

 async function loadCategories() {
    loadingCategories = true;
    
    // On récupère les couples Categorie/Zone existants
    const { data } = await supabase.from('contacts_repertoire').select('categorie_principale, zone');
    
    if (data) {
      rawContactData = data; // On garde ces données en mémoire pour le filtrage dynamique
      categories = [...new Set(data.map(i => i.categorie_principale))].filter(Boolean).sort();
    }
    
    loadingCategories = false;
    
    // On force une mise à jour des filtres au cas où
    handleCategoryChange();
  }

  $: if (selectedCategories) handleCategoryChange();
  
  // MODIF : On déclenche le chargement aussi si searchTerm change
  $: if (selectedCategories || selectedZones || searchTerm || sortOrder) loadContacts();


function handleCategoryChange() {
    if (selectedCategories.length === 0) {
        showZoneFilters = false;
        zones = [];
        selectedZones = []; 
        return;
    }

    // On cherche toutes les zones qui appartiennent aux catégories sélectionnées
    const availableZones = rawContactData
        .filter(d => selectedCategories.includes(d.categorie_principale) && d.zone)
        .map(d => d.zone);
        
    // On dédoublonne et on trie
    const distinctZones = [...new Set(availableZones)].sort();

    if (distinctZones.length > 0) {
        showZoneFilters = true;
        zones = distinctZones;
        // On décoche les zones qui ne sont plus pertinentes (ex: si on décoche MIA, on décoche FMS)
        selectedZones = selectedZones.filter(z => zones.includes(z));
    } else {
        showZoneFilters = false;
        zones = [];
        selectedZones = [];
    }
  }
 

async function loadContacts() {
    // MODIF : Si pas de catégorie ET pas de recherche, on vide tout (écran d'accueil vide)
    if (selectedCategories.length === 0 && !searchTerm) {
        displayedContacts = {};
        return;
    }

    loading = true;
    let query = supabase
        .from('contacts_repertoire')
        .select('*')
        .order('nom', { ascending: sortOrder === 'az' });

    const orFilters = [];

    // Pour chaque catégorie sélectionnée, on construit son filtre spécifique
    if (selectedCategories.length > 0) {
        selectedCategories.forEach(cat => {
            // Quelles sont les zones valides pour CETTE catégorie dans la base ?
            const validZonesForCat = rawContactData
            .filter(d => d.categorie_principale === cat && d.zone)
            .map(d => d.zone);

            // Parmi les zones cochées par l'utilisateur, lesquelles s'appliquent à CETTE catégorie ?
            const appliedZones = selectedZones.filter(z => validZonesForCat.includes(z));

            if (appliedZones.length > 0) {
                // Si l'utilisateur a coché des zones spécifiques à cette catégorie, on filtre
                // Exemple : (Categorie = MIA AND Zone IN (FMS, FTY))
                orFilters.push(`and(categorie_principale.eq.${cat},zone.in.(${appliedZones.join(',')}))`);
            } else {
                // Sinon, on prend tout pour cette catégorie
                orFilters.push(`categorie_principale.eq.${cat}`);
            }
        });
    }

    // Appliquer les filtres de catégorie/zone si présents
    if (orFilters.length > 0) {
        // Si on a aussi une recherche texte, on doit combiner : (Filtres Catégorie) AND (Recherche Texte)
        // Supabase .or() s'applique au niveau racine.
        // Si on veut faire (A OR B) AND (C OR D), c'est complexe avec l'API JS simple.
        // Solution simple : On applique d'abord le filtre OR des catégories.
        query = query.or(orFilters.join(','));
    }
    
    // Ensuite on applique la recherche texte par dessus (c'est un AND implicite)
    if (searchTerm) {
      query = query.or(`nom.ilike.%${searchTerm}%,tel.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,groupe.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) { console.error(error); loading = false; return; }

    const groups = {};
    (data || []).forEach(c => {
        const g = c.groupe || 'Autre';
        if (!groups[g]) {
            groups[g] = [];
            openGroups[g] = true;
        }
        groups[g].push(c);
    });
    displayedContacts = groups;
    loading = false;
  }

  // --- UI HELPERS ---

  function toggleCategory(cat) {
    if (selectedCategories.includes(cat)) {
        selectedCategories = selectedCategories.filter(c => c !== cat);
    } else {
        selectedCategories = [...selectedCategories, cat];
    }
  }

  function toggleZone(zone) {
    if (selectedZones.includes(zone)) {
        selectedZones = selectedZones.filter(z => z !== zone);
    } else {
        selectedZones = [...selectedZones, zone];
    }
  }

  function switchView(mode) {
    viewMode = mode;
    localStorage.setItem('baco-repertoire-view', mode);
  }

  function toggleGroupAccordion(groupName) {
    openGroups[groupName] = !openGroups[groupName];
  }

  const cleanPhone = (tel) => tel ? tel.replace(/[^0-9]/g, '') : '';
  const formatPhone = (tel) => {
      if(!tel) return '';
      const cleaned = cleanPhone(tel);
      if (cleaned.length >= 10) {
          return cleaned.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1/$2.$3.$4'); 
      }
      return tel;
  };

  // --- MODALE ---

  function openModal(contact = null) {
    isEditMode = !!contact;
    modalForm = {
      id: contact?.id || null,
      nom: contact?.nom || '',
      tel: contact?.tel || '',
      email: contact?.email || '',
      categorie: contact?.categorie_principale || '',
      zone: contact?.zone || '',
      groupe: contact?.groupe || ''
    };
    showModal = true;
  }

  async function handleSubmit() {
    modalLoading = true;
    const payload = {
      nom: modalForm.nom,
      tel: modalForm.tel,
      email: modalForm.email || null,
      categorie_principale: modalForm.categorie,
      zone: modalForm.zone || null,
      groupe: modalForm.groupe
    };

    let error;
    if (isEditMode) {
      const res = await supabase.from('contacts_repertoire').update(payload).eq('id', modalForm.id);
      error = res.error;
    } else {
      const res = await supabase.from('contacts_repertoire').insert([payload]);
      error = res.error;
    }

    modalLoading = false;
    if (error) {
        toast.error("Erreur: " + error.message);
    } else {
      toast.success(isEditMode ? "Contact modifié avec succès !" : "Contact ajouté avec succès !");
      showModal = false;
      loadContacts();
    }
  }

  async function deleteContact(id) {
    if(!confirm("Supprimer ce contact ?")) return;
    const { error } = await supabase.from('contacts_repertoire').delete().eq('id', id);
    
    if (error) {
        toast.error("Erreur lors de la suppression.");
    } else {
        toast.success("Contact supprimé.");
        loadContacts();
    }
  }

  // --- EXPORT ---
  function exportData(type) {
    const flatData = Object.values(displayedContacts).flat().map(c => ({
        "Nom": c.nom,
        "Groupe": c.groupe,
        "Téléphone": formatPhone(c.tel),
        "Email": c.email || '',
        "Catégorie": c.categorie_principale,
        "Zone": c.zone || ''
    }));

    if (flatData.length === 0) return toast.warning("Rien à exporter.");

    try {
        if (type === 'xlsx') {
            const ws = XLSX.utils.json_to_sheet(flatData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Repertoire");
            XLSX.writeFile(wb, "repertoire.xlsx");
        } else {
            const doc = new jsPDF();
            doc.text("Répertoire Téléphonique", 14, 15);
            autoTable(doc, {
                startY: 25,
                head: [['Nom', 'Groupe', 'Tel', 'Email', 'Cat', 'Zone']],
                body: flatData.map(Object.values),
                styles: { fontSize: 8 }
            });
            doc.save("repertoire.pdf");
        }
        toast.success("Export réussi !");
    } catch (e) {
        console.error(e);
        toast.error("Erreur lors de l'export.");
    }
  }

  // Styles Inputs
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none";
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";
</script>

<svelte:head>
  <title>Répertoire | BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">

  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Contact class="w-8 h-8" />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire</h1>
          <p class="text-gray-500 text-sm mt-1">Contacts internes et externes.</p>
        </div>
    </div>
    
    <div class="flex items-center gap-3">
      <div class="hidden md:flex bg-black/20 rounded-xl p-1 border border-white/5">
        <button on:click={() => switchView('grid')} class="p-2 rounded-lg transition-all {viewMode === 'grid' ? 'bg-white/10 text-blue-300 shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}">
            <LayoutGrid class="w-5 h-5" />
        </button>
        <button on:click={() => switchView('list')} class="p-2 rounded-lg transition-all {viewMode === 'list' ? 'bg-white/10 text-blue-300 shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}">
            <List class="w-5 h-5" />
        </button>
      </div>

      <div class="flex gap-2">
        {#if Object.keys(displayedContacts).length > 0}
            <button on:click={() => exportData('pdf')} class="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-all" title="Export PDF"><FileText class="w-5 h-5"/></button>
        {/if}
        {#if isAdmin}
           <button 
  on:click={() => openModal()} 
  class="btn-themed px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 shadow-lg border"
  style="--primary-rgb: var(--color-primary);"
>
  <Plus class="w-5 h-5" /> 
  <span class="hidden sm:inline font-bold">Ajouter</span>
</button>
        {/if}
      </div>
    </div>
  </header>

  <div class="flex flex-col md:flex-row gap-4" in:fly={{ y: 20, duration: 600, delay: 100 }}>
    <div class="relative flex-grow">
        <Search class="absolute left-3 top-3 h-5 w-5 text-gray-500" />
        <input 
            type="search" 
            bind:value={searchTerm} 
            placeholder="Rechercher (Nom, Tel, Groupe...)" 
            class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-gray-200 placeholder-gray-600 focus:ring-2 focus:ring-blue-500/30 focus:border-transparent outline-none transition-all"
        >
    </div>
    
    <div class="flex rounded-xl shadow-sm border border-white/10 bg-black/20 overflow-hidden">
        <button on:click={() => sortOrder = 'az'} class="px-4 py-2 flex items-center gap-2 {sortOrder === 'az' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'} border-r border-white/5 transition-colors">
            <ArrowDownAZ class="w-4 h-4"/> A-Z
        </button>
        <button on:click={() => sortOrder = 'za'} class="px-4 py-2 flex items-center gap-2 {sortOrder === 'za' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'} transition-colors">
            <ArrowDownZA class="w-4 h-4"/> Z-A
        </button>
    </div>
  </div>

  <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-6" in:fly={{ y: 20, duration: 600, delay: 200 }}>
    
    <div>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Catégories
        </h3>
        {#if loadingCategories}
            <div class="text-sm text-gray-500 flex items-center gap-2"><Loader2 class="w-4 h-4 animate-spin"/> Chargement...</div>
        {:else}
            <div class="flex flex-wrap gap-2">
                {#each categories as cat}
                    <button 
                        on:click={() => toggleCategory(cat)}
                        class="flex items-center space-x-2 px-3 py-1.5 border rounded-full text-xs font-medium uppercase tracking-wide transition-all shadow-sm 
                        {selectedCategories.includes(cat) 
                            ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}"
                    >
                        {#if selectedCategories.includes(cat)}<CheckSquare class="w-3.5 h-3.5" />{:else}<Square class="w-3.5 h-3.5" />{/if}
                        <span>{cat}</span>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    {#if showZoneFilters}
        <div class="pt-4 border-t border-white/5" transition:slide>
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-purple-500"></div> Zones
            </h3>
            <div class="flex flex-wrap gap-2">
                {#each zones as zone}
                    <button 
                        on:click={() => toggleZone(zone)}
                        class="flex items-center space-x-2 px-3 py-1.5 border rounded-full text-xs font-medium uppercase tracking-wide transition-all shadow-sm 
                        {selectedZones.includes(zone) 
                            ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}"
                    >
                        {#if selectedZones.includes(zone)}<CheckSquare class="w-3.5 h-3.5" />{:else}<Square class="w-3.5 h-3.5" />{/if}
                        <span>{zone}</span>
                    </button>
                {/each}
            </div>
        </div>
    {/if}
  </div>

  <div class="mt-8 min-h-[300px]">
    {#if loading}
        <div class="flex justify-center py-20 text-gray-500"><Loader2 class="w-10 h-10 animate-spin text-blue-500/50"/></div>
    
    {:else if Object.keys(displayedContacts).length === 0}
        <div class="text-center py-20 bg-black/20 rounded-2xl border border-dashed border-white/10" in:fade>
            <UserX class="w-12 h-12 mx-auto text-gray-600 mb-4" />
            <p class="text-gray-400 font-medium">
                {selectedCategories.length === 0 && !searchTerm ? 'Sélectionnez une catégorie pour commencer.' : 'Aucun contact trouvé.'}
            </p>
        </div>

    {:else}
        <div class="{viewMode === 'list' ? 'space-y-6' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start'}" in:fade>
            {#each Object.keys(displayedContacts).sort() as group}
                <div class="bg-black/20 rounded-2xl shadow-sm border border-white/5 overflow-hidden hover:border-white/10 transition-colors">
                    
                    <button 
                        on:click={() => viewMode === 'grid' && toggleGroupAccordion(group)}
                        class="w-full flex justify-between items-center p-4 bg-white/[0.02] border-b border-white/5 text-left {viewMode === 'list' ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'}"
                    >
                        <h3 class="font-bold text-gray-200 flex items-center gap-2">
                            <FolderOpen class="w-4 h-4 text-blue-400" /> {group} 
                            <span class="text-[10px] font-bold text-gray-400 bg-white/10 px-2 py-0.5 rounded-full border border-white/5">{displayedContacts[group].length}</span>
                        </h3>
                        {#if viewMode === 'grid'}
                            <ChevronDown class="w-5 h-5 text-gray-500 transition-transform {openGroups[group] ? 'rotate-180' : ''}" />
                        {/if}
                    </button>

                    {#if viewMode === 'list' || openGroups[group]}
                        <div class="divide-y divide-white/5" transition:slide>
                            {#each displayedContacts[group] as contact}
                                <div class="p-4 hover:bg-white/5 flex items-center justify-between group/item transition-colors">
                                    
                                    <div class="min-w-0 pr-4">
                                        <div class="font-bold text-gray-300 truncate text-sm" title={contact.nom}>
                                            {contact.nom}
                                        </div>
                                        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs">
                                            {#if contact.tel}
                                                <a href="etrali:{cleanPhone(contact.tel)}" class="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:underline font-mono bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                                    <Phone class="w-3 h-3" /> {formatPhone(contact.tel)}
                                                </a>
                                            {/if}
                                            {#if contact.email}
                                                <a href="mailto:{contact.email}" class="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 truncate">
                                                    <Mail class="w-3 h-3" /> {contact.email}
                                                </a>
                                            {/if}
                                        </div>
                                    </div>

                                    {#if isAdmin}
                                        <div class="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                            <button on:click={() => openModal(contact)} class="p-1.5 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors"><Pencil class="w-3.5 h-3.5" /></button>
                                            <button on:click={() => deleteContact(contact.id)} class="p-1.5 text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"><Trash2 class="w-3.5 h-3.5" /></button>
                                        </div>
                                    {/if}

                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
  </div>

</div>

{#if showModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
    <div 
        class="bg-[#0f1115] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10 ring-1 ring-white/5"
        transition:fly={{ y: 20, duration: 300 }}
    >
        <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/[0.02]">
            <h3 class="text-xl font-bold text-gray-200">
                {isEditMode ? 'Modifier' : 'Ajouter'} un contact
            </h3>
            <button on:click={() => showModal = false} class="text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-white/5 transition-colors">
                <X class="w-5 h-5" />
            </button>
        </div>
        
        <div class="p-6 overflow-y-auto space-y-5 flex-grow custom-scrollbar">
            <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2">
                    <label class={labelClass}>Nom</label>
                    <input bind:value={modalForm.nom} class={inputClass} placeholder="Nom du contact">
                </div>
                <div>
                    <label class={labelClass}>Téléphone</label>
                    <input bind:value={modalForm.tel} class={inputClass} placeholder="04...">
                </div>
                <div>
                    <label class={labelClass}>Email</label>
                    <input bind:value={modalForm.email} type="email" class={inputClass} placeholder="@...">
                </div>
                <div>
                    <label class={labelClass}>Catégorie</label>
                    <input bind:value={modalForm.categorie} placeholder="MIA, DSE..." class={inputClass}>
                </div>
                <div>
                    <label class={labelClass}>Zone</label>
                    <input bind:value={modalForm.zone} placeholder="FMS, FTY..." class={inputClass}>
                </div>
                <div class="col-span-2">
                    <label class={labelClass}>Groupe</label>
                    <input bind:value={modalForm.groupe} placeholder="SPI, PACO..." class={inputClass}>
                </div>
            </div>
        </div>

        <div class="flex justify-end items-center px-6 py-4 bg-white/[0.02] border-t border-white/10 gap-3 relative">
            <div class="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none"></div>

            <button on:click={() => showModal = false} class="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 hover:text-white transition-all">
                Annuler
            </button>
           <button 
  on:click={handleSubmit} 
  disabled={modalLoading} 
  class="btn-submit px-4 py-2 text-white rounded-xl flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
  style="--primary-rgb: var(--color-primary);"
>
  {#if modalLoading}
    <Loader2 class="w-4 h-4 animate-spin mr-2"/>
  {:else}
    <Save class="w-4 h-4 mr-2 group-hover:scale-110 transition-transform"/>
  {/if}
  Enregistrer
</button>
        </div>
    </div>
  </div>
{/if}

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
    /* Accentuation de l'opacité au survol */
    background-color: rgba(var(--primary-rgb), 0.3);
    border-color: rgba(var(--primary-rgb), 0.5);
    /* Lueur (glow) dynamique basée sur la couleur du thème */
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.2);
  }

  .btn-themed:active {
    transform: scale(0.95);
  }

  .btn-submit {
    /* Utilise l'opacité 0.8 pour l'action principale comme dans votre original */
    background-color: rgba(var(--primary-rgb), 0.8);
    /* Lueur dynamique basée sur le thème actuel */
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);
  }

  .btn-submit:hover:not(:disabled) {
    /* Opacité pleine et lueur accentuée au survol */
    background-color: rgb(var(--primary-rgb));
    box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.5);
    transform: translateY(-1px);
  }

  .btn-submit:active:not(:disabled) {
    transform: scale(0.98);
  }
</style>