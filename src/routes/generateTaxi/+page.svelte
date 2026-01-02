<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade, slide, scale } from 'svelte/transition';
  import jsPDF from 'jspdf';
  import autoTable from 'jspdf-autotable';
  import { openConfirmModal } from '$lib/stores/modal.js';
  import { toast } from '$lib/stores/toast.js';
  import { page } from '$app/stores'; // Ajouté pour gérer les URL params si besoin
  import { goto } from '$app/navigation';
  
  // Import du store de thème
  import { currentThemeId } from '$lib/stores/theme';
  import { 
    Car, Calendar, Clock, MapPin, FileText, Save, Trash2, Plus, Loader2, ArrowLeft,
    Printer, Search, X, User, Users, ArrowRightLeft, 
    Mail, ClipboardCopy, Check, Phone, ArrowRight, MoreHorizontal, FilePenLine, MessageSquare, Repeat, CornerDownRight
  } from 'lucide-svelte';

  // IMPORT PERMISSIONS
  import { hasPermission, ACTIONS } from '$lib/permissions';

  // --- CONSTANTES ---
  const PMR_CAUSES = [
      "Pas de personnel pour la prise en charge",
      "Gare taxi (17 gares)",
      "Travaux Infrabel planifiés (transport alternatif bus pour les autres voyageurs planifié par B-PT4)",
      "Travaux B-ST planifiés",
      "Défaut infrastructure gare B-ST (Ex : Ascenseur)",
      "Défaut Infrabel (ex : Traversée de service HS)",
      "Défaut rampes mobiles B-PT2",
      "Problème lors du voyage de la PMR dû à l'assistance/retard d'un train/suppression d'un train",
      "Acte commercial suite erreur SNCB (remarque dans le dossier)",
      "Acte commercial suite erreur client",
      "Autre (à justifier)"
  ];

  const FACTURATION_OPTIONS = [
      "Infrabel",
      "SNCB",
      "Tiers",
      "B-CS 1 Accompagnement",
      "B-TO 1 Conduite",
      "B-TC Matériel",
      "B-PT 5 EMMA",
      "B-CS 4 Planification"
  ];

  // --- ÉTATS ---
  let view = 'list';
  let isLoading = true;
  let isSaving = false;
  let commandes = [];
  let taxis = []; 
  let pmrClients = []; 
  let showEmailExport = false;
  let hasCopied = false;

  let selectedCommand = null; 
  let emailPreviewContent = ""; 
  let uniqueStationNames = [];

  // User & Permissions
  let currentUserProfile = null;
  let isAuthorized = false;

  // --- FONCTIONS UTILITAIRES ---

  const cleanData = (input) => {
      if (!input) return '';
      if (Array.isArray(input)) return input.join(', ');
      if (typeof input === 'string') {
          if (input.trim().startsWith('[') || input.includes('"')) {
              try {
                  const parsed = JSON.parse(input);
                  return Array.isArray(parsed) ? parsed.join(', ') : parsed;
              } catch (e) {
                  return input.replace(/[\[\]"]/g, '').replace(/,/g, ', ');
              }
          }
      }
      return input;
  };

  function toLocalInput(dateStr) {
      const date = dateStr ? new Date(dateStr) : new Date();
      const pad = (num) => String(num).padStart(2, '0');
      const YYYY = date.getFullYear();
      const MM = pad(date.getMonth() + 1);
      const DD = pad(date.getDate());
      const HH = pad(date.getHours());
      const mm = pad(date.getMinutes());
      return `${YYYY}-${MM}-${DD}T${HH}:${mm}`;
  }

  const getBase64ImageFromURL = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute("crossOrigin", "anonymous");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = error => reject(error);
      img.src = url;
    });
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('fr-BE', { timeZone: 'UTC' });
  const formatTime = (d) => new Date(d).toLocaleTimeString('fr-BE', { hour: '2-digit', minute:'2-digit', timeZone: 'UTC' });
  const formatTimeLocal = (dateStr) => {
      if(!dateStr) return '--:--';
      return new Date(dateStr).toLocaleTimeString('fr-BE', {hour: '2-digit', minute:'2-digit', timeZone: 'UTC'});
  };

  // --- FORMULAIRE ---
  const initialForm = {
    id: null,
    redacteur: '', 
    status: 'brouillon',
    motif: '', 
    date_trajet: toLocalInput(), 
    date_retour: '',
    taxi_nom: '', taxi_email: '', taxi_adresse: '', taxi_tel: '', 
    type_trajet: 'aller',
    gare_origine: 'Mons', gare_arrivee: '', gare_via: '',
    gare_retour_origine: '', gare_retour_arrivee: '',
    nombre_passagers: 1, 
    nombre_pmr: 0,
    nombre_vehicules: 1, // NOUVEAU CHAMP
    is_pmr: false,
    pmr_type: 'NV', pmr_nom: '', pmr_prenom: '', pmr_tel: '', pmr_dossier: '', 
    pmr_motif: '',
    pmr_search: '', 
    passager_nom: '', relation_number: '', 
    facturation: 'SNCB'
  };

  let form = JSON.parse(JSON.stringify(initialForm));

  // Variable réactive pour le verrouillage (Si pas de droits WRITE ou si envoyé)
  $: isLocked = form.status === 'envoye' || !hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_WRITE);

  // --- CHARGEMENT ---
  onMount(async () => {
    // 1. Auth Check
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return goto('/');

    // 2. Profil & Permissions
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
    
    currentUserProfile = { ...session.user, ...profile };

    // 3. Vérification Permission LECTURE
    if (!hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_READ)) {
        toast.error("Accès refusé.");
        return goto('/accueil');
    }

    // 4. Autorisation OK -> Chargement
    isAuthorized = true;
    await Promise.all([loadHistory(), loadTaxis(), loadPmrClients(), loadStations()]);
    
    // Initialiser le rédacteur si nouvelle commande
    if (!form.id) form.redacteur = currentUserProfile.full_name || currentUserProfile.email;
    
    isLoading = false;
  });

  async function loadHistory() {
    const { data, error } = await supabase.from('taxi_commands').select('*').order('created_at', { ascending: false }).limit(50);
    if (!error) commandes = data || [];
  }

  const HIDDEN_TAXIS = ["Melsbroek", "Géraldine", "Laeticia", "Bureau"];

  async function loadTaxis() {
    const { data } = await supabase.from('taxis').select('*').order('nom');
    if (data) {
        taxis = data
            .filter(t => !HIDDEN_TAXIS.includes(t.nom))
            .map(t => ({
                ...t,
                adresse: cleanData(t.adresse),
                telephone: cleanData(t.contacts || t.telephone),
                email: cleanData(t.mail || t.email)
            }));
    }
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
          form.taxi_adresse = cleanData(found.adresse);
          form.taxi_email = cleanData(found.email); 
          form.taxi_tel = cleanData(found.telephone);
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
          form.date_retour = toLocalInput(d); 
      }
  }

  $: if (form.is_pmr) {
      if (form.nombre_pmr === 0) {
          form.nombre_pmr = 1;
          if (form.nombre_passagers < form.nombre_pmr) form.nombre_passagers = form.nombre_pmr;
      }
      // Initialisation par défaut si vide
      if (!form.nombre_vehicules) form.nombre_vehicules = 1;
  }

  function updateAccompagnants(e) {
      const accomp = parseInt(e.target.value) || 0;
      form.nombre_passagers = form.nombre_pmr + accomp;
  }
  
  function updatePmrCount(e) {
      if (form.nombre_pmr > form.nombre_passagers) {
          form.nombre_passagers = form.nombre_pmr;
      }
  }

  function getEmailBodyFromData(data) {
      let causeSection = "";
      if (data.is_pmr) {
          causeSection = `\nCause : ${data.pmr_motif || 'Non spécifiée'}\nRemarques : ${data.motif || '-'}\nNombre de véhicules : ${data.nombre_vehicules || 1}`;
      }

      return `Bonjour,

Veuillez trouver ci-joint une commande de taxi pour le trajet suivant :

Date : ${formatDate(data.date_trajet)} à ${formatTime(data.date_trajet)}
De : ${data.gare_origine}
Vers : ${data.gare_arrivee}
${data.type_trajet === 'aller-retour' ? `RETOUR PRÉVU le : ${formatDate(data.date_retour)} à ${formatTime(data.date_retour)}` : ''}

Nombre de passagers : ${data.nombre_passagers} ${data.is_pmr ? `(dont ${data.nombre_pmr} PMR)` : ''}
${data.is_pmr ? `Client PMR : ${data.pmr_nom || ''} ${data.pmr_prenom || ''} (${data.pmr_type})\nDossier : ${data.pmr_dossier || 'Non spécifié'}` : `Ref : ${data.relation_number || 'Non spécifié'}`}
${causeSection}

Merci de confirmer la bonne réception.

Cordialement,
${data.redacteur || 'SNCB'}`;
  }

  // --- ACTIONS ---

  function openNew() {
      // SÉCURITÉ WRITE CHECK
      if (!hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_WRITE)) return;

      form = JSON.parse(JSON.stringify(initialForm));
      form.date_trajet = toLocalInput(); 
      form.redacteur = currentUserProfile.full_name || currentUserProfile.email;
      view = 'form';
  }

  function openEdit(cmd) {
      form = JSON.parse(JSON.stringify(cmd));
      
      if(form.date_trajet) form.date_trajet = toLocalInput(form.date_trajet);
      if(form.date_retour) form.date_retour = toLocalInput(form.date_retour);
      
      if(form.taxi_adresse) form.taxi_adresse = cleanData(form.taxi_adresse);
      if(form.taxi_tel) form.taxi_tel = cleanData(form.taxi_tel);
      if(form.taxi_email) form.taxi_email = cleanData(form.taxi_email);

      form.pmr_search = ""; 
      // Sécurité si champ vide
      if(!form.nombre_vehicules) form.nombre_vehicules = 1;

      selectedCommand = null; 
      view = 'form'; 
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
      // SÉCURITÉ WRITE CHECK
      if (!hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_WRITE)) {
          return toast.error("Action non autorisée.");
      }

      if (!form.taxi_nom) return toast.error("Indiquez une société de taxi");
      if (!form.gare_arrivee) return toast.error("Destination requise");

      isSaving = true;
      const payload = { ...form };
      delete payload.pmr_search;

      payload.taxi_adresse = cleanData(payload.taxi_adresse);
      payload.taxi_tel = cleanData(payload.taxi_tel);
      payload.taxi_email = cleanData(payload.taxi_email);

      if (payload.date_trajet) payload.date_trajet = new Date(payload.date_trajet).toISOString();
      if (payload.date_retour) payload.date_retour = new Date(payload.date_retour).toISOString();

      if (!payload.date_retour || payload.type_trajet === 'aller') {
          payload.date_retour = null;
          if (payload.type_trajet === 'aller') { payload.gare_retour_origine = null; payload.gare_retour_arrivee = null; }
      }

      if (form.is_pmr) {
          payload.passager_nom = null; 
          payload.relation_number = null; 
          // En mode PMR, on s'assure d'avoir un nombre de véhicule
          if(!payload.nombre_vehicules) payload.nombre_vehicules = 1;
      } else {
          payload.pmr_nom = null; payload.pmr_type = null; payload.pmr_dossier = null;
          payload.nombre_pmr = 0; payload.pmr_prenom = null; payload.pmr_tel = null; payload.pmr_motif = null;
          payload.nombre_vehicules = 1; // Standard = 1 véhicule par défaut
      }
      
      let error;
      if (form.id) {
          const res = await supabase.from('taxi_commands').update(payload).eq('id', form.id);
          error = res.error;
      } else {
          delete payload.id;
          const res = await supabase.from('taxi_commands').insert([payload]);
          error = res.error;
      }

      isSaving = false;

      if (error) {
          toast.error("Erreur: " + error.message);
      } else {
          toast.success(form.id ? "Commande modifiée !" : "Commande créée !");
          if (!form.id) generatePDF(payload); 
          goBackToList();
      }
  }

  function deleteCommande(id) {
    // SÉCURITÉ DELETE CHECK
    if (!hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_DELETE)) {
        return toast.error("Suppression non autorisée.");
    }

    if(selectedCommand) selectedCommand = null; 
    openConfirmModal("Supprimer cette commande taxi ?", async () => {
        await supabase.from('taxi_commands').delete().eq('id', id);
        loadHistory();
        toast.success("Supprimé");
    });
  }

  // --- PDF GENERATION ---
  async function generatePDF(data = form) {
      const doc = new jsPDF();
      
      try {
          const logoData = await getBase64ImageFromURL('/SNCB_logo.png');
          doc.addImage(logoData, 'PNG', 10, 10, 25, 16.33); 
      } catch (e) { console.warn("Logo non trouvé"); }

      doc.setFont("helvetica", "normal");
      
      const drawBox = (x, y, w, h, title = null) => {
          doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(x, y, w, h);
          if (title) { doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text(title, x + 2, y + 5); }
      };

      doc.setFontSize(16); doc.setFont("helvetica", "bold");
      doc.text("BON DE COMMANDE TAXI", 115, 20, { align: "center" });
      
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
    //   doc.text(`ID Commande : #${data.id || 'NOUVEAU'}`, 195, 20, { align: "right" });

      // BLOC 1
      const yRow1 = 35; const hRow1 = 45;
      drawBox(10, yRow1, 90, hRow1, "1. Bureau émetteur");
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      let cY = yRow1 + 12; const lM = 15;
      doc.text(`Rédacteur : ${data.redacteur || ''}`, lM, cY); cY += 6;
      doc.setFont("helvetica", "bold"); doc.text("OCC Mons", lM, cY); cY += 6;
      doc.text("PACO/RCCA", lM, cY); cY += 6; doc.text("7000 Mons", lM, cY);

      // BLOC 2
      drawBox(105, yRow1, 95, hRow1, "2. A facturer à :");
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      cY = yRow1 + 12; const rM = 110;
      doc.text("SNCB – B-FI.224", rM, cY); cY += 5;
      if (data.is_pmr) doc.text("PO 4523122281 (Voyageurs PMR) (*)", rM, cY);
      else doc.text("PO 4523207823 (Voyageurs/Pers. incident) (*)", rM, cY);
      cY += 6; doc.setFont("helvetica", "normal");
      doc.text("10-01 B-FI. 224", rM, cY); cY += 5; doc.text("Rue de France 56", rM, cY); cY += 5;
      doc.text("1060 Bruxelles", rM, cY); cY += 6; doc.setFont("helvetica", "bold");
      doc.text("N° TVA : BE 0203 430 576", rM, cY);

      // BLOC 3
      const yRow2 = yRow1 + hRow1 + 5; const hRow2 = 40;
      drawBox(10, yRow2, 90, hRow2, "3. Société de Taxi :");
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(data.taxi_nom || "Taxi Indépendant", lM, yRow2 + 15);
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      
      if(data.taxi_tel) {
          doc.setFontSize(9);
          const tels = cleanData(String(data.taxi_tel));
          if(tels.length > 30) doc.setFontSize(8);
          doc.text(`Tel: ${tels}`, lM, yRow2 + 22);
      }
      if(data.taxi_email) { 
          doc.setFontSize(8); 
          const mails = cleanData(String(data.taxi_email));
          doc.text(mails, lM, yRow2 + 28); 
      }
      if(data.taxi_adresse) {
           doc.setFontSize(8);
           const cleanAddr = cleanData(data.taxi_adresse);
           const splitAdd = doc.splitTextToSize(cleanAddr, 80);
           doc.text(splitAdd, lM, yRow2 + 34);
      }

      // BLOC 4
      const isReturn = data.type_trajet === 'aller-retour';
      const hRowTrajet = isReturn ? 60 : 40; 
      drawBox(105, yRow2, 95, hRowTrajet, "4. Trajet :");
      doc.setFontSize(10); const tX = 110; let tY = yRow2 + 12;
      doc.setFont("helvetica", "bold"); doc.text("ALLER :", tX, tY);
      
      const dateStr = `${formatDate(data.date_trajet)} à ${formatTime(data.date_trajet)}`;
      doc.setDrawColor(200, 0, 0); doc.setLineWidth(0.5); doc.rect(tX + 23, tY - 4, 55, 6); 
      doc.setDrawColor(0); doc.setLineWidth(0.3);
      doc.text(dateStr, tX + 25, tY); tY += 6;
      
      doc.setFont("helvetica", "bold"); doc.text("De :", tX, tY);
      doc.setFont("helvetica", "normal"); doc.text(data.gare_origine, tX + 15, tY); tY += 5;
      if(data.gare_via) { doc.setFont("helvetica", "bold"); doc.text("Via :", tX, tY); doc.setFont("helvetica", "normal"); doc.text(data.gare_via, tX + 15, tY); tY += 5; }
      doc.setFont("helvetica", "bold"); doc.text("Vers :", tX, tY); doc.setFont("helvetica", "normal"); doc.text(data.gare_arrivee, tX + 15, tY);

      if (isReturn) {
          tY += 10; doc.setDrawColor(200); doc.line(110, tY - 4, 195, tY - 4); doc.setDrawColor(0);
          doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 150); doc.text("RETOUR :", tX, tY); doc.setTextColor(0);
          doc.setFont("helvetica", "normal");
          const dR = data.date_retour ? formatDate(data.date_retour) : '...';
          const tR = data.date_retour ? formatTime(data.date_retour) : '...';
          doc.text(`${dR} à ${tR}`, tX + 25, tY); tY += 6;
          doc.setFont("helvetica", "bold"); doc.text("De :", tX, tY); doc.setFont("helvetica", "normal"); doc.text(data.gare_retour_origine || data.gare_arrivee, tX + 15, tY); tY += 5;
          doc.setFont("helvetica", "bold"); doc.text("Vers :", tX, tY); doc.setFont("helvetica", "normal"); doc.text(data.gare_retour_arrivee || data.gare_origine, tX + 15, tY);
      }

      // BLOC 5
      const yRow3 = yRow2 + hRowTrajet + 5; const hRow3 = 50; 
      drawBox(10, yRow3, 190, hRow3, "5. Détails & Motif :");
      let pY = yRow3 + 12; const pX = 15;
      doc.setFont("helvetica", "bold"); doc.text("Passager(s) :", pX, pY); doc.setFont("helvetica", "normal");
      let paxInfo = data.is_pmr ? `${data.pmr_nom} ${data.pmr_prenom} (PMR: ${data.pmr_type})` : (data.passager_nom || "Non nominatif");
      if(data.is_pmr && data.pmr_tel) paxInfo += ` - Tel: ${data.pmr_tel}`;
      doc.text(paxInfo, pX + 30, pY);
      
      let nbPax = `${data.nombre_passagers} pers.`;
      if (data.is_pmr) {
          const nbAccompagnants = data.nombre_passagers - data.nombre_pmr;
          const s = nbAccompagnants > 1 ? 's' : '';
          nbPax += ` (dont ${nbAccompagnants} accompagnant${s})`;
      }
      doc.text(nbPax, 150, pY, { align: "right" });
      pY += 8;
      
      doc.setFont("helvetica", "bold");
      if (data.is_pmr) { doc.text("N° Dossier :", pX, pY); doc.setFont("helvetica", "normal"); doc.text(data.pmr_dossier || 'N/A', pX + 30, pY); } 
      else { doc.text("Réf. Relation :", pX, pY); doc.setFont("helvetica", "normal"); doc.text(data.relation_number || 'N/A', pX + 30, pY); }
      pY += 8;
      
      doc.setFont("helvetica", "bold"); 
      
      if (data.is_pmr) {
          doc.text("Cause / Remarques :", pX, pY);
          doc.setFont("helvetica", "normal");
          const cause = data.pmr_motif || 'Non spécifiée';
          const remark = data.motif ? ` (Rem: ${data.motif})` : '';
          const fullReason = `${cause}${remark}`;
          const splitMotif = doc.splitTextToSize(fullReason, 140); 
          doc.text(splitMotif, pX + 40, pY);
          
          // AFFICHAGE NOMBRE DE VÉHICULES EN GRAS
          const motifHeight = splitMotif.length * 5;
          const vehiculeY = pY + motifHeight + 1;
          doc.setFont("helvetica", "bold");
          doc.text(`Nombre de véhicules : ${data.nombre_vehicules || 1}`, pX, vehiculeY);
          
      } else {
          // MODE STANDARD
          doc.text("Motif :", pX, pY);
          doc.setFont("helvetica", "normal");
          const splitMotif = doc.splitTextToSize(data.motif || '', 140); 
          doc.text(splitMotif, pX + 30, pY);
          
          const motifHeight = splitMotif.length * 5;
          const billingY = pY + motifHeight + 1; 
          doc.setFont("helvetica", "bold");
          doc.text("À charge de :", pX, billingY);
          doc.setFont("helvetica", "normal");
          doc.text(data.facturation || '-', pX + 30, billingY);
      }

      // BLOC 6
      const yRow4 = yRow3 + hRow3 + 5; const hRow4 = 35;
      doc.setLineWidth(0.5); doc.rect(10, yRow4, 190, hRow4); doc.setLineWidth(0.3);
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("6. Données du trajet (A remplir par le chauffeur)", 12, yRow4 + 5);
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      const c1X = 15; const c2X = 105; let dY = yRow4 + 12;
      doc.text("Index km départ : ................................... Km", c1X, dY); doc.text("Heure du départ : .................", c2X, dY); dY += 7;
      doc.text("Index km arrivée : .................................. Km", c1X, dY); doc.text("Heure du retour : .................", c2X, dY); dY += 7;
      doc.setFont("helvetica", "bold"); doc.text("Parcours total : .................................... Km", c1X, dY);
      doc.setFont("helvetica", "normal"); doc.text("Durée totale : .....................", c2X, dY); dY += 7;
      doc.setFontSize(7); doc.text("(*) biffer la mention inutile", c1X, dY); doc.setFontSize(9); doc.text("Temps d'attente : .................", c2X, dY);

      // FOOTER
      const yFooter = yRow4 + hRow4 + 10;
      doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.text("Le prestataire certifie l'exécution du transport conformément aux données ci-dessus.", 10, yFooter);
      doc.rect(10, yFooter + 2, 90, 25); doc.text("Signature & Cachet Taxi :", 12, yFooter + 6);
      doc.rect(110, yFooter + 2, 90, 25); doc.text("Signature Agent SNCB (Si présent) :", 112, yFooter + 6);

      doc.save(`Taxi_${data.gare_origine}_${data.id || 'new'}.pdf`);
      if (selectedCommand) selectedCommand = null;
  }

  function sendEmail() {
    const society = availableSocietes.find(s => s.id === form.societe_id);
    const emailTo = society?.email || "";
    // Sélectionner le bon sujet selon le type
    const prefix = form.is_pmr ? `Commande Taxi PMR` : `Commande Taxi`;
    const subject = encodeURIComponent(`${prefix} - ${new Date(form.date_trajet).toLocaleDateString('fr-BE')} - ${form.gare_origine} > ${form.gare_arrivee}`);
    
    window.location.href = `mailto:${emailTo}?subject=${subject}&body=${encodeURIComponent(emailBody)}`;
    toast.info("N'oubliez pas de joindre le PDF à l'e-mail Outlook !");
  }

  // Styles
  const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-[rgb(var(--color-primary))] outline-none transition-all placeholder-gray-600";
  const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1 flex items-center gap-1";
