<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade, slide, scale } from 'svelte/transition';
  import jsPDF from 'jspdf';
  import autoTable from 'jspdf-autotable';
  import { openConfirmModal } from '$lib/stores/modal.js';
  import { toast } from '$lib/stores/toast.js';
  import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
  import { 
    Car, Calendar, Clock, MapPin, FileText, Save, Trash2, Plus, Loader2, ArrowLeft,
    Printer, Search, X, User, Users, ArrowRightLeft, 
    Mail, ClipboardCopy, Check, Phone, ArrowRight, MoreHorizontal, FilePenLine
  } from 'lucide-svelte';

  // --- ÉTATS ---
  let view = 'list';
  let isLoading = true;
  let isSaving = false;
  let commandes = [];
  let taxis = []; 
  let pmrClients = []; 
  let showEmailExport = false;
  let hasCopied = false;

  // État pour la commande sélectionnée (Historique)
  let selectedCommand = null; 
  let emailPreviewContent = ""; 

  let uniqueStationNames = [];




  // Fonction pour obtenir le format 'YYYY-MM-DDTHH:mm' en HEURE LOCALE
// Fonction pour formater une date pour l'input HTML (YYYY-MM-DDTHH:mm) en heure locale
const toLocalInput = (dateStr) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    const pad = (num) => String(num).padStart(2, '0');
    
    // On récupère chaque morceau en heure locale du navigateur
    const YYYY = date.getFullYear();
    const MM = pad(date.getMonth() + 1); // Les mois commencent à 0 en JS
    const DD = pad(date.getDate());
    const HH = pad(date.getHours());
    const mm = pad(date.getMinutes());

    return `${YYYY}-${MM}-${DD}T${HH}:${mm}`;
};


  // --- FORMULAIRE ---
  const initialForm = {
    id: null,
    redacteur: '', 
    status: 'brouillon',
    motif: 'Dérangement',
date_trajet: toLocalInput(),    
date_retour: toLocalInput(),
    taxi_nom: '', taxi_email: '', taxi_adresse: '', taxi_tel: '',
    type_trajet: 'aller',
    gare_origine: 'Mons', gare_arrivee: '', gare_via: '',
    gare_retour_origine: '', gare_retour_arrivee: '',
    nombre_passagers: 1, nombre_pmr: 0,
    is_pmr: false,
    pmr_type: 'NV', pmr_nom: '', pmr_prenom: '', pmr_tel: '', pmr_dossier: '', pmr_motif: 'Pas de personnel',
    pmr_search: '', 
    passager_nom: '', relation_number: '', facturation: 'SNCB'
  };

  let form = JSON.parse(JSON.stringify(initialForm));

  // --- CHARGEMENT ---
  onMount(async () => {
    await Promise.all([loadHistory(), loadTaxis(), loadPmrClients(), loadStations(), loadCurrentUser()]);
    isLoading = false;
  });

  async function loadCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
          // On ne met à jour le rédacteur que si on est en création (pas d'ID)
          if (!form.id) {
              form.redacteur = data?.full_name || user.email;
          }
      }
  }

  async function loadHistory() {
    const { data, error } = await supabase.from('taxi_commands').select('*').order('created_at', { ascending: false }).limit(50);
    if (!error) commandes = data || [];
  }

  async function loadTaxis() {
    const { data } = await supabase.from('taxis').select('*').order('nom');
    if (data) taxis = data;
  }

  async function loadPmrClients() {
    const { data } = await supabase.from('pmr_clients').select('*').order('nom');
    if (data) pmrClients = data;
  }

  async function loadStations() {
    const { data } = await supabase.from('ligne_data').select('gare').not('gare', 'is', null).order('gare');
    if (data) uniqueStationNames = [...new Set(data.map(d => d.gare))].sort();
  }

  // --- LOGIQUE METIER ---
  function handleTaxiChange() {
      const found = taxis.find(t => t.nom.toLowerCase() === form.taxi_nom.toLowerCase());
      if (found) {
          form.taxi_email = found.email; form.taxi_adresse = found.adresse; form.taxi_tel = found.telephone;
      } else {
          form.taxi_email = ''; form.taxi_adresse = ''; form.taxi_tel = '';
      }
  }

  function handlePmrSelect(e) {
      const val = e.target.value; form.pmr_search = val;
      const found = pmrClients.find(c => `${c.nom} ${c.prenom}` === val);
      if (found) {
          form.pmr_nom = found.nom; form.pmr_prenom = found.prenom; form.pmr_tel = found.telephone;
          if (found.type) form.pmr_type = found.type; 
      } else {
          const parts = val.split(' '); form.pmr_nom = parts[0] || val; form.pmr_prenom = parts.slice(1).join(' ') || '';
      }
  }

  $: if (form.type_trajet === 'aller-retour') {
      if (!form.gare_retour_origine) form.gare_retour_origine = form.gare_arrivee;
      if (!form.gare_retour_arrivee) form.gare_retour_arrivee = form.gare_origine;
      if (!form.date_retour && form.date_trajet) {
        let d = new Date(form.date_trajet);
        d.setHours(d.getHours() + 2);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        form.date_retour = d.toISOString().slice(0, 16);
      }
  }

  function getEmailBodyFromData(data) {
      return `Bonjour,

Veuillez trouver ci-joint une commande de taxi pour le trajet suivant :

Date : ${new Date(data.date_trajet).toLocaleString('fr-BE')}
De : ${data.gare_origine}
Vers : ${data.gare_arrivee}
${data.type_trajet === 'aller-retour' ? `RETOUR PRÉVU le : ${new Date(data.date_retour).toLocaleString('fr-BE')}` : ''}

Nombre de passagers : ${data.nombre_passagers} ${data.is_pmr ? `(dont ${data.nombre_pmr} PMR)` : ''}
${data.is_pmr ? `Client PMR : ${data.pmr_nom || ''} ${data.pmr_prenom || ''} (${data.pmr_type})\nDossier : ${data.pmr_dossier || 'Non spécifié'}` : `Ref : ${data.relation_number || 'Non spécifié'}`}

Merci de confirmer la bonne réception.

Cordialement,
${data.redacteur || 'SNCB'}`;
  }

  // --- ACTIONS ---

