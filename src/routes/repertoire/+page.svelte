<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { page } from '$app/stores'; 
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
  import { toast } from '$lib/stores/toast.js';

  // --- ÉTATS ---
  let user = null;
  let isAdmin = false;
  let displayedContacts = {}; 
  let categories = [];
  let zones = [];
  let selectedCategories = [];
  let selectedZones = [];
  let searchTerm = "";
  let sortOrder = 'az'; 
  let viewMode = 'grid'; 
  let rawContactData = [];
  let loading = false;
  let loadingCategories = true;
  let showZoneFilters = false;
  let showModal = false;
  let modalLoading = false;
  let isEditMode = false;
  let modalForm = { id: null, nom: '', tel: '', email: '', categorie: '', zone: '', groupe: '' };
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

  $: {
      const q = $page.url.searchParams.get('search');
      if (q && q !== searchTerm) searchTerm = q;
  }

  async function loadCategories() {
    loadingCategories = true;
    const { data } = await supabase.from('contacts_repertoire').select('categorie_principale, zone');
    if (data) {
      rawContactData = data;
      categories = [...new Set(data.map(i => i.categorie_principale))].filter(Boolean).sort();
    }
    loadingCategories = false;
    handleCategoryChange();
  }

  $: if (selectedCategories) handleCategoryChange();
  $: if (selectedCategories || selectedZones || searchTerm || sortOrder) loadContacts();

  function handleCategoryChange() {
    if (selectedCategories.length === 0) {
        showZoneFilters = false;
        zones = [];
        selectedZones = []; 
        return;
    }
    const availableZones = rawContactData.filter(d => selectedCategories.includes(d.categorie_principale) && d.zone).map(d => d.zone);
    const distinctZones = [...new Set(availableZones)].sort();
    if (distinctZones.length > 0) {
        showZoneFilters = true;
        zones = distinctZones;
        selectedZones = selectedZones.filter(z => zones.includes(z));
    } else {
        showZoneFilters = false;
        zones = [];
        selectedZones = [];
    }
  }
 
  async function loadContacts() {
    if (selectedCategories.length === 0 && !searchTerm) {
        displayedContacts = {};
        return;
    }
    loading = true;
    let query = supabase.from('contacts_repertoire').select('*').order('nom', { ascending: sortOrder === 'az' });
    const orFilters = [];
    if (selectedCategories.length > 0) {
        selectedCategories.forEach(cat => {
            const validZonesForCat = rawContactData.filter(d => d.categorie_principale === cat && d.zone).map(d => d.zone);
            const appliedZones = selectedZones.filter(z => validZonesForCat.includes(z));
            if (appliedZones.length > 0) {
                orFilters.push(`and(categorie_principale.eq.${cat},zone.in.(${appliedZones.join(',')}))`);
            } else {
                orFilters.push(`categorie_principale.eq.${cat}`);
            }
        });
    }
    if (orFilters.length > 0) query = query.or(orFilters.join(','));
    if (searchTerm) query = query.or(`nom.ilike.%${searchTerm}%,tel.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,groupe.ilike.%${searchTerm}%`);
    const { data, error } = await query;
    if (error) { console.error(error); loading = false; return; }
    const groups = {};
    (data || []).forEach(c => {
        const g = c.groupe || 'Autre';
        if (!groups[g]) { groups[g] = []; openGroups[g] = true; }
        groups[g].push(c);
    });
    displayedContacts = groups;
    loading = false;
  }

  function toggleCategory(cat) {
    selectedCategories = selectedCategories.includes(cat) ? selectedCategories.filter(c => c !== cat) : [...selectedCategories, cat];
  }

  function toggleZone(zone) {
    selectedZones = selectedZones.includes(zone) ? selectedZones.filter(z => z !== zone) : [...selectedZones, zone];
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
      return cleaned.length >= 10 ? cleaned.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1/$2.$3.$4') : tel;
  };

  function openModal(contact = null) {
    isEditMode = !!contact;
    modalForm = {
      id: contact?.id || null, nom: contact?.nom || '', tel: contact?.tel || '',
      email: contact?.email || '', categorie: contact?.categorie_principale || '',
      zone: contact?.zone || '', groupe: contact?.groupe || ''
    };
    showModal = true;
  }

  async function handleSubmit() {
    modalLoading = true;
    const payload = { nom: modalForm.nom, tel: modalForm.tel, email: modalForm.email || null, categorie_principale: modalForm.categorie, zone: modalForm.zone || null, groupe: modalForm.groupe };
    const { error } = isEditMode ? await supabase.from('contacts_repertoire').update(payload).eq('id', modalForm.id) : await supabase.from('contacts_repertoire').insert([payload]);
    modalLoading = false;
    if (error) toast.error("Erreur: " + error.message);
    else { toast.success("Enregistré !"); showModal = false; loadContacts(); }
  }

  async function deleteContact(id) {
    if(!confirm("Supprimer ce contact ?")) return;
    const { error } = await supabase.from('contacts_repertoire').delete().eq('id', id);
    if (!error) { toast.success("Supprimé"); loadContacts(); }
  }

  function exportData(type) {
    const flatData = Object.values(displayedContacts).flat().map(c => ({ "Nom": c.nom, "Groupe": c.groupe, "Tel": formatPhone(c.tel), "Email": c.email || '', "Cat": c.categorie_principale }));
    if (type === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Repertoire");
        XLSX.writeFile(wb, "repertoire.xlsx");
    } else {
        const doc = new jsPDF();
        autoTable(doc, { head: [['Nom', 'Groupe', 'Tel', 'Email', 'Cat']], body: flatData.map(Object.values) });
        doc.save("repertoire.pdf");
    }
  }

  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:ring-2 outline-none transition-all";
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
<header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" 
          in:fly={{ y: -20, duration: 600 }} 
          style="--primary-rgb: var(--color-primary);">
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl border transition-all duration-500" 
             style="background-color: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-color: rgba(var(--primary-rgb), 0.2); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);">
          <Contact class="w-8 h-8" />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire</h1>
          <p class="text-gray-500 text-sm mt-1">Annuaire des contacts.</p>
        </div>
    </div>
    
    <div class="flex items-center gap-3">
      <div class="hidden md:flex bg-black/20 rounded-xl p-1 border border-white/5">
        <button on:click={() => switchView('grid')} class="p-2 rounded-lg transition-all {viewMode === 'grid' ? 'bg-white/10 shadow-sm' : 'text-gray-500'}" style={viewMode === 'grid' ? 'color: rgb(var(--primary-rgb))' : ''}>
            <LayoutGrid class="w-5 h-5" />
        </button>
        <button on:click={() => switchView('list')} class="p-2 rounded-lg transition-all {viewMode === 'list' ? 'bg-white/10 shadow-sm' : 'text-gray-500'}" style={viewMode === 'list' ? 'color: rgb(var(--primary-rgb))' : ''}>
            <List class="w-5 h-5" />
        </button>
      </div>
      <div class="flex gap-2">