</script>

<svelte:head>
  <title>C3 | Commande Taxi</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-[rgb(var(--color-primary))]" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Vérification des accès...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6">
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))] border border-[rgba(var(--color-primary),0.2)] shadow-[0_0_15px_rgba(var(--color-primary),0.15)]"><Car class="w-8 h-8" /></div>
            <div><h1 class="text-3xl font-bold text-gray-200 tracking-tight">Taxi</h1><p class="text-gray-500 text-sm mt-1">Commandes de Taxis & PMR.</p></div>
        </div>
        
        {#if view === 'list'}
            {#if hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_WRITE)}
                <button on:click={openNew} class="bg-[rgba(var(--color-primary),0.2)] hover:bg-[rgba(var(--color-primary),0.3)] text-[rgb(var(--color-primary))] border border-[rgba(var(--color-primary),0.3)] px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all"><Plus class="w-5 h-5" /> Nouvelle Commande</button>
            {/if}
        {:else}
            <button on:click={goBackToList} class="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all"><ArrowLeft class="w-5 h-5" /> Retour liste</button>
        {/if}
      </header>

      {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-[rgb(var(--color-primary))]" /></div>
      {:else}
        {#if view === 'list'}
            <div class="grid grid-cols-1 gap-4" in:fly={{ y: 20 }}>
                {#if commandes.length === 0}
                    <div class="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-black/20"><p class="text-gray-500">Aucune commande taxi récente.</p></div>
                {:else}
                    {#each commandes as cmd}
                        <button on:click={() => openHistoryOptions(cmd)} class="w-full text-left bg-black/20 border border-white/5 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-[rgba(var(--color-primary),0.3)] hover:bg-white/[0.02] transition-all group relative overflow-hidden">
                            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            <div class="flex-grow space-y-3 relative z-10 w-full">
                                 <div class="flex items-center gap-3 flex-wrap">
                                    {#if cmd.is_pmr}<span class="px-2 py-1 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"><Users size={10}/> PMR</span>
                                    {:else}<span class="px-2 py-1 rounded text-[10px] font-bold uppercase bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))] border border-[rgba(var(--color-primary),0.2)] flex items-center gap-1"><User size={10}/> Clientèle Standard</span>{/if}
                                    
                                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase border {cmd.type_trajet === 'aller-retour' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'} flex items-center gap-1">
                                        {#if cmd.type_trajet === 'aller-retour'}<Repeat size={10}/> Aller-Retour{:else}<ArrowRight size={10}/> Aller Simple{/if}
                                    </span>

                                    <span class="text-lg font-bold text-white tracking-tight">{cmd.taxi_nom}</span>
                                    {#if cmd.is_pmr && cmd.pmr_dossier}<span class="ml-auto md:ml-0 text-xs font-mono text-purple-200 bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/20">Dos: {cmd.pmr_dossier}</span>
                                    {:else if cmd.relation_number}<span class="ml-auto md:ml-0 text-xs font-mono text-[rgb(var(--color-primary))] bg-[rgba(var(--color-primary),0.1)] px-2 py-0.5 rounded border border-[rgba(var(--color-primary),0.2)]">Réf: {cmd.relation_number}</span>{/if}
                                 </div>
                                 <div class="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                    <div class="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5"><Calendar size={14} class="text-gray-500"/> <span class="font-medium text-gray-200">{new Date(cmd.date_trajet).toLocaleDateString('fr-BE', {timeZone:'UTC'})}</span><span class="w-px h-3 bg-white/10 mx-1"></span><span class="font-bold text-[rgb(var(--color-primary))]">{formatTimeLocal(cmd.date_trajet)}</span></div>
                                    <div class="flex items-center gap-2"><span class="text-white font-medium">{cmd.gare_origine}</span> <ArrowRight size={14} class="text-gray-600"/> {#if cmd.gare_via}<span class="text-xs text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">{cmd.gare_via}</span><ArrowRight size={14} class="text-gray-600"/>{/if}<span class="text-white font-medium">{cmd.gare_arrivee}</span></div>
                                 </div>
                                 
                                 {#if cmd.type_trajet === 'aller-retour'}
                                    <div class="w-full h-px bg-white/5 my-1"></div>
                                    <div class="flex items-center gap-4 text-sm text-gray-400">
                                        <div class="flex items-center gap-2 bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-500/10">
                                            <Calendar size={14} class="text-blue-400"/>
                                            <span class="font-medium text-gray-200">{new Date(cmd.date_retour).toLocaleDateString('fr-BE', {timeZone:'UTC'})}</span>
                                            <span class="w-px h-3 bg-white/10 mx-1"></span>
                                            <span class="font-bold text-blue-300">{formatTimeLocal(cmd.date_retour)}</span>
                                        </div>
                                        <div class="flex items-center gap-2 text-blue-200/70">
                                            <span class="font-medium">{cmd.gare_retour_origine}</span>
                                            <ArrowRight size={14} />
                                            <span class="font-medium">{cmd.gare_retour_arrivee}</span>
                                        </div>
                                    </div>
                                 {/if}
                            </div>
                            <div class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 bg-white/5 p-2 rounded-full border border-white/10"><MoreHorizontal size={20} /></div>
                        </button>
                    {/each}
                {/if}
            </div>
        {:else}
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-8" in:fade>
                 <div class="xl:col-span-2 space-y-6">
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
                        <h3 class="text-sm font-bold text-[rgb(var(--color-primary))] uppercase tracking-wide mb-4 flex items-center gap-2"><FileText size={16}/> Mission</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="md:col-span-2">
                                {#if form.is_pmr}
                                    <label class={labelClass}>Cause (PMR)</label>
                                    <select bind:value={form.pmr_motif} class={inputClass + " mb-3"} disabled={isLocked}>
                                        <option value="" disabled selected>-- Sélectionner une cause --</option>
                                        {#each PMR_CAUSES as cause}
                                            <option value={cause}>{cause}</option>
                                        {/each}
                                    </select>
                                    <label class={labelClass}><MessageSquare size={12}/> Remarques</label>
                                    <input type="text" bind:value={form.motif} disabled={isLocked} class={inputClass} placeholder="Détails supplémentaires...">
                                {:else}
                                    <label class={labelClass}>Motif</label>
                                    <input type="text" bind:value={form.motif} disabled={isLocked} class={inputClass} placeholder="Ex: Dérangement L.96...">
                                {/if}
                            </div>
                            <div><label class={labelClass}>Rédacteur</label><input type="text" bind:value={form.redacteur} class={inputClass} readonly></div>
                            <div><label class={labelClass}>Facturation</label><select bind:value={form.facturation} disabled={isLocked} class={inputClass}>{#each FACTURATION_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}</select></div>
                        </div>
                    </div>
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
                         <div class="flex justify-between items-center mb-4"><h3 class="text-sm font-bold text-blue-400 uppercase tracking-wide flex items-center gap-2"><MapPin size={16}/> Trajet</h3>
                            <div class="flex items-center bg-white/5 p-1 rounded-lg border border-white/10"><button disabled={isLocked} class="px-3 py-1 text-xs font-bold rounded-md transition-all {form.type_trajet === 'aller' ? 'bg-blue-500 text-white shadow' : 'text-gray-500 hover:text-gray-300'}" on:click={() => !isLocked && (form.type_trajet = 'aller')}>Aller Simple</button><button disabled={isLocked} class="px-3 py-1 text-xs font-bold rounded-md transition-all {form.type_trajet === 'aller-retour' ? 'bg-blue-500 text-white shadow' : 'text-gray-500 hover:text-gray-300'}" on:click={() => !isLocked && (form.type_trajet = 'aller-retour')}>Aller-Retour</button></div></div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class={labelClass}>Date & Heure</label><input type="datetime-local" bind:value={form.date_trajet} disabled={isLocked} class="{inputClass} dark:[color-scheme:dark]"></div><div><label class={labelClass}>Via (Optionnel)</label><input type="text" list="stations" bind:value={form.gare_via} disabled={isLocked} class={inputClass}></div><div><label class={labelClass}>Départ</label><input type="text" list="stations" bind:value={form.gare_origine} disabled={isLocked} class={inputClass}></div><div><label class={labelClass}>Arrivée</label><input type="text" list="stations" bind:value={form.gare_arrivee} disabled={isLocked} class={inputClass}></div></div>
                        {#if form.type_trajet === 'aller-retour'}<div class="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4" transition:slide><div class="md:col-span-2"><label class="{labelClass} text-blue-400">Date Retour</label><input type="datetime-local" bind:value={form.date_retour} disabled={isLocked} class="{inputClass} dark:[color-scheme:dark] border-blue-500/30"></div><div><label class={labelClass}>Départ Retour</label><input type="text" list="stations" bind:value={form.gare_retour_origine} disabled={isLocked} class={inputClass}></div><div><label class={labelClass}>Arrivée Retour</label><input type="text" list="stations" bind:value={form.gare_retour_arrivee} disabled={isLocked} class={inputClass}></div></div>{/if}<datalist id="stations">{#each uniqueStationNames as st} <option value={st} /> {/each}</datalist>
                    </div>
                </div>
                <div class="space-y-6">
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative">
                        <h3 class="text-sm font-bold text-yellow-400 uppercase tracking-wide mb-4 flex items-center gap-2"><Car size={16}/> Société</h3>
                        <div><input list="taxis-list" type="text" bind:value={form.taxi_nom} on:input={handleTaxiChange} disabled={isLocked} class={inputClass} placeholder="Rechercher..."><datalist id="taxis-list">{#each taxis as t}<option value={t.nom} />{/each}</datalist></div>
                        {#if form.taxi_email || form.taxi_adresse || form.taxi_tel}<div class="mt-4 p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-400 space-y-2" transition:slide>{#if form.taxi_adresse}<div class="flex items-start gap-2"><MapPin size={12} class="mt-0.5 text-gray-500 shrink-0"/> <span>{cleanData(form.taxi_adresse)}</span></div>{/if}{#if form.taxi_email}<div class="flex items-center gap-2 text-blue-200"><Mail size={12} class="text-blue-400 shrink-0"/> <a href="mailto:{cleanData(form.taxi_email)}" class="hover:underline">{cleanData(form.taxi_email)}</a></div>{/if}{#if form.taxi_tel}<div class="flex items-center gap-2 text-green-200"><Phone size={12} class="text-green-400 shrink-0"/> <span>{cleanData(form.taxi_tel)}</span></div>{/if}</div>{/if}
                    </div>
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative overflow-hidden transition-colors duration-300 {form.is_pmr ? 'border-purple-500/30' : ''}"><div class="absolute top-0 left-0 right-0 h-1 transition-colors duration-300 {form.is_pmr ? 'bg-purple-500' : 'bg-[rgb(var(--color-primary))]'}"></div><div class="flex justify-between items-center mb-4 pt-2"><h3 class="text-sm font-bold uppercase tracking-wide flex items-center gap-2 {form.is_pmr ? 'text-purple-400' : 'text-[rgb(var(--color-primary))]'}">{#if form.is_pmr}<Users size={16}/> PMR{:else}<User size={16}/> Passager{/if}</h3></div>
                        <div class="bg-black/40 p-1 rounded-xl flex mb-6 border border-white/10"><button disabled={isLocked} class="flex-1 py-2 rounded-lg text-xs font-bold transition-all { !form.is_pmr ? 'bg-[rgba(var(--color-primary),0.2)] text-[rgb(var(--color-primary))]' : 'text-gray-400 hover:text-white' }" on:click={() => !isLocked && (form.is_pmr = false)}>STANDARD</button><button disabled={isLocked} class="flex-1 py-2 rounded-lg text-xs font-bold transition-all { form.is_pmr ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white' }" on:click={() => !isLocked && (form.is_pmr = true)}>PMR</button></div>
                        <div class="space-y-4">
                            <div class="grid grid-cols-3 gap-4">
                                {#if form.is_pmr}
                                    <div><label class={labelClass}>PMR</label><input type="number" min="1" bind:value={form.nombre_pmr} on:input={updatePmrCount} disabled={isLocked} class={inputClass}></div>
                                    <div><label class={labelClass}>Accomp.</label><input type="number" min="0" value={form.nombre_passagers - form.nombre_pmr} on:input={updateAccompagnants} disabled={isLocked} class={inputClass}></div>
                                    <div><label class={labelClass}>N. Véhicules</label><input type="number" min="1" bind:value={form.nombre_vehicules} disabled={isLocked} class={inputClass}></div>
                                {:else}
                                    <div class="col-span-3"><label class={labelClass}>Total Passagers</label><input type="number" min="1" bind:value={form.nombre_passagers} disabled={isLocked} class={inputClass}></div>
                                {/if}
                            </div>
                            {#if form.is_pmr}<div transition:slide class="space-y-4 pt-2 border-t border-white/5"><div><label class={labelClass}>Client PMR</label><input list="pmr-clients-list" type="text" bind:value={form.pmr_search} on:input={handlePmrSelect} disabled={isLocked} class={inputClass}><datalist id="pmr-clients-list">{#each pmrClients as c}<option value={`${c.nom} ${c.prenom}`}>{c.type || '?'}</option>{/each}</datalist></div><div><label class={labelClass}>Type</label><select bind:value={form.pmr_type} disabled={isLocked} class={inputClass}><option value="NV">Non-Voyant</option><option value="CRF">Chaise Roulante Fixe</option><option value="CRE">Chaise Roulante Electrique</option><option value="CRP">Chaise Roulante Pliable</option><option value="MR">Marche Difficile</option><option value="Diff">Autre difficulté</option></select></div><div class="grid grid-cols-2 gap-2"><input type="text" placeholder="Nom" bind:value={form.pmr_nom} disabled={isLocked} class={inputClass}><input type="text" placeholder="Prénom" bind:value={form.pmr_prenom} disabled={isLocked} class={inputClass}></div><div><label class={labelClass}>Téléphone</label><input type="text" bind:value={form.pmr_tel} disabled={isLocked} class={inputClass}></div><div><label class={labelClass}>N° Dossier</label><input type="text" bind:value={form.pmr_dossier} disabled={isLocked} class="{inputClass} border-purple-500/30"></div></div>{:else}<div transition:slide class="space-y-4 pt-2 border-t border-white/5"><div><label class={labelClass}>Nom Passager</label><input type="text" bind:value={form.passager_nom} disabled={isLocked} class={inputClass}></div><div><label class={labelClass}>Réf / Ordre</label><input type="text" bind:value={form.relation_number} disabled={isLocked} class={inputClass}></div></div>{/if}
                        </div>
                    </div>
                </div>
            </div>

            <div class="fixed bottom-4 left-4 right-4 z-50 flex flex-wrap justify-end items-center gap-4 p-4 border border-white/10 bg-[#0f1115]/80 backdrop-blur-2xl shadow-2xl rounded-2xl" in:fly={{ y: 20 }}>
                <button on:click={() => openEmailModal(form)} class="mr-auto px-5 py-2.5 rounded-full text-sm font-bold text-blue-400 bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-all flex items-center gap-2"><Mail class="w-4 h-4" /> <span class="hidden sm:inline">E-mail</span></button>
                
                {#if !isLocked}
                    <button on:click={() => saveCommande()} disabled={isSaving} class="px-6 py-2.5 rounded-full text-sm font-bold text-[rgb(var(--color-primary))] bg-[rgba(var(--color-primary),0.1)] border border-[rgba(var(--color-primary),0.2)] hover:bg-[rgba(var(--color-primary),0.2)] hover:text-white shadow-[0_0_20px_rgba(var(--color-primary),0.3)] transition-all flex items-center gap-2 disabled:opacity-50">{#if isSaving}<Loader2 class="w-4 h-4 animate-spin"/>{:else}<Save class="w-4 h-4" />{/if} <span>{form.id ? 'Modifier' : 'Enregistrer'} & PDF</span></button>
                {/if}
            </div>
            <div class="h-24"></div>
        {/if}
      {/if}
    </div>
{/if} {#if selectedCommand}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
        <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" in:scale={{start: 0.95}}>
            <button on:click={() => selectedCommand = null} class="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20}/></button>
            <h3 class="text-lg font-bold text-white mb-1">Commande #{selectedCommand.id}</h3>
            <p class="text-sm text-gray-400 mb-6">{new Date(selectedCommand.date_trajet).toLocaleDateString()} - {selectedCommand.taxi_nom}</p>
            <div class="space-y-3">
                {#if hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_WRITE)}
                    <button on:click={() => openEdit(selectedCommand)} class="w-full py-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold hover:bg-purple-500/20 flex items-center justify-center gap-2"><FilePenLine size={18}/> Modifier</button>
                {/if}
                <div class="grid grid-cols-2 gap-3">
                    <button on:click={() => generatePDF(selectedCommand)} class="w-full py-3 rounded-xl bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))] border border-[rgba(var(--color-primary),0.2)] font-bold hover:bg-[rgba(var(--color-primary),0.2)] flex items-center justify-center gap-2"><Printer size={18}/> PDF</button>
                    <button on:click={() => openEmailModal(selectedCommand)} class="w-full py-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold hover:bg-blue-500/20 flex items-center justify-center gap-2"><Mail size={18}/> Email</button>
                </div>
                <div class="h-px bg-white/10 my-2"></div>
                {#if hasPermission(currentUserProfile, ACTIONS.GENERATE_TAXI_DELETE)}
                    <button on:click={() => deleteCommande(selectedCommand.id)} class="w-full py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold hover:bg-red-500/20 flex items-center justify-center gap-2"><Trash2 size={18}/> Supprimer</button>
                {/if}
            </div>
        </div>
    </div>
{/if}

{#if showEmailExport}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" in:fly={{ y: 20 }}>
      <div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold text-white flex items-center gap-2"><Mail class="text-blue-400" size={20} /> Aperçu E-mail</h3><button on:click={() => showEmailExport = false} class="text-gray-500 hover:text-white"><X size={20} /></button></div>
      <div class="relative group"><textarea readonly class="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none font-mono" bind:value={emailPreviewContent}></textarea><button on:click={copyToClipboard} class="absolute top-3 right-3 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 shadow-lg transition-all flex items-center gap-2 text-xs font-bold">{#if hasCopied}<Check size={14} /> Copié{:else}<ClipboardCopy size={14} /> Copier{/if}</button></div>
       <div class="mt-6 flex justify-between gap-3"><button on:click={() => showEmailExport = false} class="px-4 py-2 rounded-xl bg-white/5 text-gray-400 font-bold hover:bg-white/10 transition-colors">Fermer</button><button on:click={sendEmail} class="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"><Mail size={18} /> Ouvrir Outlook</button></div>
    </div>
  </div>
{/if}