<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { page } from '$app/stores'; // IMPORT AJOUTÉ
  import { fly, fade } from 'svelte/transition';
  import { 
    Bus, FileText, Plus, X, Pencil, Trash2, 
    Phone, MapPin, CheckSquare, Square, Loader2, Check, Filter, AlertCircle, Search
  } from 'lucide-svelte';
  import jsPDF from 'jspdf';
  import autoTable from 'jspdf-autotable';

  // IMPORT TOAST
  import { toast } from '$lib/stores/toast.js';

  // --- ÉTATS (DATA) ---
  let user = null;
  let isAdmin = false;

  // Navigation & Filtres
  let districts = ['DSE', 'DSO'];
  let selectedDistrict = null; // 'DSE' ou 'DSO'
  
  // Stockage des lignes récupérées depuis la DB : { 'DSE': ['L.37', ...], 'DSO': ['L.xx', ...] }
  let linesByDistrict = {
    'DSE': [],
    'DSO': []
  };
  // --- NOUVEAU : Référentiel des lignes ---
  let knownLinesMap = {}; // Format: { 'L.37': 'DSE', 'L.75': 'DSO' }
  let newLinesDistricts = {}; // Pour stocker les choix temporaires de l'utilisateur: { 'L.999': 'DSE' }


  // Sélection
  let selectedLines = [];
  let selectedSocieteIds = [];
  let searchTerm = ""; // NOUVEL ÉTAT POUR LA RECHERCHE

  // Résultats
  let societesAffichees = [];
  let contactsAffiches = [];
  let chauffeursAffiches = [];
  // Loaders
  let loadingStructure = true; // Pour le chargement initial des lignes/districts
  let loadingSocietes = false;
  let loadingDetails = false;

  // Modale
  let showModal = false;
  let modalLoading = false;
  let isEditMode = false;
  let modalForm = {
    id: null,
    nom: '',
    lignes: '',
    contacts: '',
    chauffeurs: ''
  };
  // --- INITIALISATION ---
  onMount(async () => {
    // 1. Auth
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;
    if (user) {
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      isAdmin = data?.role === 'admin';
    }

    await loadLinesReference();

    // 2. Charger la structure (Lignes disponibles & Districts)
    await fetchLinesStructure();
  });
  // Fonction pour charger le mapping Ligne -> District
  async function loadLinesReference() {
    const { data, error } = await supabase
      .from('ligne_data')
      .select('ligne_nom, district');
    if (data) {
        knownLinesMap = data.reduce((acc, item) => {
            acc[item.ligne_nom] = item.district || 'DSO'; // Valeur par défaut si null
            return acc;
        }, {});
    }
  }

  // --- LOGIQUE DE RÉCUPÉRATION DES LIGNES ---
  async function fetchLinesStructure() {
    loadingStructure = true;
    // A. Récupérer toutes les lignes qui ont des bus (depuis lignes_bus)
    const { data: busData, error: busError } = await supabase
        .from('lignes_bus')
        .select('ligne');
    if (busError || !busData) {
        console.error("Erreur fetch lignes_bus", busError);
        loadingStructure = false;
        return;
    }

    // Extraire les lignes uniques (ex: ['L.34', 'L.36', ...])
    const uniqueBusLines = [...new Set(busData.map(item => item.ligne))];
    if (uniqueBusLines.length === 0) {
        loadingStructure = false;
        return;
    }

    // B. Récupérer le district pour ces lignes (depuis ligne_data)
    const { data: linesInfo, error: lineError } = await supabase
        .from('ligne_data')
        .select('ligne_nom, district')
        .in('ligne_nom', uniqueBusLines);
    if (lineError) console.error("Erreur fetch ligne_data", lineError);

    // C. Organiser par district
    let structure = { 'DSE': new Set(), 'DSO': new Set() };
    // Mapping des lignes trouvées dans ligne_data
    if (linesInfo) {
        linesInfo.forEach(info => {
            if (info.district && structure[info.district]) {
                structure[info.district].add(info.ligne_nom);
            } else if (!info.district) {
                // Fallback si pas de district (mettons dans DSO par défaut ou un 'Autre')
                structure['DSO'].add(info.ligne_nom);
            }
        });
    }

    // Ajouter aussi les lignes de bus qui n'auraient pas été trouvées dans ligne_data (fallback)
    // (Optionnel, au cas où ligne_data n'est pas complet)
    const foundLines = new Set(linesInfo?.map(l => l.ligne_nom) || []);
    uniqueBusLines.forEach(l => {
        if (!foundLines.has(l)) {
            structure['DSO'].add(l); // Ou créer une catégorie 'Inconnu'
        }
    });
    // Conversion Sets -> Arrays triés
    linesByDistrict = {
        'DSE': Array.from(structure['DSE']).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''))),
        'DSO': Array.from(structure['DSO']).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))
    };
    loadingStructure = false;
  }

  // --- LOGIQUE RÉACTIVE ---
  
  // 1. Détection URL (Recherche Globale)
  $: {
      const q = $page.url.searchParams.get('search');
      if (q && q !== searchTerm) {
          searchTerm = q;
          // Réinitialiser la navigation manuelle pour passer en mode recherche
          selectedDistrict = null;
          selectedLines = [];
          loadSocietes();
      }
  }

  // Si on change de district, on vide la sélection de ligne pour éviter les confusions
  function selectDistrict(d) {
    if (selectedDistrict !== d) {
        selectedDistrict = d;
        selectedLines = []; // Reset lignes
        societesAffichees = [];
        // Reset résultats
        selectedSocieteIds = [];
        searchTerm = ""; // On quitte le mode recherche
    }
  }

  $: if (selectedLines) loadSocietes();
  $: if (selectedSocieteIds) loadDetails();