function openNew() {
      form = JSON.parse(JSON.stringify(initialForm));
      // Force l'heure actuelle locale
      form.date_trajet = toLocalInput(); 
      loadCurrentUser();
      view = 'form';
  }

  // NOUVEAU : Fonction pour éditer
  function openEdit(cmd) {
      // Copie profonde pour ne pas lier directement à la liste
      form = JSON.parse(JSON.stringify(cmd));
      
      // Ajustement des dates pour les inputs datetime-local (coupe les secondes et timezone)
     if(form.date_trajet) form.date_trajet = toLocalInput(form.date_trajet);
    if(form.date_retour) form.date_retour = toLocalInput(form.date_retour);
      
      // On s'assure que les champs calculés sont propres
      form.pmr_search = ""; 

      selectedCommand = null; // Fermer la modale
      view = 'form'; // Passer en vue formulaire
  }

  function goBackToList() {
      view = 'list';
      loadHistory();
  }

  function openHistoryOptions(cmd) {
      selectedCommand = cmd;
  }

  function openEmailModal(data = form) {
      emailPreviewContent = getEmailBodyFromData(data);
      showEmailExport = true;
      if (selectedCommand) selectedCommand = null; 
  }

  async function saveCommande() {
      if (!form.taxi_nom) return toast.error("Indiquez une société de taxi");
      if (!form.gare_arrivee) return toast.error("Destination requise");

      isSaving = true;
      const payload = { ...form };
      
      if (payload.date_trajet) payload.date_trajet = new Date(payload.date_trajet).toISOString();
if (payload.date_retour) payload.date_retour = new Date(payload.date_retour).toISOString();


      // On retire les champs "outils" non DB
      delete payload.pmr_search;

      // Nettoyage Dates
      if (!payload.date_retour || payload.type_trajet === 'aller') {
          payload.date_retour = null;
          if (payload.type_trajet === 'aller') { payload.gare_retour_origine = null; payload.gare_retour_arrivee = null; }
      }

      // Nettoyage PMR/STD
      if (form.is_pmr) {
          payload.passager_nom = null; payload.relation_number = null; payload.facturation = null;
      } else {
          payload.pmr_nom = null; payload.pmr_type = null; payload.pmr_dossier = null;
          payload.nombre_pmr = 0; payload.pmr_prenom = null; payload.pmr_tel = null; payload.pmr_motif = null;
      }
      
      let error;
      
      // LOGIQUE EDIT vs CREATE
      if (form.id) {
          // Mise à jour
          const res = await supabase.from('taxi_commands').update(payload).eq('id', form.id);
          error = res.error;
      } else {
          // Création (on retire l'ID null pour laisser l'auto-increment)
          delete payload.id;
          const res = await supabase.from('taxi_commands').insert([payload]);
          error = res.error;
      }

      isSaving = false;

      if (error) {
          toast.error("Erreur: " + error.message);
      } else {
          toast.success(form.id ? "Commande modifiée !" : "Commande créée !");
          if (!form.id) generatePDF(payload); // On génère le PDF auto seulement si c'est nouveau, sinon à la demande
          goBackToList();
      }
  }

  function deleteCommande(id) {
    if(selectedCommand) selectedCommand = null; 
    openConfirmModal("Supprimer cette commande taxi ?", async () => {
        await supabase.from('taxi_commands').delete().eq('id', id);
        loadHistory();
        toast.success("Supprimé");
    });
  }

  // Fonction de formatage date/heure (Rappel)
  const formatDate = (d) => new Date(d).toLocaleDateString('fr-BE', { timeZone: 'UTC' });


  // Helper pour transformer l'image en base64 (Nécessaire pour jsPDF)
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

  // Fonction de formatage date/heure

  // Notez le mot clé 'async' ici pour charger l'image
  async function generatePDF(data = form) {
      const doc = new jsPDF();
      
      // --- CHARGEMENT DU LOGO ---
      try {
          // Assurez-vous que le fichier est bien dans static/SNCB_logo.png
          const logoData = await getBase64ImageFromURL('/SNCB_logo.png');
          // x, y, width, height
          doc.addImage(logoData, 'PNG', 10, 10, 25, 16.33); 
      } catch (e) {
          console.warn("Logo SNCB non trouvé (vérifiez static/SNCB_logo.png)", e);
      }

      // Configuration des polices
      doc.setFont("helvetica", "normal");
      
      // --- HELPER : Dessiner un cadre avec titre ---
      const drawBox = (x, y, w, h, title = null) => {
          doc.setDrawColor(0);
          doc.setLineWidth(0.3);
          doc.rect(x, y, w, h); // Cadre normal
          if (title) {
              doc.setFontSize(8);
              doc.setFont("helvetica", "bold");
              doc.text(title, x + 2, y + 5);
          }
      };

      // --- EN-TÊTE ---
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      // Titre centré (décalé pour laisser place au logo)
      doc.text("BON DE COMMANDE TAXI", 115, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`ID Commande : #${data.id || 'NOUVEAU'}`, 195, 20, { align: "right" });

      // ==========================================
      // CADRE 1 : BUREAU ÉMETTEUR (Haut Gauche)
      // ==========================================
      const yRow1 = 35; // Descendu un peu pour le logo
      const hRow1 = 45;
      drawBox(10, yRow1, 90, hRow1, "1. Bureau émetteur");

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      
      let currentY = yRow1 + 12;
      const leftMargin = 15;

      // Infos demandées
      doc.text(`Rédacteur : ${data.redacteur || ''}`, leftMargin, currentY);
      currentY += 6;
      doc.setFont("helvetica", "bold");
      doc.text("OCC Mons", leftMargin, currentY);
      currentY += 6;
      doc.text("PACO/RCCA", leftMargin, currentY);
      currentY += 6;
      doc.text("7000 Mons", leftMargin, currentY);

      // ==========================================
      // CADRE 2 : FACTURATION (Haut Droite)
      // ==========================================
      drawBox(105, yRow1, 95, hRow1, "2. A facturer à :");

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      currentY = yRow1 + 12;
      const rightMargin = 110;

      doc.text("SNCB – B-FI.224", rightMargin, currentY);
      currentY += 5;

      // LOGIQUE PO
      if (data.is_pmr) {
          doc.text("PO 4523122281 (Voyageurs PMR) (*)", rightMargin, currentY);
      } else {
          doc.text("PO 4523207823 (Voyageurs/Pers. incident) (*)", rightMargin, currentY);
      }
      currentY += 6;

      doc.setFont("helvetica", "normal");
      doc.text("10-01 B-FI. 224", rightMargin, currentY);
      currentY += 5;
      doc.text("Rue de France 56", rightMargin, currentY);
      currentY += 5;
      doc.text("1060 Bruxelles", rightMargin, currentY);
      currentY += 6;
      doc.setFont("helvetica", "bold");
      doc.text("N° TVA : BE 0203 430 576", rightMargin, currentY);

      // ==========================================
      // CADRE 3 : SOCIETE TAXI (Milieu Gauche)
      // ==========================================
      const yRow2 = yRow1 + hRow1 + 5; // 85
      const hRow2 = 40;
      drawBox(10, yRow2, 90, hRow2, "3. Société de Taxi :");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(data.taxi_nom || "Taxi Indépendant", leftMargin, yRow2 + 15);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      if(data.taxi_tel) doc.text(`Tel: ${data.taxi_tel}`, leftMargin, yRow2 + 22);
      if(data.taxi_email) {
          doc.setFontSize(8);
          doc.text(data.taxi_email, leftMargin, yRow2 + 28);
      }
      if(data.taxi_adresse) {
           doc.setFontSize(8);
           const splitAdd = doc.splitTextToSize(data.taxi_adresse, 80);
           doc.text(splitAdd, leftMargin, yRow2 + 34);
      }

      // ==========================================
      // CADRE 4 : PRISE EN CHARGE (Milieu Droite)
      // ==========================================
      const isReturn = data.type_trajet === 'aller-retour';
      const hRowTrajet = isReturn ? 60 : 40; 

      drawBox(105, yRow2, 95, hRowTrajet, "4. Trajet :");

      doc.setFontSize(10);
      const tX = 110;
      let tY = yRow2 + 12;

      // --- ALLER ---
      doc.setFont("helvetica", "bold");
      doc.text("ALLER :", tX, tY);
      
      // --- MISE EN SURVEILLANCE (ENCADRÉ ROUGE) ---
      const dateStr = `${formatDate(data.date_trajet)} à ${formatTime(data.date_trajet)}`;
      doc.setDrawColor(200, 0, 0); // Rouge
      doc.setLineWidth(0.5);
      doc.rect(tX + 23, tY - 4, 55, 6); // Rectangle autour de la date
      doc.setDrawColor(0); // Reset Noir
      doc.setLineWidth(0.3); // Reset épaisseur

      doc.setFont("helvetica", "bold"); // On met en gras aussi
      doc.text(dateStr, tX + 25, tY);
      tY += 6;
      
      doc.setFont("helvetica", "bold"); doc.text("De :", tX, tY);
      doc.setFont("helvetica", "normal"); doc.text(data.gare_origine, tX + 15, tY);
      tY += 5;
      
      if(data.gare_via) {
          doc.setFont("helvetica", "bold"); doc.text("Via :", tX, tY);
          doc.setFont("helvetica", "normal"); doc.text(data.gare_via, tX + 15, tY);
          tY += 5;
      }

      doc.setFont("helvetica", "bold"); doc.text("Vers :", tX, tY);
      doc.setFont("helvetica", "normal"); doc.text(data.gare_arrivee, tX + 15, tY);

      if (isReturn) {
          tY += 10;
          doc.setDrawColor(200);
          doc.line(110, tY - 4, 195, tY - 4);
          doc.setDrawColor(0);

          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 150);
          doc.text("RETOUR :", tX, tY);
          doc.setTextColor(0);
          
          doc.setFont("helvetica", "normal");
          const dateRet = data.date_retour ? formatDate(data.date_retour) : '...';
          const timeRet = data.date_retour ? formatTime(data.date_retour) : '...';
          doc.text(`${dateRet} à ${timeRet}`, tX + 25, tY);
          
          tY += 6;
          doc.setFont("helvetica", "bold"); doc.text("De :", tX, tY);
          doc.setFont("helvetica", "normal"); doc.text(data.gare_retour_origine || data.gare_arrivee, tX + 15, tY);
          tY += 5;
          doc.setFont("helvetica", "bold"); doc.text("Vers :", tX, tY);
          doc.setFont("helvetica", "normal"); doc.text(data.gare_retour_arrivee || data.gare_origine, tX + 15, tY);
      }

      // ==========================================
      // CADRE 5 : PASSAGERS & MOTIF
      // ==========================================
      const yRow3 = yRow2 + hRowTrajet + 5;
      const hRow3 = 45;
      
      drawBox(10, yRow3, 190, hRow3, "5. Détails & Motif :");
      
      let pY = yRow3 + 12;
      const pX = 15;

      doc.setFont("helvetica", "bold");
      doc.text("Passager(s) :", pX, pY);
      doc.setFont("helvetica", "normal");
      
      let paxInfo = "";
      if (data.is_pmr) {
          paxInfo = `${data.pmr_nom} ${data.pmr_prenom} (PMR: ${data.pmr_type})`;
          if (data.pmr_tel) paxInfo += ` - Tel: ${data.pmr_tel}`;
      } else {
          paxInfo = data.passager_nom || "Non nominatif";
      }
      doc.text(paxInfo, pX + 30, pY);
      
      const nbPax = `${data.nombre_passagers} pers. ${data.is_pmr ? `(dont ${data.nombre_pmr} PMR)` : ''}`;
      doc.text(nbPax, 150, pY, { align: "right" });

      pY += 8;
      doc.setFont("helvetica", "bold");
      if (data.is_pmr) {
          doc.text("N° Dossier :", pX, pY);
          doc.setFont("helvetica", "normal");
          doc.text(data.pmr_dossier || 'N/A', pX + 30, pY);
      } else {
          doc.text("Réf. Relation :", pX, pY);
          doc.setFont("helvetica", "normal");
          doc.text(data.relation_number || 'N/A', pX + 30, pY);
      }

      pY += 8;
      doc.setFont("helvetica", "bold");
      doc.text("Motif :", pX, pY);
      doc.setFont("helvetica", "normal");
      let motifFinal = data.is_pmr ? (data.pmr_motif || '') : (data.motif || '');
      const splitMotif = doc.splitTextToSize(motifFinal, 140);
      doc.text(splitMotif, pX + 30, pY);

      // ==========================================
      // CADRE 6 : DONNEES TRAJET (POUR CHAUFFEUR)
      // ==========================================
      const yRow4 = yRow3 + hRow3 + 5;
      const hRow4 = 35;
      
      // Cadre avec une ligne un peu plus épaisse pour le différencier
      doc.setLineWidth(0.5);
      doc.rect(10, yRow4, 190, hRow4);
      doc.setLineWidth(0.3); // Reset
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("6. Données du trajet (A remplir par le chauffeur)", 12, yRow4 + 5);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      const col1X = 15;
      const col2X = 105;
      let dY = yRow4 + 12;

      // Colonne Gauche
      doc.text("Index km départ : ................................... Km", col1X, dY);
      doc.text("Heure du départ : .................", col2X, dY);
      dY += 7;
      
      doc.text("Index km arrivée : .................................. Km", col1X, dY);
      doc.text("Heure du retour : .................", col2X, dY);
      dY += 7;

      doc.setFont("helvetica", "bold");
      doc.text("Parcours total : .................................... Km", col1X, dY);
      
      doc.setFont("helvetica", "normal");
      doc.text("Durée totale : .....................", col2X, dY);
      dY += 7;

      doc.setFontSize(7);
      doc.text("(*) biffer la mention inutile", col1X, dY);
      
      doc.setFontSize(9);
      doc.text("Temps d'attente : .................", col2X, dY);


      // ==========================================
      // PIED DE PAGE
      // ==========================================
      const yFooter = yRow4 + hRow4 + 10;
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Le prestataire certifie l'exécution du transport conformément aux données ci-dessus.", 10, yFooter);
      
      doc.rect(10, yFooter + 2, 90, 25);
      doc.text("Signature & Cachet Taxi :", 12, yFooter + 6);
      
      doc.rect(110, yFooter + 2, 90, 25);
      doc.text("Signature Agent SNCB (Si présent) :", 112, yFooter + 6);

      // Sauvegarde
      doc.save(`Taxi_${data.gare_origine}_${data.id || 'new'}.pdf`);
      
      if (selectedCommand) selectedCommand = null;
  }
       

  function copyToClipboard() {
      navigator.clipboard.writeText(emailPreviewContent).then(() => {
          hasCopied = true; toast.success("Email copié !"); setTimeout(() => hasCopied = false, 2000);
      });
  }
  
  function sendEmail() {
    const targetEmail = selectedCommand ? selectedCommand.taxi_email : form.taxi_email;
    window.location.href = `mailto:${targetEmail}?subject=Commande Taxi&body=${encodeURIComponent(emailPreviewContent)}`;
  }

  const formatTime = (dateStr) => {
      if(!dateStr) return '--:--';
      return new Date(dateStr).toLocaleTimeString('fr-BE', {hour: '2-digit', minute:'2-digit'});
  };

  const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all placeholder-gray-600";
  const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1 flex items-center gap-1";
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">

  <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6">
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
          <Car class="w-8 h-8" />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Taxi</h1>
          <p class="text-gray-500 text-sm mt-1">Commandes de Taxis & PMR.</p>
        </div>
    </div>
    
    {#if view === 'list'}
        <button on:click={openNew} class="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all">
          <Plus class="w-5 h-5" /> Nouvelle Commande
        </button>
    {:else}
        <button on:click={goBackToList} class="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all">
            <ArrowLeft class="w-5 h-5" /> Retour liste
        </button>
    {/if}
  </header>

  {#if isLoading}
    <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-cyan-500/50" /></div>
  {:else}

    {#if view === 'list'}
        <div class="grid grid-cols-1 gap-4" in:fly={{ y: 20 }}>
            {#if commandes.length === 0}
                <div class="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-black/20">
                    <p class="text-gray-500">Aucune commande taxi récente.</p>
                </div>
            {:else}
                {#each commandes as cmd}
                    <button 
                        on:click={() => openHistoryOptions(cmd)}
                        class="w-full text-left bg-black/20 border border-white/5 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-cyan-500/30 hover:bg-white/[0.02] transition-all group relative overflow-hidden"
                    >
                        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>

                        <div class="flex-grow space-y-3 relative z-10 w-full">
                             <div class="flex items-center gap-3 flex-wrap">
                                {#if cmd.is_pmr}
                                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"><Users size={10}/> PMR</span>
                                {:else}
                                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1"><User size={10}/> Clientèle Standard</span>
                                {/if}
                                <span class="text-lg font-bold text-white tracking-tight">{cmd.taxi_nom}</span>
                                {#if cmd.is_pmr && cmd.pmr_dossier}
                                     <span class="ml-auto md:ml-0 text-xs font-mono text-purple-200 bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/20" title="Dossier PMR">Dos: {cmd.pmr_dossier}</span>
                                {:else if cmd.relation_number}
                                     <span class="ml-auto md:ml-0 text-xs font-mono text-cyan-200 bg-cyan-900/20 px-2 py-0.5 rounded border border-cyan-500/20" title="Réf Relation">Réf: {cmd.relation_number}</span>
                                {/if}
                             </div>

                             <div class="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                <div class="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                    <Calendar size={14} class="text-gray-500"/> 
                                    <span class="font-medium text-gray-200">{new Date(cmd.date_trajet).toLocaleDateString()}</span>
                                    <span class="w-px h-3 bg-white/10 mx-1"></span>
                                    <span class="font-bold text-cyan-400">{formatTime(cmd.date_trajet)}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-white font-medium">{cmd.gare_origine}</span> 
                                    <ArrowRight size={14} class="text-gray-600"/> 
                                    {#if cmd.gare_via}
                                        <span class="text-xs text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20" title="Via">{cmd.gare_via}</span>
                                        <ArrowRight size={14} class="text-gray-600"/>
                                    {/if}
                                    <span class="text-white font-medium">{cmd.gare_arrivee}</span>
                                </div>
                             </div>
                        </div>

                        <div class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 bg-white/5 p-2 rounded-full border border-white/10">
                            <MoreHorizontal size={20} />
                        </div>
                    </button>
                {/each}
            {/if}
        </div>

    {:else}
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-8" in:fade>
             <div class="xl:col-span-2 space-y-6">
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
                    <h3 class="text-sm font-bold text-cyan-400 uppercase tracking-wide mb-4 flex items-center gap-2"><FileText size={16}/> Mission</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="md:col-span-2"><label class={labelClass}>Motif</label><input type="text" bind:value={form.motif} class={inputClass}></div>
                        <div><label class={labelClass}>Rédacteur</label><input type="text" bind:value={form.redacteur} class={inputClass} readonly></div>
                        <div><label class={labelClass}>Facturation</label><select bind:value={form.facturation} class={inputClass} disabled={form.is_pmr}><option>SNCB</option><option>Infrabel</option><option>Tiers</option></select></div>
                    </div>
                </div>
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
                     <div class="flex justify-between items-center mb-4"><h3 class="text-sm font-bold text-blue-400 uppercase tracking-wide flex items-center gap-2"><MapPin size={16}/> Trajet</h3>
                        <div class="flex items-center bg-white/5 p-1 rounded-lg border border-white/10"><button class="px-3 py-1 text-xs font-bold rounded-md transition-all {form.type_trajet === 'aller' ? 'bg-blue-500 text-white shadow' : 'text-gray-500 hover:text-gray-300'}" on:click={() => form.type_trajet = 'aller'}>Aller Simple</button><button class="px-3 py-1 text-xs font-bold rounded-md transition-all {form.type_trajet === 'aller-retour' ? 'bg-blue-500 text-white shadow' : 'text-gray-500 hover:text-gray-300'}" on:click={() => form.type_trajet = 'aller-retour'}>Aller-Retour</button></div></div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class={labelClass}>Date & Heure</label><input type="datetime-local" bind:value={form.date_trajet} class="{inputClass} dark:[color-scheme:dark]"></div><div><label class={labelClass}>Via (Optionnel)</label><input type="text" list="stations" bind:value={form.gare_via} class={inputClass}></div><div><label class={labelClass}>Départ</label><input type="text" list="stations" bind:value={form.gare_origine} class={inputClass}></div><div><label class={labelClass}>Arrivée</label><input type="text" list="stations" bind:value={form.gare_arrivee} class={inputClass}></div></div>
                    {#if form.type_trajet === 'aller-retour'}<div class="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4" transition:slide><div class="md:col-span-2"><label class="{labelClass} text-blue-400">Date Retour</label><input type="datetime-local" bind:value={form.date_retour} class="{inputClass} dark:[color-scheme:dark] border-blue-500/30"></div><div><label class={labelClass}>Départ Retour</label><input type="text" list="stations" bind:value={form.gare_retour_origine} class={inputClass}></div><div><label class={labelClass}>Arrivée Retour</label><input type="text" list="stations" bind:value={form.gare_retour_arrivee} class={inputClass}></div></div>{/if}<datalist id="stations">{#each uniqueStationNames as st} <option value={st} /> {/each}</datalist>
                </div>
            </div>
            <div class="space-y-6">
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative"><h3 class="text-sm font-bold text-yellow-400 uppercase tracking-wide mb-4 flex items-center gap-2"><Car size={16}/> Société</h3><div><input list="taxis-list" type="text" bind:value={form.taxi_nom} on:input={handleTaxiChange} class={inputClass} placeholder="Rechercher..."><datalist id="taxis-list">{#each taxis as t}<option value={t.nom} />{/each}</datalist></div>{#if form.taxi_email || form.taxi_adresse}<div class="mt-4 p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-400 space-y-2" transition:slide>{#if form.taxi_adresse}<div class="flex items-center gap-2"><MapPin size={12}/> {form.taxi_adresse}</div>{/if}{#if form.taxi_email}<div class="flex items-center gap-2"><Mail size={12}/> {form.taxi_email}</div>{/if}{#if form.taxi_tel}<div class="flex items-center gap-2"><Phone size={12}/> {form.taxi_tel}</div>{/if}</div>{/if}</div>
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative overflow-hidden transition-colors duration-300 {form.is_pmr ? 'border-purple-500/30' : ''}"><div class="absolute top-0 left-0 right-0 h-1 transition-colors duration-300 {form.is_pmr ? 'bg-purple-500' : 'bg-cyan-500'}"></div><div class="flex justify-between items-center mb-4 pt-2"><h3 class="text-sm font-bold uppercase tracking-wide flex items-center gap-2 {form.is_pmr ? 'text-purple-400' : 'text-cyan-400'}">{#if form.is_pmr}<Users size={16}/> PMR{:else}<User size={16}/> Passager{/if}</h3></div><div class="bg-black/40 p-1 rounded-xl flex mb-6 border border-white/10"><button class="flex-1 py-2 rounded-lg text-xs font-bold transition-all { !form.is_pmr ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:text-white' }" on:click={() => form.is_pmr = false}>STANDARD</button><button class="flex-1 py-2 rounded-lg text-xs font-bold transition-all { form.is_pmr ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white' }" on:click={() => form.is_pmr = true}>PMR</button></div><div class="space-y-4"><div class="grid grid-cols-2 gap-4"><div class="{form.is_pmr ? '' : 'col-span-2'}"><label class={labelClass}>Total Pax</label><input type="number" min="1" bind:value={form.nombre_passagers} class={inputClass}></div>{#if form.is_pmr}<div><label class={labelClass}>Dont PMR</label><input type="number" min="0" bind:value={form.nombre_pmr} class={inputClass}></div>{/if}</div>{#if form.is_pmr}<div transition:slide class="space-y-4 pt-2 border-t border-white/5"><div><label class={labelClass}>Client PMR</label><input list="pmr-clients-list" type="text" bind:value={form.pmr_search} on:input={handlePmrSelect} class={inputClass}><datalist id="pmr-clients-list">{#each pmrClients as c}<option value={`${c.nom} ${c.prenom}`}>{c.type || '?'}</option>{/each}</datalist></div><div><label class={labelClass}>Type</label><select bind:value={form.pmr_type} class={inputClass}><option value="NV">Non-Voyant</option><option value="CRF">Chaise Roulante Fixe</option><option value="CRP">Chaise Roulante Pliable</option><option value="MR">Marche Difficile</option><option value="Diff">Autre difficulté</option></select></div><div class="grid grid-cols-2 gap-2"><input type="text" placeholder="Nom" bind:value={form.pmr_nom} class={inputClass}><input type="text" placeholder="Prénom" bind:value={form.pmr_prenom} class={inputClass}></div><div><label class={labelClass}>Téléphone</label><input type="text" bind:value={form.pmr_tel} class={inputClass}></div><div><label class={labelClass}>N° Dossier</label><input type="text" bind:value={form.pmr_dossier} class="{inputClass} border-purple-500/30"></div></div>{:else}<div transition:slide class="space-y-4 pt-2 border-t border-white/5"><div><label class={labelClass}>Nom Passager</label><input type="text" bind:value={form.passager_nom} class={inputClass}></div><div><label class={labelClass}>Réf / Ordre</label><input type="text" bind:value={form.relation_number} class={inputClass}></div></div>{/if}</div></div></div>
        </div>

        <div class="fixed bottom-4 left-4 right-4 z-50 flex flex-wrap justify-end items-center gap-4 p-4 border border-white/10 bg-[#0f1115]/80 backdrop-blur-2xl shadow-2xl rounded-2xl" in:fly={{ y: 20 }}>
            <button on:click={() => openEmailModal(form)} class="mr-auto px-5 py-2.5 rounded-full text-sm font-bold text-blue-400 bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-all flex items-center gap-2"><Mail class="w-4 h-4" /> <span class="hidden sm:inline">E-mail</span></button>
            <button on:click={() => saveCommande()} disabled={isSaving} class="px-6 py-2.5 rounded-full text-sm font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 hover:text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all flex items-center gap-2 disabled:opacity-50">{#if isSaving}<Loader2 class="w-4 h-4 animate-spin"/>{:else}<Save class="w-4 h-4" />{/if} <span>{form.id ? 'Modifier' : 'Enregistrer'} & PDF</span></button>
        </div>
        <div class="h-24"></div>
    {/if}
  {/if}
</div>

{#if selectedCommand}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
        <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" in:scale={{start: 0.95}}>
            <button on:click={() => selectedCommand = null} class="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20}/></button>
            
            <h3 class="text-lg font-bold text-white mb-1">Commande #{selectedCommand.id}</h3>
            <p class="text-sm text-gray-400 mb-6">{new Date(selectedCommand.date_trajet).toLocaleDateString()} - {selectedCommand.taxi_nom}</p>

            <div class="space-y-3">
                <button on:click={() => openEdit(selectedCommand)} class="w-full py-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold hover:bg-purple-500/20 flex items-center justify-center gap-2">
                    <FilePenLine size={18}/> Modifier
                </button>

                <div class="grid grid-cols-2 gap-3">
                    <button on:click={() => generatePDF(selectedCommand)} class="w-full py-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold hover:bg-cyan-500/20 flex items-center justify-center gap-2">
                        <Printer size={18}/> PDF
                    </button>
                    <button on:click={() => openEmailModal(selectedCommand)} class="w-full py-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold hover:bg-blue-500/20 flex items-center justify-center gap-2">
                        <Mail size={18}/> Email
                    </button>
                </div>
                
                <div class="h-px bg-white/10 my-2"></div>
                <button on:click={() => deleteCommande(selectedCommand.id)} class="w-full py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold hover:bg-red-500/20 flex items-center justify-center gap-2">
                    <Trash2 size={18}/> Supprimer
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showEmailExport}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" in:fly={{ y: 20 }}>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-white flex items-center gap-2"><Mail class="text-blue-400" size={20} /> Aperçu E-mail</h3>
        <button on:click={() => showEmailExport = false} class="text-gray-500 hover:text-white"><X size={20} /></button>
      </div>
      <div class="relative group">
        <textarea readonly class="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none font-mono" bind:value={emailPreviewContent}></textarea>
        <button on:click={copyToClipboard} class="absolute top-3 right-3 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 shadow-lg transition-all flex items-center gap-2 text-xs font-bold">{#if hasCopied}<Check size={14} /> Copié{:else}<ClipboardCopy size={14} /> Copier{/if}</button>
      </div>
       <div class="mt-6 flex justify-between gap-3">
          <button on:click={() => showEmailExport = false} class="px-4 py-2 rounded-xl bg-white/5 text-gray-400 font-bold hover:bg-white/10 transition-colors">Fermer</button>
          <button on:click={sendEmail} class="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"><Mail size={18} /> Ouvrir Outlook</button>
        </div>
    </div>
  </div>
{/if}