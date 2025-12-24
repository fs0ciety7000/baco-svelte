<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { page } from '$app/stores';
  import { fly, fade } from 'svelte/transition';
  import { 
    Bus, FileText, Plus, X, Pencil, Trash2, 
    Phone, MapPin, CheckSquare, Square, Loader2, Check, Filter, AlertCircle, Search
  } from 'lucide-svelte';
  import jsPDF from 'jspdf';
  import autoTable from 'jspdf-autotable';

  import { toast } from '$lib/stores/toast.js';

  // --- ÉTATS ---
  let user = null;
  let isAdmin = false;
  let districts = ['DSE', 'DSO'];
  let selectedDistrict = null; 
  let linesByDistrict = { 'DSE': [], 'DSO': [] };
  let knownLinesMap = {}; 
  let newLinesDistricts = {}; 

  let selectedLines = [];
  let selectedSocieteIds = [];
  let searchTerm = ""; 

  let societesAffichees = [];
  let contactsAffiches = [];
  let chauffeursAffiches = [];
  
  let loadingStructure = true;
  let loadingSocietes = false;
  let loadingDetails = false;

  let showModal = false;
  let modalLoading = false;
  let isEditMode = false;
  let modalForm = { id: null, nom: '', lignes: '', contacts: '', chauffeurs: '' };

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;
    if (user) {
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      isAdmin = data?.role === 'admin';
    }
    await loadLinesReference();
    await fetchLinesStructure();
  });

  async function loadLinesReference() {
    const { data } = await supabase.from('ligne_data').select('ligne_nom, district');
    if (data) {
      knownLinesMap = data.reduce((acc, item) => {
        acc[item.ligne_nom] = item.district || 'DSO';
        return acc;
      }, {});
    }
  }

  async function fetchLinesStructure() {
    loadingStructure = true;
    const { data: busData } = await supabase.from('lignes_bus').select('ligne');
    if (!busData) { loadingStructure = false; return; }

    const uniqueBusLines = [...new Set(busData.map(item => item.ligne))];
    const { data: linesInfo } = await supabase.from('ligne_data').select('ligne_nom, district').in('ligne_nom', uniqueBusLines);

    let structure = { 'DSE': new Set(), 'DSO': new Set() };
    if (linesInfo) {
      linesInfo.forEach(info => {
        if (info.district && structure[info.district]) structure[info.district].add(info.ligne_nom);
        else structure['DSO'].add(info.ligne_nom);
      });
    }

    const foundLines = new Set(linesInfo?.map(l => l.ligne_nom) || []);
    uniqueBusLines.forEach(l => { if (!foundLines.has(l)) structure['DSO'].add(l); });

    linesByDistrict = {
      'DSE': Array.from(structure['DSE']).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''))),
      'DSO': Array.from(structure['DSO']).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))
    };
    loadingStructure = false;
  }

  $: {
    const q = $page.url.searchParams.get('search');
    if (q && q !== searchTerm) {
      searchTerm = q;
      selectedDistrict = null;
      selectedLines = [];
      loadSocietes();
    }
  }

  function selectDistrict(d) {
    if (selectedDistrict !== d) {
      selectedDistrict = d;
      selectedLines = [];
      societesAffichees = [];
      selectedSocieteIds = [];
      searchTerm = "";
    }
  }

  $: if (selectedLines) loadSocietes();
  $: if (selectedSocieteIds) loadDetails();

  async function loadSocietes() {
    societesAffichees = [];
    selectedSocieteIds = [];
    if (!searchTerm && selectedLines.length === 0) return;

    loadingSocietes = true;
    if (searchTerm) {
      const term = `%${searchTerm}%`;
      const { data: socs } = await supabase.from('societes_bus').select('id').ilike('nom', term);
      const { data: chauff } = await supabase.from('chauffeurs_bus').select('societe_id').ilike('nom', term);
      const { data: cont } = await supabase.from('contacts_bus').select('societe_id').ilike('nom', term);

      const allIds = new Set([...(socs?.map(s => s.id) || []), ...(chauff?.map(c => c.societe_id) || []), ...(cont?.map(c => c.societe_id) || [])]);
      if (allIds.size > 0) {
        const { data } = await supabase.from('societes_bus').select('id, nom').in('id', [...allIds]).order('nom');
        societesAffichees = data || [];
        selectedSocieteIds = societesAffichees.map(s => s.id);
      }
    } else {
      const { data: lignesData } = await supabase.from('lignes_bus').select('societe_id').in('ligne', selectedLines);
      const uniqueIds = [...new Set(lignesData?.map(item => item.societe_id) || [])];
      if (uniqueIds.length > 0) {
        const { data } = await supabase.from('societes_bus').select('id, nom').in('id', uniqueIds).order('nom');
        societesAffichees = data || [];
      }
    }
    loadingSocietes = false;
  }

  async function loadDetails() {
    contactsAffiches = [];
    chauffeursAffiches = [];
    if (selectedSocieteIds.length === 0) return;
    loadingDetails = true;
    const { data: contacts } = await supabase.from('contacts_bus').select('id, nom, tel, societes_bus(nom)').in('societe_id', selectedSocieteIds);
    if (contacts) contactsAffiches = contacts;
    const { data: chauffeurs } = await supabase.from('chauffeurs_bus').select('id, nom, tel, societes_bus(nom)').in('societe_id', selectedSocieteIds);
    if (chauffeurs) chauffeursAffiches = chauffeurs;
    loadingDetails = false;
  }

  function toggleLine(line) {
    searchTerm = "";
    selectedLines = selectedLines.includes(line) ? selectedLines.filter(l => l !== line) : [...selectedLines, line];
  }

  function toggleSociete(id) {
    selectedSocieteIds = selectedSocieteIds.includes(id) ? selectedSocieteIds.filter(s => s !== id) : [...selectedSocieteIds, id];
  }

  const cleanPhone = (tel) => tel ? tel.replace(/[^0-9]/g, '') : '';
  const formatPhone = (tel) => {
    const cleaned = cleanPhone(tel);
    return cleaned.length >= 10 ? cleaned.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1/$2.$3.$4') : tel;
  };

  async function openModal(societe = null) {
    isEditMode = !!societe;
    modalForm = { id: societe?.id || null, nom: societe?.nom || '', lignes: '', contacts: '', chauffeurs: '' };
    if (isEditMode) {
      const { data } = await supabase.from('societes_bus').select(`lignes_bus(ligne), contacts_bus(nom, tel), chauffeurs_bus(nom, tel)`).eq('id', societe.id).single();
      if (data) {
        modalForm.lignes = data.lignes_bus.map(l => l.ligne).join(', ');
        modalForm.contacts = data.contacts_bus.map(c => `${c.nom}, ${c.tel}`).join('\n');
        modalForm.chauffeurs = data.chauffeurs_bus.map(c => `${c.nom}, ${c.tel}`).join('\n');
      }
    }
    showModal = true;
  }

  async function handleSubmit() {
    modalLoading = true;
    const linesToProcess = modalForm.lignes.split(',').map(s => s.trim()).filter(Boolean);
    for (const line of linesToProcess) {
      if (!knownLinesMap[line]) {
        const districtChoice = newLinesDistricts[line] || 'DSO';
        const { error } = await supabase.from('ligne_data').upsert({ ligne_nom: line, district: districtChoice, gare: 'Gare Inconnue' }, { onConflict: 'ligne_nom' });
        if (!error) knownLinesMap[line] = districtChoice;
      }
    }
    const parseList = (text) => text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split(',');
      return { nom: parts.shift()?.trim(), tel: parts.join(',').trim() };
    });
    const payload = { societe_id_to_update: modalForm.id, new_nom: modalForm.nom, new_lignes: linesToProcess, new_contacts: parseList(modalForm.contacts), new_chauffeurs: parseList(modalForm.chauffeurs) };
    const { error } = await supabase.rpc('upsert_societe_bus', payload);
    modalLoading = false;
    if (error) toast.error("Erreur : " + error.message);
    else {
      toast.success(isEditMode ? "Modifié !" : "Ajouté !");
      showModal = false;
      fetchLinesStructure();
      loadSocietes();
    }
  }

  function getLineStatus(lineName) {
    const clean = lineName.trim();
    if (!clean) return null;
    return knownLinesMap[clean] ? { status: 'known', district: knownLinesMap[clean] } : { status: 'unknown' };
  }

  async function deleteSociete(id, nom) {
    if (!confirm(`Supprimer ${nom} ?`)) return;
    const { error } = await supabase.rpc('delete_societe_bus', { societe_id_to_delete: id });
    if (!error) { toast.success("Supprimé"); fetchLinesStructure(); loadSocietes(); }
  }

  const inputClass = "block w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white transition-all outline-none input-themed";
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }} style="--primary-rgb: var(--color-primary);">
    <div class="flex items-center gap-3">
      <div class="main-icon-container p-3 rounded-xl border transition-all duration-500">
        <Bus class="w-8 h-8" />
      </div>
      <div>
        <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire Bus</h1>
        <p class="text-gray-500 text-sm mt-1">Gérer les lignes de substitution et contacts.</p>
      </div>
    </div>
    <div class="flex gap-3">
      {#if isAdmin}
        <button on:click={() => openModal()} class="btn-add px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group border shadow-lg">
          <Plus class="w-5 h-5 group-hover:rotate-90 transition-transform" />
          <span class="font-semibold hidden sm:inline">Ajouter</span>
        </button>
      {/if}
    </div>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6" in:fly={{ y: 20, duration: 600, delay: 100 }} style="--primary-rgb: var(--color-primary);">
    <div class="lg:col-span-3 space-y-4">
      <div class="bg-black/20 border border-white/5 rounded-2xl p-5 h-full">
        <h3 class="text-xs font-bold uppercase text-gray-500 mb-4 flex items-center gap-2"><Filter class="w-4 h-4" /> District</h3>
        {#if loadingStructure}
          <div class="flex justify-center py-4"><Loader2 class="animate-spin text-gray-600"/></div>
        {:else}
          <div class="flex flex-col gap-2">
            {#each districts as district}
              <button on:click={() => selectDistrict(district)} class="district-btn w-full text-left px-4 py-3 rounded-xl border transition-all {selectedDistrict === district ? 'active' : 'inactive'}">
                <span class="font-bold tracking-wide">{district}</span>
                {#if selectedDistrict === district}<div class="dot-active"></div>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="lg:col-span-9 space-y-4">
      <div class="bg-black/20 border border-white/5 rounded-2xl p-5 min-h-[140px]">
        <h3 class="text-xs font-bold uppercase text-gray-500 mb-4 flex items-center gap-2">
          <div class="w-1.5 h-1.5 rounded-full bg-themed-solid"></div> Lignes disponibles {#if selectedDistrict}({selectedDistrict}){/if}
        </h3>
        {#if !selectedDistrict}
          <p class="text-center text-gray-600 italic py-8">← Sélectionnez un district.</p>
        {:else}
          <div class="flex flex-wrap gap-3">
            {#each linesByDistrict[selectedDistrict] as line}
              <button on:click={() => toggleLine(line)} class="line-badge flex items-center space-x-2 px-4 py-2 border rounded-full transition-all text-sm font-medium {selectedLines.includes(line) ? 'active' : 'inactive'}">
                {#if selectedLines.includes(line)}<Check class="w-3.5 h-3.5" />{/if}
                <span>{line}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="space-y-8 min-h-[400px]" style="--primary-rgb: var(--color-primary);">
    {#if loadingSocietes}
      <div class="flex flex-col items-center justify-center py-20"><Loader2 class="w-10 h-10 animate-spin themed-spinner mb-3"/><p class="text-gray-500">Recherche...</p></div>
    {:else if societesAffichees.length > 0}
      <div in:fly={{ y: 20, duration: 400 }}>
        <h3 class="text-xl font-bold text-gray-200 mb-4 flex items-center gap-2">
          <div class="w-1 h-6 bg-themed-solid rounded-full"></div> Sociétés concernées {#if searchTerm}(Recherche: "{searchTerm}"){/if}
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each societesAffichees as societe}
            <div class="group societe-card flex items-center justify-between px-4 py-3 bg-black/20 border border-white/5 rounded-xl transition-all cursor-pointer {selectedSocieteIds.includes(societe.id) ? 'active' : ''}">
              <label class="flex items-center space-x-3 cursor-pointer flex-grow">
                <input type="checkbox" checked={selectedSocieteIds.includes(societe.id)} on:change={() => toggleSociete(societe.id)} class="checkbox-themed rounded w-5 h-5 bg-black/40 border-gray-600">
                <span class="font-bold text-gray-300 group-hover:text-white">{societe.nom}</span>
              </label>
              {#if isAdmin}
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button on:click={() => openModal(societe)} class="p-2 text-gray-400 hover:text-themed"><Pencil class="w-4 h-4" /></button>
                  <button on:click={() => deleteSociete(societe.id, societe.nom)} class="p-2 text-gray-400 hover:text-red-400"><Trash2 class="w-4 h-4" /></button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      {#if selectedSocieteIds.length > 0}
        {#if loadingDetails}
          <div class="flex justify-center p-10"><Loader2 class="w-8 h-8 animate-spin themed-spinner"/></div>
        {:else}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8" in:fly={{ y: 20, duration: 400 }}>
            {#if contactsAffiches.length > 0}
              <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
                <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-themed-solid"></div> Bureaux</h3>
                <ul class="space-y-3">
                  {#each contactsAffiches as c}
                    <li class="bg-white/5 rounded-xl border border-white/5 p-3 flex justify-between items-center group">
                      <div><span class="block font-bold text-gray-200">{c.nom}</span><span class="text-xs text-gray-500">{c.societes_bus.nom}</span></div>
                      <a href="etrali:{cleanPhone(c.tel)}" class="contact-link flex items-center gap-2 font-mono px-3 py-1.5 rounded-lg border transition-all"><Phone size={14} /> {formatPhone(c.tel)}</a>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if chauffeursAffiches.length > 0}
              <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
                <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full border border-themed-solid"></div> Chauffeurs</h3>
                <ul class="space-y-3">
                  {#each chauffeursAffiches as c}
                    <li class="bg-white/5 rounded-xl border border-white/5 p-3 flex justify-between items-center group">
                      <div><span class="block font-bold text-gray-200">{c.nom}</span><span class="text-xs text-gray-500">{c.societes_bus.nom}</span></div>
                      <a href="etrali:{cleanPhone(c.tel)}" class="contact-link flex items-center gap-2 font-mono px-3 py-1.5 rounded-lg border transition-all"><Phone size={14} /> {formatPhone(c.tel)}</a>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    {:else if searchTerm || selectedLines.length > 0}
      <p class="text-center text-gray-500 py-20">Aucun résultat trouvé.</p>
    {:else}
      <div class="flex flex-col items-center justify-center py-20 text-gray-600 border border-dashed border-white/10 rounded-3xl mt-8">
        <Bus size={48} class="opacity-20 mb-4" />
        <p>Sélectionnez des critères pour afficher les données.</p>
      </div>
    {/if}
  </div>
</div>

{#if showModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
    <div class="bg-[#0f1115] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10" transition:fly={{ y: 20, duration: 300 }}>
      <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/[0.02]">
        <h3 class="text-xl font-bold text-gray-200">{isEditMode ? 'Modifier' : 'Ajouter'} société</h3>
        <button on:click={() => showModal = false} class="text-gray-500 hover:text-gray-300 transition-colors"><X class="w-5 h-5" /></button>
      </div>
      <div class="p-6 space-y-5 overflow-y-auto custom-scrollbar">
        <div><label class={labelClass}>Nom</label><input bind:value={modalForm.nom} type="text" class={inputClass}></div>
        <div><label class={labelClass}>Lignes (L.37, L.162...)</label><input bind:value={modalForm.lignes} type="text" class={inputClass}></div>
        <div><label class={labelClass}>Contacts (Nom, Tel)</label><textarea bind:value={modalForm.contacts} rows="3" class="{inputClass} font-mono resize-none"></textarea></div>
        <div><label class={labelClass}>Chauffeurs (Nom, Tel)</label><textarea bind:value={modalForm.chauffeurs} rows="4" class="{inputClass} font-mono resize-none"></textarea></div>
      </div>
      <div class="flex justify-end px-6 py-4 bg-white/[0.02] border-t border-white/10 gap-3">
        <button on:click={() => showModal = false} class="px-4 py-2 text-gray-300 hover:text-white transition-colors">Annuler</button>
        <button on:click={handleSubmit} disabled={modalLoading} class="btn-submit px-6 py-2 text-white rounded-xl disabled:opacity-50" style="--primary-rgb: var(--color-primary);">
          {#if modalLoading}<Loader2 class="w-4 h-4 animate-spin mr-2"/>{/if} Enregistrer
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bg-themed-solid { background-color: rgb(var(--primary-rgb)); }
  .border-themed-solid { border-color: rgb(var(--primary-rgb)); }
  .text-themed { color: rgb(var(--primary-rgb)); }
  .themed-spinner { color: rgba(var(--primary-rgb), 0.5); }
  .main-icon-container { background-color: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-color: rgba(var(--primary-rgb), 0.2); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15); }
  .btn-add { background-color: rgba(var(--primary-rgb), 0.2); border-color: rgba(var(--primary-rgb), 0.3); color: rgb(var(--primary-rgb)); }
  .btn-add:hover { background-color: rgba(var(--primary-rgb), 0.3); border-color: rgba(var(--primary-rgb), 0.5); box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.2); }
  .btn-submit { background-color: rgba(var(--primary-rgb), 0.8); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3); }
  .btn-submit:hover:not(:disabled) { background-color: rgb(var(--primary-rgb)); box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.5); transform: translateY(-1px); }
  .district-btn.active { background-color: rgba(var(--primary-rgb), 0.1); border-color: rgba(var(--primary-rgb), 0.4); color: rgb(var(--primary-rgb)); }
  .district-btn.inactive { color: #6b7280; border-color: transparent; }
  .dot-active { width: 0.5rem; height: 0.5rem; border-radius: 999px; background-color: rgb(var(--primary-rgb)); box-shadow: 0 0 8px rgb(var(--primary-rgb)); }
  .line-badge.active { background-color: rgba(var(--primary-rgb), 0.2); border-color: rgba(var(--primary-rgb), 0.4); color: rgb(var(--primary-rgb)); box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.2); }
  .line-badge.inactive { color: #9ca3af; border-color: #ffffff10; }
  .societe-card.active { background-color: rgba(var(--primary-rgb), 0.05); border-color: rgba(var(--primary-rgb), 0.3); }
  .checkbox-themed { accent-color: rgb(var(--primary-rgb)); }
  .contact-link { color: rgb(var(--primary-rgb)); background-color: rgba(var(--primary-rgb), 0.1); border-color: rgba(var(--primary-rgb), 0.2); }
  .contact-link:hover { background-color: rgba(var(--primary-rgb), 0.2); border-color: rgba(var(--primary-rgb), 0.4); box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.2); }

  /* On s'assure que la variable est accessible via le scope du composant */
  .input-themed {
    --primary-rgb: var(--color-primary);
  }

  .input-themed:focus {
    /* Bordure à 50% d'opacité de la couleur du thème */
    border-color: rgba(var(--primary-rgb), 0.5);
    
    /* Optionnel : ajout d'un halo (ring) assorti pour renforcer l'effet glow */
    box-shadow: 0 0 0 4px rgba(var(--primary-rgb), 0.1);
    
    /* Légère clarification du fond au focus */
    background-color: rgba(0, 0, 0, 0.5);
  }

  /* Style pour le placeholder pour rester dans le thème sombre */
  .input-themed::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
</style>