async function loadSocietes() {
    societesAffichees = [];
    selectedSocieteIds = [];
    contactsAffiches = [];
    chauffeursAffiches = [];

    // CAS 1: MODE RECHERCHE TEXTUELLE (Prioritaire)
    if (searchTerm) {
        loadingSocietes = true;
        const term = `%${searchTerm}%`;

        // 1. Chercher les sociétés par nom
        const { data: socs } = await supabase
            .from('societes_bus')
            .select('id')
            .ilike('nom', term);

        // 2. Chercher les chauffeurs (et récupérer l'ID de leur société)
       const { data: chauff } = await supabase
            .from('chauffeurs_bus')
            .select('societe_id')
            .ilike('nom', term);

        // 3. Chercher les contacts (et récupérer l'ID de leur société)
        const { data: cont } = await supabase
            .from('contacts_bus')
            .select('societe_id')
            .ilike('nom', term);

        // Fusionner tous les IDs trouvés (Set évite les doublons)
        const allIds = new Set([
            ...(socs?.map(s => s.id) || []),
            ...(chauff?.map(c => c.societe_id) || []),
            ...(cont?.map(c => c.societe_id) || [])
        ]);

        // Charger les sociétés correspondantes
        if (allIds.size > 0) {
            const { data } = await supabase
                .from('societes_bus')
                .select('id, nom')
                .in('id', [...allIds])
                .order('nom');
            
            societesAffichees = data || [];
            
            // Astuce UX : Si on a des résultats, on sélectionne automatiquement les sociétés
            // pour afficher directement les chauffeurs/contacts en bas
            selectedSocieteIds = societesAffichees.map(s => s.id);
        } else {
            societesAffichees = [];
        }

        loadingSocietes = false;
        return;
    }

    // CAS 2: MODE NAVIGATION PAR LIGNE (inchangé)
    if (selectedLines.length === 0) return;

    loadingSocietes = true;
    
    const { data: lignesData, error: lErr } = await supabase
      .from('lignes_bus')
      .select('societe_id')
      .in('ligne', selectedLines);
    if (lErr) { console.error(lErr); loadingSocietes = false; return; }

    const uniqueIds = [...new Set(lignesData.map(item => item.societe_id))];
    if (uniqueIds.length > 0) {
      const { data: societes, error: sErr } = await supabase
        .from('societes_bus')
        .select('id, nom')
        .in('id', uniqueIds)
        .order('nom');
      if (!sErr) societesAffichees = societes;
    }
    loadingSocietes = false;
  }

  async function loadDetails() {
    contactsAffiches = [];
    chauffeursAffiches = [];

    if (selectedSocieteIds.length === 0) return;
    loadingDetails = true;

    // Contacts
    const { data: contacts } = await supabase
      .from('contacts_bus')
      .select('id, nom, tel, societes_bus ( nom )')
      .in('societe_id', selectedSocieteIds);
    if (contacts) contactsAffiches = contacts;

    // Chauffeurs
    const { data: chauffeurs } = await supabase
      .from('chauffeurs_bus')
      .select('id, nom, tel, societes_bus ( nom )')
      .in('societe_id', selectedSocieteIds);
    if (chauffeurs) chauffeursAffiches = chauffeurs;

    loadingDetails = false;
  }

  // --- FONCTIONS UTILITAIRES ---
  function toggleLine(line) {
    searchTerm = ""; // On quitte le mode recherche
    if (selectedLines.includes(line)) {
      selectedLines = selectedLines.filter(l => l !== line);
    } else {
      selectedLines = [...selectedLines, line];
    }
  }

  function toggleSociete(id) {
    if (selectedSocieteIds.includes(id)) {
      selectedSocieteIds = selectedSocieteIds.filter(s => s !== id);
    } else {
      selectedSocieteIds = [...selectedSocieteIds, id];
    }
  }

  const cleanPhone = (tel) => tel ? tel.replace(/[^0-9]/g, '') : '';
  const formatPhone = (tel) => {
    const cleaned = cleanPhone(tel);
    // Format simple belge : 04XX/XX.XX.XX ou 0X/XX.XX.XX
    if (cleaned.length >= 10) {
         return cleaned.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1/$2.$3.$4');
    }
    return tel;
  };

  // --- GESTION MODALE ---
  async function openModal(societe = null) {
    isEditMode = !!societe;
    modalForm = { id: societe?.id || null, nom: societe?.nom || '', lignes: '', contacts: '', chauffeurs: '' };
    if (isEditMode) {
      const { data } = await supabase
        .from('societes_bus')
        .select(`lignes_bus (ligne), contacts_bus (nom, tel), chauffeurs_bus (nom, tel)`)
        .eq('id', societe.id)
        .single();
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
    // 1. Traitement des lignes et sauvegarde des nouveaux districts
    const linesToProcess = modalForm.lignes.split(',').map(s => s.trim()).filter(Boolean);
    // Pour chaque ligne, si elle n'est pas connue, on l'ajoute à ligne_data
    for (const line of linesToProcess) {
        if (!knownLinesMap[line]) {
            // C'est une nouvelle ligne
            const districtChoice = newLinesDistricts[line] || 'DSO'; // Par défaut DSO si rien choisi
            
            // Insertion dans ligne_data
            const { error: lineErr } = await supabase
                .from('ligne_data')
                .upsert({ 
                    ligne_nom: line, 
                    district: districtChoice,
                    gare: 'Gare Inconnue' // Valeur placeholder obligatoire si la colonne est non-nullable
                }, { onConflict: 'ligne_nom' });
            
            if (!lineErr) {
                // Mettre à jour le cache local pour ne plus la considérer comme inconnue
                knownLinesMap[line] = districtChoice;
            }
        }
    }

    // 2. Parsing des contacts/chauffeurs (existant)
    const parseList = (text) => text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const parts = line.split(',');
        return { nom: parts.shift()?.trim(), tel: parts.join(',').trim() };
    });
    const payload = {
      societe_id_to_update: modalForm.id,
      new_nom: modalForm.nom,
      new_lignes: linesToProcess, // Utiliser le tableau nettoyé
      new_contacts: parseList(modalForm.contacts),
      new_chauffeurs: parseList(modalForm.chauffeurs)
    };
    const { error } = await supabase.rpc('upsert_societe_bus', payload);
    modalLoading = false;
    if (error) {
      toast.error("Erreur : " + error.message);
    } else {
      toast.success(isEditMode ? "Société modifiée avec succès !" : "Société ajoutée avec succès !");
      showModal = false;
      newLinesDistricts = {};
      // Reset
      fetchLinesStructure(); // Rafraîchir les filtres
      loadSocietes();
    }
  }

  // Helper pour vérifier une ligne en direct dans la modale
  function getLineStatus(lineName) {
    const clean = lineName.trim();
    if (!clean) return null;
    if (knownLinesMap[clean]) return { status: 'known', district: knownLinesMap[clean] };
    return { status: 'unknown' };
  }

  async function deleteSociete(id, nom) {
    if (!confirm(`Supprimer ${nom} et tout son contenu ?`)) return;
    const { error } = await supabase.rpc('delete_societe_bus', { societe_id_to_delete: id });
    if (!error) {
        toast.success(`Société ${nom} supprimée.`);
        fetchLinesStructure();
        loadSocietes();
    } else {
        toast.error("Impossible de supprimer la société.");
    }
  }

  async function exportPDF() {
    if (selectedLines.length === 0) return toast.warning("Sélectionnez au moins une ligne.");
    
    const doc = new jsPDF();
    doc.text(`Export Bus - Lignes : ${selectedLines.join(', ')}`, 14, 15);
    // TODO: Ajouter le tableau complet si nécessaire
    doc.save('bus-export.pdf');
    toast.success("PDF exporté avec succès !");
  }

  // Styles communs Inputs
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none";
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";
</script>