<button 
  on:click={() => exportData('pdf')} 
  class="btn-export-red p-2.5 rounded-xl border transition-all hover:scale-105 group shadow-lg" 
  title="Exporter en PDF"
>
  <FileText class="w-5 h-5 transition-transform group-hover:rotate-6" />
</button>        {#if isAdmin}
           <button on:click={() => openModal()} class="btn-add px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group border shadow-lg font-bold">
              <Plus class="w-5 h-5 group-hover:rotate-90 transition-transform" /> 
              <span>Ajouter</span>
           </button>
        {/if}
      </div>
    </div>
  </header>

  <div class="flex flex-col md:flex-row gap-4" in:fly={{ y: 20, duration: 600, delay: 100 }}>
    <div class="relative flex-grow">
        <Search class="absolute left-3 top-3 h-5 w-5 text-gray-500" />
        <input type="search" bind:value={searchTerm} placeholder="Rechercher..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-gray-200 placeholder-gray-600 outline-none transition-all focus:ring-2" style="--tw-ring-color: rgba(var(--color-primary), 0.3); border-color: rgba(var(--color-primary), 0.2);">
    </div>
    
    <div class="flex rounded-xl shadow-sm border border-white/10 bg-black/20 overflow-hidden">
        <button on:click={() => sortOrder = 'az'} class="px-4 py-2 flex items-center gap-2 border-r border-white/5 transition-colors {sortOrder === 'az' ? 'bg-white/5' : 'text-gray-500 hover:text-gray-300'}" style={sortOrder === 'az' ? 'color: rgb(var(--color-primary)); background-color: rgba(var(--color-primary), 0.15)' : ''}>
            <ArrowDownAZ class="w-4 h-4"/> A-Z
        </button>
        <button on:click={() => sortOrder = 'za'} class="px-4 py-2 flex items-center gap-2 transition-colors {sortOrder === 'za' ? 'bg-white/5' : 'text-gray-500 hover:text-gray-300'}" style={sortOrder === 'za' ? 'color: rgb(var(--color-primary)); background-color: rgba(var(--color-primary), 0.15)' : ''}>
            <ArrowDownZA class="w-4 h-4"/> Z-A
        </button>
    </div>
  </div>

  <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-6" in:fly={{ y: 20, duration: 600, delay: 200 }}>
    <div>
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full" style="background-color: rgb(var(--color-primary));"></div> Catégories
        </h3>
        <div class="flex flex-wrap gap-2">
            {#each categories as cat}
                <button 
                    on:click={() => toggleCategory(cat)}
                    class="flex items-center space-x-2 px-3 py-1.5 border rounded-full text-xs font-medium uppercase tracking-wide transition-all shadow-sm"
                    style={selectedCategories.includes(cat) 
                        ? `background-color: rgba(var(--color-primary), 0.2); border-color: rgba(var(--color-primary), 0.4); color: rgb(var(--color-primary)); box-shadow: 0 0 10px rgba(var(--color-primary), 0.2);` 
                        : 'background-color: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.1); color: #9ca3af;'}
                >
                    {#if selectedCategories.includes(cat)}<CheckSquare class="w-3.5 h-3.5" />{:else}<Square class="w-3.5 h-3.5" />{/if}
                    <span>{cat}</span>
                </button>
            {/each}
        </div>
    </div>
  </div>

  <div class="mt-8 min-h-[300px]">
    {#if loading}
        <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin" style="color: rgb(var(--color-primary)); opacity: 0.5;"/></div>
    {:else if Object.keys(displayedContacts).length === 0}
        <div class="text-center py-20 bg-black/20 rounded-2xl border border-dashed border-white/10" in:fade>
            <UserX class="w-12 h-12 mx-auto text-gray-600 mb-4" />
            <p class="text-gray-400 font-medium">Aucun contact trouvé.</p>
        </div>
    {:else}
        <div class="{viewMode === 'list' ? 'space-y-6' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start'}" in:fade>
            {#each Object.keys(displayedContacts).sort() as group}
                <div class="bg-black/20 rounded-2xl shadow-sm border border-white/5 overflow-hidden">
                    <button 
                        on:click={() => viewMode === 'grid' && toggleGroupAccordion(group)}
                        class="w-full flex justify-between items-center p-4 bg-white/[0.02] border-b border-white/5 text-left"
                    >
                        <h3 class="font-bold text-gray-200 flex items-center gap-2">
                            <FolderOpen class="w-4 h-4" style="color: rgb(var(--color-primary));" /> {group} 
                        </h3>
                        <ChevronDown class="w-4 h-4 text-gray-500 transition-transform {openGroups[group] ? 'rotate-180' : ''}" />
                    </button>

                    {#if viewMode === 'list' || openGroups[group]}
                        <div class="divide-y divide-white/5" transition:slide>
                            {#each displayedContacts[group] as contact}
                                <div class="p-4 hover:bg-white/5 flex items-center justify-between group/item transition-colors">
                                    <div class="min-w-0 pr-4">
                                        <div class="font-bold text-gray-300 truncate text-sm">{contact.nom}</div>
                                        <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                                            {#if contact.tel}
                                               <a href="etrali:{cleanPhone(contact.tel)}" class="flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all" 
   style="color: rgb(var(--color-primary)); background-color: rgba(var(--color-primary), 0.1); border-color: rgba(var(--color-primary), 0.2);">
    <Phone class="w-3 h-3" /> {formatPhone(contact.tel)}
</a>
                                            {/if}
                                            {#if contact.email}
                                                <span class="flex items-center gap-1.5 text-gray-500 truncate"><Mail class="w-3 h-3" /> {contact.email}</span>
                                            {/if}
                                        </div>
                                    </div>
                                    {#if isAdmin}
                                        <div class="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                            <button on:click={() => openModal(contact)} class="p-1.5 bg-white/5 rounded-lg transition-colors" style="color: rgb(var(--color-primary));"><Pencil class="w-3.5 h-3.5" /></button>
                                            <button on:click={() => deleteContact(contact.id)} class="p-1.5 text-red-400 bg-red-500/10 rounded-lg"><Trash2 class="w-3.5 h-3.5" /></button>
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
    <div class="bg-[#0f1115] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden" transition:fly={{ y: 20, duration: 300 }}>
        <div class="flex justify-between items-center px-6 py-5 border-b border-white/10">
            <h3 class="text-xl font-bold text-gray-200">{isEditMode ? 'Modifier' : 'Ajouter'} contact</h3>
            <button on:click={() => showModal = false} class="text-gray-500 hover:text-gray-300"><X class="w-5 h-5" /></button>
        </div>
        <div class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2"><label class={labelClass}>Nom</label><input bind:value={modalForm.nom} class={inputClass} style="--tw-ring-color: rgba(var(--color-primary), 0.4);"></div>
                <div><label class={labelClass}>Téléphone</label><input bind:value={modalForm.tel} class={inputClass} style="--tw-ring-color: rgba(var(--color-primary), 0.4);"></div>
                <div><label class={labelClass}>Email</label><input bind:value={modalForm.email} class={inputClass} style="--tw-ring-color: rgba(var(--color-primary), 0.4);"></div>
                <div><label class={labelClass}>Catégorie</label><input bind:value={modalForm.categorie} class={inputClass} style="--tw-ring-color: rgba(var(--color-primary), 0.4);"></div>
                <div><label class={labelClass}>Groupe</label><input bind:value={modalForm.groupe} class={inputClass} style="--tw-ring-color: rgba(var(--color-primary), 0.4);"></div>
            </div>
        </div>
        <div class="px-6 py-4 bg-white/[0.02] border-t border-white/10 flex justify-end gap-3">
            <button on:click={() => showModal = false} class="px-4 py-2 text-gray-400">Annuler</button>
            <button on:click={handleSubmit} class="btn-primary px-6 py-2 rounded-xl font-bold flex items-center gap-2">
                {#if modalLoading}<Loader2 class="w-4 h-4 animate-spin"/>{:else}<Save class="w-4 h-4"/>{/if} Enregistrer
            </button>
        </div>
    </div>
  </div>
{/if}

<style>
 /* Styles identiques à la page Bus pour une cohérence parfaite */
  .btn-add { 
    background-color: rgba(var(--primary-rgb), 0.2); 
    border-color: rgba(var(--primary-rgb), 0.3); 
    color: rgb(var(--primary-rgb)); 
  }
  
  .btn-add:hover { 
    background-color: rgba(var(--primary-rgb), 0.3); 
    border-color: rgba(var(--primary-rgb), 0.5); 
    box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.2); 
  }

  .btn-primary {
    background-color: rgb(var(--color-primary));
    color: white;
  }
  
  .btn-primary:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 20px rgba(var(--color-primary), 0.4);
    transform: translateY(-1px);
  }

  /* Animation fluide pour les groupes */
  .group-hover\:rotate-90:hover {
    transform: rotate(90deg);
  }

  /* Bouton Export Rouge avec Glow */
  .btn-export-red {
    /* Fond rouge très léger (10% opacité) */
    background-color: rgba(239, 68, 68, 0.1); 
    /* Bordure rouge (20% opacité) */
    border-color: rgba(239, 68, 68, 0.2);
    /* Icône rouge */
    color: rgb(239, 68, 68);
  }

  .btn-export-red:hover {
    /* Fond un peu plus intense au survol */
    background-color: rgba(239, 68, 68, 0.2);
    /* Bordure plus visible */
    border-color: rgba(239, 68, 68, 0.5);
    /* Effet d'éclat (Glow) rouge */
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
  }

  .btn-export-red:active {
    transform: scale(0.95);
  }
</style>