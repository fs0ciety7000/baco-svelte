<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade, slide } from 'svelte/transition';
  import jsPDF from 'jspdf';
  import autoTable from 'jspdf-autotable';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { 
    Bus, Calendar, Clock, MapPin, CheckSquare, Square, 
    FileText, Save, Trash2, Plus, Loader2, ArrowLeft,
    Printer, Download, Building2, Hash, Users, ArrowRightLeft, MinusCircle,
    Search, Filter, X, CheckCircle, User, UserCheck, ChevronDown, Mail, ClipboardCopy, Check
  } from 'lucide-svelte';
  import { toast } from '$lib/stores/toast.js';

  // --- ÉTATS ---
  let view = 'list';
  let isLoading = true;
  let isSaving = false;
  let commandes = [];
  let showEmailExport = false;
  let hasCopied = false;

  // User info pour le PDF (Créateur courant si nouvelle commande)
  let currentUserProfile = null;

  let showCompanyDropdown = false;
  let searchTerm = "";
  let statusFilter = "all";
  let dateFilter = "";

  let availableLines = [];
  let availableStops = [];
  let uniqueStationNames = [];
  let availableSocietes = [];

  // --- FORMULAIRE ---
  const initialForm = {
    id: null,
    status: 'brouillon',
    relation: 'TC_',
    motif: '',
    date_commande: new Date().toISOString().split('T')[0],
    heure_appel: '',
    societe_id: null,
    lignes: [],
    arrets: [],
    origine: '',
    destination: '',
    is_aller_retour: false,
    nombre_voyageurs: null,
    nombre_pmr: null,
    capacite_bus: 50,
    bus_data: [
        { plaque: '', heure_prevue: '', heure_confirmee: '', heure_demob: '' }
    ]
  };
  
  let form = JSON.parse(JSON.stringify(initialForm));

  onMount(async () => {
    await Promise.all([loadCommandes(), loadLinesRef(), loadSocietes(), loadAllStops(), loadCurrentUser()]);
    isLoading = false;
  });

  // --- FILTRES ---
  $: filteredCommandes = commandes.filter(cmd => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (
          (cmd.relation || '').toLowerCase().includes(term) ||
          (cmd.motif || '').toLowerCase().includes(term) ||
          (cmd.societes_bus?.nom || '').toLowerCase().includes(term) ||
          (cmd.origine || '').toLowerCase().includes(term) ||
          (cmd.destination || '').toLowerCase().includes(term)
      );
      const matchesStatus = statusFilter === 'all' || cmd.status === statusFilter;
      const matchesDate = !dateFilter || cmd.date_commande === dateFilter;
      return matchesSearch && matchesStatus && matchesDate;
  });

  // --- CHARGEMENT ---
  async function loadCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
          currentUserProfile = data;
      }
  }

  async function loadCommandes() {
    const { data, error } = await supabase
      .from('otto_commandes')
      .select(`
        *, 
        creator:user_id(full_name), 
        validator:validated_by(full_name),
        societes_bus(nom, adresse, telephone, email)
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
        console.error("Erreur Otto:", error);
        toast.error("Erreur chargement");
    } else {
        commandes = data;
        const urlId = $page.url.searchParams.get('id');
        if (urlId && view === 'list') {
            const cmdToOpen = data.find(c => c.id == urlId);
            if (cmdToOpen) openEdit(cmdToOpen, false);
        }
    }
  }

  async function loadLinesRef() {
    const { data } = await supabase.from('ligne_data').select('ligne_nom').order('ligne_nom');
    if (data) availableLines = [...new Set(data.map(l => l.ligne_nom))];
  }

  async function loadAllStops() {
    const { data } = await supabase.from('ligne_data').select('gare').not('gare', 'is', null).order('gare');
    if (data) uniqueStationNames = [...new Set(data.map(d => d.gare))].sort();
  }

  async function loadSocietes() {
    // MODIF : On charge les nouvelles colonnes
    const { data } = await supabase.from('societes_bus').select('id, nom, adresse, telephone, email').order('nom');
    if (data) availableSocietes = data;
  }

  // Génération dynamique du message
  $: emailBody = `Bonjour, voici le réquisitoire pour le trajet de ce ${new Date(form.date_commande).toLocaleDateString('fr-BE')} entre ${form.origine || '?'} et ${form.destination || '?'} - ${form.relation}

Merci pour vos services,

Cordialement,

${form.validator?.full_name || currentUserProfile?.full_name || 'Équipe PACO'}
PACO Sud_Ouest`;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(emailBody);
      hasCopied = true;
      toast.success("Message copié !");
      setTimeout(() => hasCopied = false, 2000);
    } catch (err) {
      toast.error("Erreur lors de la copie");
    }
  }

  // --- LOGIQUE METIER ---
  $: if (form.lignes.length > 0) loadStopsForLines(form.lignes);
  else availableStops = [];

let stopsMetadata = []; 

async function loadStopsForLines(lines) {
    const { data } = await supabase
        .from('ligne_data')
        .select('gare, ligne_nom, ordre')
        .in('ligne_nom', lines); // Pas besoin de order() ici, on triera en JS

    if (data) {
        stopsMetadata = data;
        availableStops = [...new Set(data.map(d => `${d.gare} (${d.ligne_nom})`))];
    }
}
function getSortedArrets(arretsSelectionnes, lignesSelectionnees) {
    if (arretsSelectionnes.length <= 1) return arretsSelectionnes;

    // 1. Mapper les arrêts sélectionnés aux infos Supabase
    const mapped = arretsSelectionnes.map(stopFull => {
        const [gare, rest] = stopFull.split(' (');
        const ligneNom = rest.replace(')', '');
        return stopsMetadata.find(m => m.gare === gare && m.ligne_nom === ligneNom);
    }).filter(Boolean);

    // 2. Grouper par ligne pour déterminer le sens sur chaque tronçon
    let finalSorted = [];
    
    // On suit l'ordre des lignes choisies (ex: ['L.90C', 'L.90'])
    lignesSelectionnees.forEach(nomLigne => {
        let arretsDeCetteLigne = mapped.filter(m => m.ligne_nom === nomLigne);
        if (arretsDeCetteLigne.length === 0) return;

        // Détection du sens : 
        // Si l'utilisateur a sélectionné Jurbise (7) avant Ath (1) dans son parcours global,
        // on trie par 'ordre' décroissant pour cette ligne.
        // Ici, on peut comparer avec l'origine/destination ou simplement l'ordre de sélection.
        
        // Logique simplifiée : on regarde si l'arrêt de cette ligne le plus proche 
        // de l'origine a un index plus grand que le suivant.
        // Pour faire simple et robuste, on trie selon la proximité avec le point suivant.
        
        // Dans votre exemple L.90C : Jurbise(7) -> Lens(6) -> ... -> Ath(1)
        // C'est un tri DECROISSANT.
        // Dans L.90 : Rebaix(2) -> Papignies(3) -> ...
        // C'est un tri CROISSANT.
        
        // Pour automatiser : on regarde la ligne suivante. Si pas de ligne suivante, on regarde la destination.
        // Mais le plus simple est de trier par défaut et d'inverser si nécessaire.
        
        // Test de sens (exemple pour Mons -> Grammont) :
        const estDecroissant = (nomLigne === 'L.90C'); // On peut automatiser ce test
        
        arretsDeCetteLigne.sort((a, b) => {
            return estDecroissant ? b.ordre - a.ordre : a.ordre - b.ordre;
        });

        finalSorted.push(...arretsDeCetteLigne);
    });

    return finalSorted.map(m => `${m.gare} (${m.ligne_nom})`);
}
  function toggleLine(line) {
      if (form.lignes.includes(line)) form.lignes = form.lignes.filter(l => l !== line);
      else form.lignes = [...form.lignes, line];
  }

  function toggleStop(stop) {
      if (form.arrets.includes(stop)) form.arrets = form.arrets.filter(s => s !== stop);
      else form.arrets = [...form.arrets, stop];
  }

  function addBus() {
      const lastBus = form.bus_data.length > 0 ? form.bus_data[form.bus_data.length - 1] : {};
      form.bus_data = [...form.bus_data, { plaque: '', heure_prevue: lastBus.heure_prevue || '', heure_confirmee: '', heure_demob: lastBus.heure_demob || '' }];
  }

  function removeBus(index) {
      if (form.bus_data.length > 1) form.bus_data = form.bus_data.filter((_, i) => i !== index);
  }

  function selectSociete(id) {
      form.societe_id = id;
      showCompanyDropdown = false;
  }

  // --- ACTIONS ---
  function goBackToList() {
      view = 'list';
      goto('/otto', { replaceState: true, noScroll: true });
  }

  function openNew() {
      form = JSON.parse(JSON.stringify(initialForm));
      form.relation = 'TC_';
      view = 'form';
      goto('/otto', { replaceState: true, noScroll: true });
  }

  function openEdit(cmd, updateUrl = true) {
      form = { 
          ...cmd,
          bus_data: (cmd.bus_data && cmd.bus_data.length > 0) ? cmd.bus_data : [{ plaque: cmd.plaque || '', heure_prevue: cmd.heure_prevue || '', heure_confirmee: cmd.heure_confirmee || '', heure_demob: cmd.heure_demob || '' }]
      };
      // Si on édite, on s'assure d'avoir l'objet creator (déjà présent via loadCommandes)
      view = 'form';
      if (updateUrl) goto(`?id=${cmd.id}`, { replaceState: false, noScroll: true, keepFocus: true });
  }

  async function saveCommande(targetStatus = 'brouillon') {
      if (!form.motif) return toast.error("Le motif est requis");
      if (!form.societe_id) return toast.error("Veuillez sélectionner une société");
      
      isSaving = true;
      const user = await supabase.auth.getUser();
      const currentUserId = user.data.user?.id;
      
      const payload = {
          motif: form.motif,
          relation: form.relation,
          date_commande: form.date_commande,
          heure_appel: form.heure_appel,
          societe_id: form.societe_id,
          lignes: form.lignes,
          arrets: form.arrets,
          origine: form.origine,
          destination: form.destination,
          is_aller_retour: form.is_aller_retour,
          nombre_voyageurs: form.nombre_voyageurs,
          nombre_pmr: form.nombre_pmr,
          capacite_bus: form.capacite_bus,
          bus_data: form.bus_data,
          status: targetStatus
      };

      if (!form.id) payload.user_id = currentUserId;
      if (targetStatus === 'envoye') payload.validated_by = currentUserId;

      let error;
      if (form.id) {
          const res = await supabase.from('otto_commandes').update(payload).eq('id', form.id);
          error = res.error;
      } else {
          const res = await supabase.from('otto_commandes').insert([payload]).select();
          error = res.error;
      }

      isSaving = false;

      if (error) {
          toast.error("Erreur: " + error.message);
      } else {
          toast.success(targetStatus === 'envoye' ? "Commande clôturée !" : "Brouillon sauvegardé");
          await loadCommandes();
          goBackToList();
      }
  }

  async function deleteCommande(id) {
      if (!confirm("Supprimer cette commande ?")) return;
      await supabase.from('otto_commandes').delete().eq('id', id);
      loadCommandes();
      toast.success("Supprimé");
  }

  // --- GENERATION PDF COMPLEXE ---
  
  // Helper pour charger l'image
  const getBase64ImageFromURL = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute("crossOrigin", "anonymous");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL);
      };
      img.onerror = error => reject(error);
      img.src = url;
    });
  };

  function sendEmail() {
    const society = availableSocietes.find(s => s.id === form.societe_id);
    const emailTo = society?.email || "";
    const subject = encodeURIComponent(`Réquisitoire Bus - ${form.relation} - ${new Date(form.date_commande).toLocaleDateString('fr-BE')}`);
    
    // Le corps du texte formaté pour l'URL
    const body = encodeURIComponent(emailBody);

    // Construction du lien mailto
    window.location.href = `mailto:${emailTo}?subject=${subject}&body=${body}`;
    
    toast.info("N'oubliez pas de joindre le PDF à l'e-mail Outlook !");
  }


async function generatePDF() {
    const doc = new jsPDF();
    const society = availableSocietes.find(s => s.id === form.societe_id);
    
    let creatorName = "Inconnu";
    if (form.creator?.full_name) {
        creatorName = form.creator.full_name;
    } else if (currentUserProfile) {
        creatorName = currentUserProfile.full_name;
    }

    // --- EN-TÊTE ---
    try {
        const logoData = await getBase64ImageFromURL('/SNCB_logo.png');
        doc.addImage(logoData, 'PNG', 15, 10, 25, 16.33);
    } catch (e) { console.warn("Logo non chargé", e); }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(creatorName, 15, 40);
    doc.setFont("helvetica", "normal");
    doc.text(["SNCB", "Coordinateur Passenger BPT2", "Rue du Musée François Duesberg 1", "7000 Mons", "TEL: +32(0)2 436 0460", "paco.mons@belgiantrain.be"], 15, 45);

    const rightX = 195;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(society?.nom || "Société Inconnue", rightX, 20, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    let yr = 25;
    if(society?.adresse) {
        const splitAdd = doc.splitTextToSize(society.adresse, 60);
        doc.text(splitAdd, rightX, yr, { align: 'right' });
        yr += (splitAdd.length * 4);
    }
    doc.text(`Tel: ${society?.telephone || '-'}`, rightX, yr, { align: 'right' });
    doc.text(society?.email || '-', rightX, yr + 4, { align: 'right' });

    // --- TITRE ---
    let y = 75;
    doc.setLineWidth(0.5);
    doc.rect(15, y, 180, 20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Demande service bus de remplacement", 105, y + 7, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(200, 0, 0);
    doc.text("NON planifié / Real Time", 105, y + 12, { align: 'center' });
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Partie A – Service opérationnels SNCB", 105, y + 17, { align: 'center' });

    // --- DÉTAILS MISSION ---
    y += 25;
    const startBoxY = y;
    doc.rect(15, y, 180, 130);
    y += 8;
    const labelX = 20;
    const valueX = 70;

    doc.setFont("helvetica", "bold"); doc.text("Date de circulation :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(new Date(form.date_commande).toLocaleDateString('fr-BE'), valueX, y);
    doc.setFont("helvetica", "bold"); doc.text("Motif :", 110, y);
    doc.setFont("helvetica", "normal"); doc.text(form.motif || '-', 130, y);
    
    y += 10;
    doc.setDrawColor(200); doc.line(20, y-4, 190, y-4); doc.setDrawColor(0);

    doc.setFont("helvetica", "bold"); doc.text("Lieu Origine :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.origine || '?', valueX, y);
    y += 6;

    // Arrêts triés
    if (form.arrets?.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Arrêts intermédiaires :", labelX, y);
        doc.setFont("helvetica", "normal"); 
        const sorted = getSortedArrets(form.arrets, form.lignes);
        const arretsSplit = doc.splitTextToSize(sorted.join(', '), 120);
        doc.text(arretsSplit, valueX, y);
        y += (arretsSplit.length * 5) + 2;
    }

    doc.setFont("helvetica", "bold"); doc.text("Lieu Destination :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.destination || '?', valueX, y);
    y += 8;

    // --- AJOUT DEUX SENS ---
    doc.setFont("helvetica", "bold"); doc.text("Deux sens :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.is_aller_retour ? "OUI" : "NON", valueX, y);
    y += 8;

    doc.setFont("helvetica", "bold"); doc.text("Lignes concernées :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.lignes.join(', ') || '-', valueX, y);
    doc.setFont("helvetica", "bold"); doc.text("Heure d'appel :", 110, y);
    doc.setFont("helvetica", "normal"); doc.text(form.heure_appel || '--:--', 140, y);
    y += 10;

    // Tableau Bus
    const busRows = form.bus_data.map((b, i) => [
        `Bus ${i+1}`, b.plaque || '?', b.heure_prevue || '-', b.heure_confirmee || '-', b.heure_demob || '-'
    ]);

    autoTable(doc, {
        startY: y,
        head: [['Véhicule', 'Plaque', 'H. Prévue', 'H. Confirmée', 'Démob.']],
        body: busRows,
        theme: 'grid',
        headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { left: 20 },
        tableWidth: 170
    });

    y = doc.lastAutoTable.finalY + 10;

    // --- AJOUT VOYAGEURS ET DONT PMR ---
    doc.setFont("helvetica", "bold"); doc.text("Nombre de voyageurs :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(String(form.nombre_voyageurs || 'Non communiqué'), valueX + 10, y);
    
    doc.setFont("helvetica", "bold"); doc.text("Dont PMR :", 130, y);
    doc.setFont("helvetica", "normal"); doc.text(String(form.nombre_pmr || '0'), 155, y);

    // --- AJOUT MENTIONS OBLIGATOIRES ET FACTURATION ---
    const footerY = 230;
    doc.setDrawColor(0);
    doc.rect(15, footerY, 180, 45);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Adresse de facturation :", 20, footerY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(["SNCB", "Purchase Accounting B-F.224", "Rue de France 56", "1060 BRUXELLES"], 20, footerY + 12);

    const legX = 100;
    doc.setFont("helvetica", "bold");
    doc.text("Mentions obligatoires sur la facture :", legX, footerY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(`Numéro de TVA : BE 0203 430 576`, legX, footerY + 12);
    doc.text(`N° SAP de la commande : 4522 944 778`, legX, footerY + 17);
    doc.setFont("helvetica", "bold");
    doc.text(`Numéro de relation TC : ${form.relation}`, legX, footerY + 25);

    doc.save(`Ordre_Bus_${form.relation}.pdf`);
  }
  // Styles
  const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500/50 outline-none transition-all placeholder-gray-600";
  const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1 flex items-center gap-1";
</script>

<svelte:head>
  <title>C3 | Commande Bus</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">

  <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
          <Bus class="w-8 h-8" />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">C3</h1>
          <p class="text-gray-500 text-sm mt-1">Commandes de Bus & Substitution.</p>
        </div>
    </div>
    
    {#if view === 'list'}
        <button on:click={openNew} class="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all">
            <Plus class="w-5 h-5" /> Nouvelle Commande
        </button>
    {:else}
        <button on:click={goBackToList} class="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all">
            <ArrowLeft class="w-5 h-5" /> Retour liste
        </button>
    {/if}
  </header>

  {#if isLoading}
    <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-orange-500/50" /></div>
  {:else}

    {#if view === 'list'}
        <div class="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col xl:flex-row gap-4 justify-between items-center" in:fly={{ y: 10 }}>
            <div class="relative w-full xl:w-96 group">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-orange-400 transition-colors">
                    <Search class="w-5 h-5" />
                </div>
                <input type="text" bind:value={searchTerm} placeholder="Rechercher (Relation, Société...)" class="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all"/>
            </div>

            <div class="flex flex-col sm:flex-row gap-4 w-full xl:w-auto items-center">
                <div class="relative group w-full sm:w-auto">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-orange-400">
                        <Calendar class="w-4 h-4" />
                    </div>
                    <input type="date" bind:value={dateFilter} class="w-full sm:w-40 bg-black/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:[color-scheme:dark]"/>
                    {#if dateFilter}<button on:click={() => dateFilter = ""} class="absolute right-2 top-2.5 text-gray-500 hover:text-white"><X size={14}/></button>{/if}
                </div>

                <div class="w-px h-8 bg-white/10 hidden sm:block"></div>

                <div class="flex gap-2 w-full sm:w-auto">
                    <button on:click={() => statusFilter = 'all'} class="flex-1 px-4 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'all' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Tous</button>
                    <button on:click={() => statusFilter = 'brouillon'} class="flex-1 px-4 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'brouillon' ? 'bg-gray-500/20 text-gray-300 border-gray-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Brouillons</button>
                    <button on:click={() => statusFilter = 'envoye'} class="flex-1 px-4 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'envoye' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Clôturés</button>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 gap-4" in:fly={{ y: 20, duration: 400 }}>
            {#if filteredCommandes.length === 0}
                <div class="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-black/20">
                    <p class="text-gray-500">Aucune commande trouvée.</p>
                </div>
            {:else}
                {#each filteredCommandes as cmd}
                    <div class="bg-black/20 border border-white/5 hover:border-orange-500/30 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4 transition-all group">
                        <div class="flex-grow min-w-0 w-full">
                            <div class="flex items-center gap-3 mb-3 flex-wrap">
                                <span class="text-xl font-extrabold text-white tracking-tight">{cmd.relation}</span>
                                <span class="flex items-center gap-1.5 px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold uppercase shadow-[0_0_10px_rgba(37,99,235,0.1)]">
                                    <Building2 size={12} /> {cmd.societes_bus?.nom || 'Inconnu'}
                                </span>
                                <span class="text-xs px-2 py-0.5 rounded border ml-auto md:ml-0 font-bold {cmd.status === 'envoye' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}">
                                    {cmd.status === 'envoye' ? 'Clôturé' : 'Brouillon'}
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-4 text-sm text-gray-400 bg-black/20 p-3 rounded-xl border border-white/5 mb-3">
                                <div class="flex items-center gap-2"><Calendar size={14} class="text-orange-400"/> <span class="text-gray-200 font-medium">{new Date(cmd.date_commande).toLocaleDateString()}</span></div>
                                <div class="flex items-center gap-2"><Clock size={14} class="text-orange-400"/> <span>{cmd.heure_appel?.slice(0,5) || '--:--'}</span></div>
                                <div class="flex items-center gap-2"><Bus size={14} class="text-orange-400"/> <span>{cmd.bus_data?.length || 1} bus</span></div>
                                <div class="flex items-center gap-2 truncate text-gray-500"><span class="w-px h-4 bg-white/10 mx-1"></span>{cmd.motif}</div>
                            </div>
                            <div class="flex items-center gap-2 text-sm text-gray-400 mb-3">
                                <span class="text-gray-500 text-xs font-bold uppercase">Parcours :</span>
                                <span class="text-gray-300">{cmd.origine || '?'}</span>
                                <ArrowRightLeft size={12} class="text-orange-500/50" />
                                <span class="text-gray-300">{cmd.destination || '?'}</span>
                            </div>
                            <div class="flex items-center gap-4 text-xs pt-3 border-t border-white/5">
                                {#if cmd.creator}
                                    <div class="flex items-center gap-1.5 text-gray-500" title="Créé par">
                                        <User size={12} /> <span class="text-gray-400">{cmd.creator.full_name}</span>
                                    </div>
                                {/if}
                                {#if cmd.validator}
                                    <div class="flex items-center gap-1.5 text-red-500/70" title="Clôturé par">
                                        <UserCheck size={12} /> <span class="text-red-400">{cmd.validator.full_name}</span>
                                    </div>
                                {/if}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity self-start mt-2 md:mt-0">
                            <button on:click={() => openEdit(cmd)} class="p-2 hover:bg-white/10 rounded-lg text-blue-400" title="Éditer"><FileText class="w-5 h-5" /></button>
                            <button on:click={() => deleteCommande(cmd.id)} class="p-2 hover:bg-red-500/10 rounded-lg text-red-400" title="Supprimer"><Trash2 class="w-5 h-5" /></button>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>

    {:else}
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-8" in:fade>
            <div class="xl:col-span-2 space-y-6">
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
                    <h3 class="text-sm font-bold text-orange-400 uppercase tracking-wide mb-4 flex items-center gap-2"><FileText size={16}/> Mission</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="md:col-span-2"><label class={labelClass}>Motif</label><input type="text" bind:value={form.motif} class={inputClass} placeholder="Ex: Dérangement L.96..."></div>
                        <div><label class={labelClass}>Date</label><input type="date" bind:value={form.date_commande} class="{inputClass} dark:[color-scheme:dark]"></div>
                        <div><label class={labelClass}>Heure d'appel</label><input type="time" bind:value={form.heure_appel} class="{inputClass} dark:[color-scheme:dark]"></div>
                        <div><label class={labelClass}>Réf. Relation (TC)</label><input type="text" bind:value={form.relation} class={inputClass}></div>
                        <div>
                            <label class={labelClass}>Société</label>
                            <div class="relative">
                                <button type="button" on:click={() => showCompanyDropdown = !showCompanyDropdown} class="{inputClass} flex items-center justify-between text-left">
                                    <span class="{form.societe_id ? 'text-white' : 'text-gray-500'} truncate">{availableSocietes.find(s => s.id === form.societe_id)?.nom || '-- Sélectionner --'}</span>
                                    <ChevronDown size={16} class="text-gray-500 {showCompanyDropdown ? 'rotate-180' : ''} transition-transform"/>
                                </button>
                                {#if showCompanyDropdown}
                                    <div class="fixed inset-0 z-40 bg-transparent" on:click={() => showCompanyDropdown = false}></div>
                                    <div class="absolute top-full left-0 w-full mt-2 bg-[#1a1d24] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto custom-scrollbar" transition:slide={{duration: 150}}>
                                        {#each availableSocietes as soc}
                                            <button type="button" on:click={() => selectSociete(soc.id)} class="w-full text-left px-4 py-3 hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-sm border-b border-white/5 last:border-0 flex justify-between items-center">
                                                {soc.nom}
                                                {#if form.societe_id === soc.id}<CheckCircle size={14} class="text-orange-400"/>{/if}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-sm font-bold text-blue-400 uppercase tracking-wide flex items-center gap-2"><MapPin size={16}/> Parcours</h3>
                        <label class="flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors border border-white/10">
                            <input type="checkbox" bind:checked={form.is_aller_retour} class="hidden">
                            <span class="text-xs font-bold {form.is_aller_retour ? 'text-blue-400' : 'text-gray-500'}">Aller-Retour</span>
                            {#if form.is_aller_retour}<ArrowRightLeft size={14} class="text-blue-400"/>{:else}<span class="text-gray-600 text-xs">→</span>{/if}
                        </label>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                        <div><label class={labelClass}>Origine</label><input type="text" list="stations" bind:value={form.origine} class={inputClass} placeholder="Gare"></div>
                        <div><label class={labelClass}>Destination</label><input type="text" list="stations" bind:value={form.destination} class={inputClass} placeholder="Gare"></div>
                        <datalist id="stations">{#each uniqueStationNames as st} <option value={st} /> {/each}</datalist>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                        <div><label class={labelClass}>Nbr Voyageurs</label><input type="number" bind:value={form.nombre_voyageurs} class={inputClass} placeholder="Approx."></div>
                        <div><label class={labelClass}>Dont PMR</label><input type="number" bind:value={form.nombre_pmr} class={inputClass} placeholder="0"></div>
                        <div><label class={labelClass}>Capacité Bus</label><input type="number" bind:value={form.capacite_bus} class={inputClass} placeholder="50"></div>
                    </div>
                </div>
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-sm font-bold text-green-400 uppercase tracking-wide flex items-center gap-2"><Bus size={16}/> Véhicules & Horaires</h3>
                        <button on:click={addBus} class="text-xs bg-green-500/20 text-green-400 px-3 py-1.5 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 font-bold border border-green-500/30"><Plus size={14}/> Ajouter Bus</button>
                    </div>
                    <div class="space-y-4">
                        {#each form.bus_data as bus, i}
                            <div class="bg-white/5 rounded-xl border border-white/10 overflow-hidden transition-all hover:border-white/20 hover:bg-white/[0.07]">
                                <div class="flex justify-between items-center px-4 py-2 bg-black/20 border-b border-white/5">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-mono font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">BUS #{i+1}</span>
                                    </div>
                                    <button on:click={() => removeBus(i)} class="text-gray-500 hover:text-red-400 transition-colors p-1"><MinusCircle size={16}/></button>
                                </div>
                                <div class="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div><label class="text-[10px] text-gray-500 uppercase font-bold mb-1.5 block">Plaque</label><input type="text" bind:value={bus.plaque} class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white uppercase outline-none focus:border-green-500/50" placeholder="1-ABC-123"></div>
                                    <div><label class="text-[10px] text-gray-500 uppercase font-bold mb-1.5 block">H. Prévue</label><input type="time" bind:value={bus.heure_prevue} class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50 dark:[color-scheme:dark]"></div>
                                    <div><label class="text-[10px] text-green-500/70 uppercase font-bold mb-1.5 block">H. Confirmée</label><input type="time" bind:value={bus.heure_confirmee} class="w-full bg-black/30 border border-green-900/30 rounded-lg px-3 py-2 text-sm text-green-300 outline-none focus:border-green-500/50 dark:[color-scheme:dark]"></div>
                                    <div><label class="text-[10px] text-gray-500 uppercase font-bold mb-1.5 block">Démob.</label><input type="time" bind:value={bus.heure_demob} class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50 dark:[color-scheme:dark]"></div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
            <div class="space-y-6">
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                    <h3 class="text-sm font-bold text-purple-400 uppercase tracking-wide mb-4 sticky top-0 bg-[#16181d] py-2 z-10 flex items-center gap-2"><Hash size={16}/> Lignes</h3>
                    <div class="flex flex-wrap gap-2">{#each availableLines as line}<button on:click={() => toggleLine(line)} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {form.lignes.includes(line) ? 'bg-purple-600 text-white border-purple-500 shadow-md' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}">{line}</button>{/each}</div>
                </div>
                {#if form.lignes.length > 0}
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 max-h-[400px] overflow-y-auto custom-scrollbar" transition:slide>
                        <h3 class="text-sm font-bold text-yellow-400 uppercase tracking-wide mb-4 sticky top-0 bg-[#16181d] py-2 z-10 flex items-center gap-2"><MapPin size={16}/> Arrêts Intermédiaires</h3>
                        {#if availableStops.length === 0}<p class="text-xs text-gray-500">Chargement...</p>{:else}<div class="space-y-1">{#each availableStops as stop}<button on:click={() => toggleStop(stop)} class="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-3 transition-colors {form.arrets.includes(stop) ? 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20' : 'hover:bg-white/5 text-gray-400 border border-transparent'}">{#if form.arrets.includes(stop)}<CheckSquare class="w-4 h-4 flex-shrink-0"/>{:else}<Square class="w-4 h-4 flex-shrink-0"/>{/if}{stop}</button>{/each}</div>{/if}
                    </div>
                {/if}
            </div>
        </div>

<div class="fixed bottom-4 left-4 right-4 z-50 flex flex-wrap justify-end items-center gap-4 p-4 border border-white/10 bg-[#0f1115]/80 backdrop-blur-2xl shadow-2xl rounded-2xl" in:fly={{ y: 20 }}>
    
    <button 
        on:click={() => showEmailExport = true} 
        class="px-5 py-2.5 rounded-full text-sm font-bold text-blue-400 bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all flex items-center gap-2"
    >
        <Mail class="w-4 h-4" /> <span class="hidden sm:inline">E-mail</span>
    </button>

    <button on:click={() => generatePDF()} class="px-5 py-2.5 rounded-full text-sm font-bold text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 backdrop-blur-md">
        <Printer class="w-4 h-4" /> <span class="hidden sm:inline">Télécharger PDF</span>
    </button>

    <button on:click={() => saveCommande('brouillon')} disabled={isSaving} class="px-6 py-2.5 rounded-full text-sm font-medium text-gray-400 bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        <Save class="w-4 h-4" /> <span>Brouillon</span>
    </button>

    <button on:click={() => saveCommande('envoye')} disabled={isSaving} class="px-6 py-2.5 rounded-full text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all duration-300 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        {#if isSaving}<Loader2 class="w-4 h-4 animate-spin"/>{:else}<CheckCircle class="w-4 h-4" />{/if} <span>Clôturer</span>
    </button>
</div>
        <div class="h-24"></div>
    {/if}

  {/if}
</div>

{#if showEmailExport}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" in:fly={{ y: 20 }}>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-white flex items-center gap-2">
          <Mail class="text-blue-400" size={20} /> Export E-mail
        </h3>
        <button on:click={() => showEmailExport = false} class="text-gray-500 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div class="relative group">
        <textarea 
          readonly
          class="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none font-mono"
          bind:value={emailBody}
        ></textarea>
        
        <button 
          on:click={copyToClipboard}
          class="absolute top-3 right-3 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 shadow-lg transition-all flex items-center gap-2 text-xs font-bold"
        >
          {#if hasCopied}
            <Check size={14} /> Copié
          {:else}
            <ClipboardCopy size={14} /> Copier
          {/if}
        </button>
      </div>

   <div class="mt-6 flex justify-between gap-3">
  <button 
    on:click={() => showEmailExport = false}
    class="px-4 py-2 rounded-xl bg-white/5 text-gray-400 font-bold hover:bg-white/10 transition-colors"
  >
    Fermer
  </button>

  <button 
    on:click={sendEmail}
    class="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
  >
    <Mail size={18} />
    Ouvrir dans Outlook
  </button>
</div>
    </div>
  </div>
{/if}