<svelte:head>
  <title>BACO - Section Bus</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">

  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Bus class="w-8 h-8" />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire Bus</h1>
          <p class="text-gray-500 text-sm mt-1">Gérer les lignes de substitution et contacts.</p>
        </div>
    </div>
    
    <div class="flex gap-3">
        {#if isAdmin}
            <button 
  on:click={() => openModal()} 
  class="btn-add px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group border shadow-lg"
  style="--primary-rgb: var(--color-primary);"
>
  <Plus class="w-5 h-5 group-hover:rotate-90 transition-transform" />
  <span class="font-semibold hidden sm:inline">Ajouter</span>
</button>
        {/if}
    </div>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6" in:fly={{ y: 20, duration: 600, delay: 100 }}>
    
    <div class="lg:col-span-3 space-y-4">
        <div class="bg-black/20 border border-white/5 rounded-2xl p-5 h-full">
            <h3 class="text-xs font-bold uppercase text-gray-500 mb-4 flex items-center gap-2">
                <Filter class="w-4 h-4" /> District
            </h3>
            
            {#if loadingStructure}
                <div class="flex justify-center py-4"><Loader2 class="animate-spin text-gray-600"/></div>
            {:else}
                <div class="flex flex-col gap-2">
                    {#each districts as district}
                        <button 
                            on:click={() => selectDistrict(district)}
                            class="w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 flex justify-between items-center group
                            {selectedDistrict === district 
                                ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' 
                                : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 hover:border-white/10'}"
                        >
                            <span class="font-bold tracking-wide">{district}</span>
                            {#if selectedDistrict === district}
                                <div class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <div class="lg:col-span-9 space-y-4">
        <div class="bg-black/20 border border-white/5 rounded-2xl p-5 min-h-[140px]">
            <h3 class="text-xs font-bold uppercase text-gray-500 mb-4 flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                Lignes disponibles {#if selectedDistrict}({selectedDistrict}){/if}
            </h3>

            {#if !selectedDistrict}
                <div class="h-20 flex items-center justify-center text-gray-600 italic">
                    <p>← Veuillez d'abord sélectionner un district.</p>
                </div>
            {:else if linesByDistrict[selectedDistrict].length === 0}
                <div class="h-20 flex items-center justify-center text-gray-600 italic">
                    <p>Aucune ligne de bus enregistrée pour ce district.</p>
                </div>
            {:else}
                <div class="flex flex-wrap gap-3">
                    {#each linesByDistrict[selectedDistrict] as line}
                        <button 
                        on:click={() => toggleLine(line)}
                        class="flex items-center space-x-2 px-4 py-2 border rounded-full transition-all duration-300 text-sm font-medium shadow-sm hover:scale-105 active:scale-95
                        {selectedLines.includes(line) 
                            ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}"
                        >
                        {#if selectedLines.includes(line)}
                            <Check class="w-3.5 h-3.5 text-blue-400" />
                        {/if}
                        <span>{line}</span>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
  </div>

  <div class="space-y-8 min-h-[400px]">
    
    {#if selectedLines.length === 0 && !searchTerm}
      <div class="flex flex-col items-center justify-center h-48 text-gray-600 bg-black/10 rounded-2xl border border-dashed border-white/5 mt-8" in:fade>
        <p>Sélectionnez une ligne pour voir les sociétés.</p>
      </div>

    {:else if loadingSocietes}
      <div class="flex flex-col items-center justify-center h-64 text-gray-500">
        <Loader2 class="w-10 h-10 animate-spin text-blue-500/50 mb-3"/>
        <p>Recherche des sociétés...</p>
      </div>

    {:else if societesAffichees.length === 0}
      <div class="flex flex-col items-center justify-center h-64 text-gray-500 bg-black/20 rounded-2xl border border-dashed border-white/10">
        <p>Aucune société trouvée pour ces lignes (ou recherche).</p>
      </div>

    {:else}
      <div in:fly={{ y: 20, duration: 400 }}>
        <h3 class="text-xl font-bold text-gray-200 mb-4 flex items-center gap-2">
            <div class="w-1 h-6 bg-blue-500 rounded-full"></div> Sociétés concernées {#if searchTerm}(Recherche: "{searchTerm}"){/if}
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each societesAffichees as societe}
            <div class="group flex items-center justify-between px-4 py-3 bg-black/20 border border-white/5 hover:border-blue-500/20 rounded-xl transition-all duration-200 cursor-pointer {selectedSocieteIds.includes(societe.id) ? 'bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20' : ''}">
              
              <label class="flex items-center space-x-3 cursor-pointer flex-grow mr-2 w-full h-full">
                <input 
                  type="checkbox" 
                  checked={selectedSocieteIds.includes(societe.id)}
                  on:change={() => toggleSociete(societe.id)}
                  class="rounded text-blue-600 focus:ring-blue-500 w-5 h-5 bg-black/40 border-gray-600 cursor-pointer"
                >
                <span class="font-bold text-gray-300 group-hover:text-white transition-colors">{societe.nom}</span>
              </label>

              {#if isAdmin}
                <div class="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button on:click={() => openModal(societe)} class="p-2 text-gray-400 hover:text-blue-400 hover:bg-white/10 rounded-lg transition-colors">
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button on:click={() => deleteSociete(societe.id, societe.nom)} class="p-2 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              {/if}

            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if selectedSocieteIds.length > 0}
      {#if loadingDetails}
        <div class="flex justify-center p-10"><Loader2 class="w-8 h-8 animate-spin text-blue-500/50"/></div>
      {:else}
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8" in:fly={{ y: 20, duration: 400 }}>
          
            {#if contactsAffiches.length > 0}
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 h-fit">
                <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                    <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> Contacts Bureaux
                </h3>
                <ul class="space-y-3">
                {#each contactsAffiches as c}
                    <li class="bg-white/5 rounded-xl border border-white/5 p-3 flex justify-between items-center hover:bg-white/10 transition-colors group">
                    <div>
                        <span class="block font-bold text-gray-200">{c.nom}</span>
                        <span class="text-xs text-gray-500 uppercase tracking-wide">{c.societes_bus.nom}</span>
                    </div>
                    <a href="etrali:{cleanPhone(c.tel)}" class="flex items-center gap-2 text-green-400 hover:text-green-300 font-mono bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20 group-hover:bg-green-500/20 transition-all">
                        <Phone size={14} /> {formatPhone(c.tel)}
                    </a>
                    </li>
                {/each}
                </ul>
            </div>
            {/if}

            {#if chauffeursAffiches.length > 0}
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 h-fit">
                <h3 class="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Chauffeurs / Garde
                </h3>
                <ul class="space-y-3">
                {#each chauffeursAffiches as c}
                    <li class="bg-white/5 rounded-xl border border-white/5 p-3 flex justify-between items-center hover:bg-white/10 transition-colors group">
                    <div>
                        <span class="block font-bold text-gray-200">{c.nom}</span>
                        <span class="text-xs text-gray-500 uppercase tracking-wide">{c.societes_bus.nom}</span>
                    </div>
                    <a href="etrali:{cleanPhone(c.tel)}" class="flex items-center gap-2 text-yellow-400 hover:text-yellow-300 font-mono bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20 group-hover:bg-yellow-500/20 transition-all">
                        <Phone size={14} /> {formatPhone(c.tel)}
                    </a>
                    </li>
                {/each}
                </ul>
            </div>
            {/if}
        </div>

      {/if}
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
          {isEditMode ? 'Modifier la société' : 'Nouvelle société'}
        </h3>
        <button on:click={() => showModal = false} class="text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-white/5 transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-6 space-y-5 overflow-y-auto custom-scrollbar">
        <div>
          <label class={labelClass}>Nom de la société</label>
          <input bind:value={modalForm.nom} type="text" class={inputClass}>
        </div>
       
        <div>
          <label class={labelClass}>Lignes desservies</label>
          <input 
            bind:value={modalForm.lignes} 
            type="text" 
            placeholder="L.37, L.162..." 
            class={inputClass}
          >
          
          {#if modalForm.lignes}
            <div class="mt-3 space-y-2">
                {#each modalForm.lignes.split(',') as rawLine}
                    {@const line = rawLine.trim()}
                    {#if line}
                        {@const status = getLineStatus(line)}
                        
                        <div class="flex items-center justify-between p-2 rounded-lg border {status.status === 'known' ? 'border-green-500/20 bg-green-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}">
                            <div class="flex items-center gap-2">
                                <Bus class="w-4 h-4 {status.status === 'known' ? 'text-green-400' : 'text-yellow-400'}" />
                                <span class="font-mono text-sm text-gray-200">{line}</span>
                            </div>

                            {#if status.status === 'known'}
                                <span class="text-xs font-bold px-2 py-1 rounded bg-black/40 text-gray-300 border border-white/10">
                                    {status.district}
                                </span>
                            {:else}
                                <div class="flex items-center gap-2 bg-black/40 rounded-lg p-1 border border-white/10">
                                    <span class="text-[10px] text-yellow-500 font-bold px-1 uppercase hidden sm:block">Nouveau</span>
                                    <div class="flex">
                                        <button 
                                            on:click={() => newLinesDistricts[line] = 'DSE'}
                                            class="px-2 py-0.5 text-xs rounded transition-colors {newLinesDistricts[line] === 'DSE' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}"
                                        >DSE</button>
                                        <div class="w-px bg-white/10 mx-1"></div>
                                        <button 
                                            on:click={() => newLinesDistricts[line] = 'DSO'}
                                            class="px-2 py-0.5 text-xs rounded transition-colors {(!newLinesDistricts[line] || newLinesDistricts[line] === 'DSO') ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}"
                                        >DSO</button>
                                    </div>
                                </div>
                            {:else}
                            {/if}
                        </div>
                    {/if}
                {/each}
            </div>
          {/if}
          <p class="text-[10px] text-gray-500 mt-1.5 ml-1">
            * Les lignes inconnues seront automatiquement ajoutées au district sélectionné.
          </p>
        </div>


        <div>
          <label class={labelClass}>Contacts (Nom, Tel - un par ligne)</label>
          <textarea bind:value={modalForm.contacts} rows="3" class="{inputClass} font-mono resize-none"></textarea>
        </div>
        <div>
          <label class={labelClass}>Chauffeurs (Nom, Tel - un par ligne)</label>
          <textarea bind:value={modalForm.chauffeurs} rows="5" class="{inputClass} font-mono resize-none"></textarea>
        </div>
      </div>

      <div class="flex justify-end items-center px-6 py-4 bg-white/[0.02] border-t border-white/10 gap-3 relative">
        <button on:click={() => showModal = false} class="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 hover:text-white transition-all">
          Annuler
        </button>
      <button 
  on:click={handleSubmit} 
  disabled={modalLoading} 
  class="btn-submit px-4 py-2 text-white rounded-xl flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
  style="--primary-rgb: var(--color-primary);"
>
  {#if modalLoading}
    <Loader2 class="w-4 h-4 animate-spin mr-2"/>
  {/if}
  Enregistrer
</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .btn-add {
    /* Fond léger basé sur le thème (20% d'opacité) */
    background-color: rgba(var(--primary-rgb), 0.2);
    /* Bordure assortie (30% d'opacité) */
    border-color: rgba(var(--primary-rgb), 0.3);
    /* Texte à la couleur du thème */
    color: rgb(var(--primary-rgb));
    /* Ombre légère basée sur la couleur du thème */
    shadow-color: rgba(var(--primary-rgb), 0.1);
  }

  .btn-add:hover {
    /* Augmentation de l'opacité au survol */
    background-color: rgba(var(--primary-rgb), 0.3);
    border-color: rgba(var(--primary-rgb), 0.5);
    /* Lueur (glow) dynamique */
    box-shadow: 0 10px 15px -3px rgba(var(--primary-rgb), 0.2);
  }

  .btn-add:active {
    transform: scale(0.95);
  }

  .btn-submit {
    /* Utilise la couleur primaire du thème avec 80% d'opacité */
    background-color: rgba(var(--primary-rgb), 0.8);
    /* Lueur (glow) dynamique basée sur le thème actuel */
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