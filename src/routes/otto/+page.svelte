<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade, slide } from 'svelte/transition';
  import jsPDF from 'jspdf';
  import { openConfirmModal } from '$lib/stores/modal.js';
  import OttoTutorialModal from '$lib/components/OttoTutorialModal.svelte';
  import autoTable from 'jspdf-autotable';
  import Map from '$lib/components/ui/map/Map.svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import * as XLSX from 'xlsx';
  import { 
    Bus, Calendar, Clock, MapPin, CheckSquare, Square, 
    FileText, Save, Trash2, Plus, Loader2, ArrowLeft,
    Printer, Download, Building2, Hash, Users, ArrowRightLeft, MinusCircle,
    Search, Filter, X, CheckCircle, User, UserCheck, ChevronDown, Mail, ClipboardCopy, Check, LockOpen, School
  } from 'lucide-svelte';
  
  import { toast } from '$lib/stores/toast.js';
  import { hasPermission, ACTIONS } from '$lib/permissions';

  // --- ÉTATS ---
  let view = 'list';
  let isLoading = true;
  let isSaving = false;
  let commandes = [];
  let showEmailExport = false;
  let hasCopied = false;
  let showTutorial = false;

  let currentUserProfile = null; 
  let isAuthorized = false; 

  let showCompanyDropdown = false; 
  let searchTerm = "";
  let statusFilter = "all";
  let dateFilter = "";

  let availableLines = [];
  let availableStops = [];
  let uniqueStationNames = [];
  let availableSocietes = [];
  let availableChauffeurs = [];
  let societeInputValue = ""; 

  // --- VARIABLES CARTE & GEOCODING ---
  let currentRoute = null;
  let currentMarkers = [];
  let isComputingRoute = false;
  const coordsCache = {}; 

  // 1. GEOCODING (Nominatim)
  async function getGareCoordinates(gareName) {
      if (!gareName) return null;
      const cleanName = gareName.replace(/\(.*\)/, '').trim();
      if (coordsCache[cleanName]) return coordsCache[cleanName];

      const queries = [
          `Gare de ${cleanName}, Belgique`,
          `${cleanName} Station, Belgium`,
          `${cleanName}, Belgique`
      ];

      for (const query of queries) {
          try {
              const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
              const res = await fetch(url, { headers: { 'User-Agent': 'BacoApp/1.0' } });
              if (res.ok) {
                  const data = await res.json();
                  if (data && data.length > 0) {
                      const coords = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
                      coordsCache[cleanName] = coords; 
                      return coords;
                  }
              }
          } catch (e) { console.warn(`Erreur recherche "${query}":`, e); }
          await new Promise(r => setTimeout(r, 100));
      }
      return null;
  }

  // 2. ROUTING (OSRM)
  async function fetchRouteOSRM(coordinates) {
      if (!coordinates || coordinates.length < 2) return null;
      // OSRM format: lon1,lat1;lon2,lat2
      const coordString = coordinates.map(c => c.join(',')).join(';');
      
      try {
          const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();

          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
              return data.routes[0].geometry;
          }
      } catch (e) {
          console.warn("Erreur OSRM, fallback ligne droite:", e);
      }
      
      // Fallback Ligne Droite
      return {
          type: 'LineString',
          coordinates: coordinates
      };
  }

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
    is_direct: true, 
    is_mail_sent: false,
    is_aller_retour: false,
    nombre_voyageurs: null,
    nombre_pmr: null,
    capacite_bus: 50,
    sent_at: null,      
    sent_by_name: null, 
    bus_data: [
        { plaque: '', heure_prevue: '', heure_confirmee: '', heure_demob: '', chauffeur_id: null, is_specific_route: false, origine_specifique: '', destination_specifique: '' }
    ]
  };

  let form = JSON.parse(JSON.stringify(initialForm));

  // --- LOGIQUE CARTE RÉACTIVE ---
  let searchTimeout; // Déclaré une seule fois ici

  $: if (form.origine && form.destination) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
          // Évite le recalcul si rien n'a changé
          if (currentRoute && 
              currentRoute.properties?.startName === form.origine && 
              currentRoute.properties?.endName === form.destination &&
              currentMarkers.length === (form.arrets.length + 2)) {
              return;
          }

          isComputingRoute = true;
          
          let stopsToProcess = [];
          if (!form.is_direct && form.arrets.length > 0) {
             stopsToProcess = getSortedArrets(form.arrets, form.lignes);
          }

          const startPromise = getGareCoordinates(form.origine);
          const endPromise = getGareCoordinates(form.destination);
          const stopsPromises = stopsToProcess.map(stopName => getGareCoordinates(stopName));

          const [startCoords, endCoords, ...stopsCoordsResults] = await Promise.all([
              startPromise, 
              endPromise, 
              ...stopsPromises
          ]);

          let newMarkers = [];
          let routeWaypoints = [];

          if (startCoords) {
              newMarkers.push({ lngLat: startCoords, label: `Départ: ${form.origine}`, type: 'start' });
              routeWaypoints.push(startCoords);
          }

          stopsCoordsResults.forEach((coords, index) => {
              if (coords) {
                  newMarkers.push({ lngLat: coords, label: stopsToProcess[index], type: 'stop' });
                  routeWaypoints.push(coords);
              }
          });

          if (endCoords) {
              newMarkers.push({ lngLat: endCoords, label: `Arrivée: ${form.destination}`, type: 'end' });
              routeWaypoints.push(endCoords);
          }

          if (startCoords && endCoords) {
              currentMarkers = newMarkers;
              
              // Appel OSRM pour le tracé routier
              const preciseGeometry = await fetchRouteOSRM(routeWaypoints);

              currentRoute = {
                  "type": "Feature",
                  "properties": {
                      startName: form.origine,
                      endName: form.destination
                  },
                  "geometry": preciseGeometry
              };
          } else {
              currentRoute = null;
              currentMarkers = [];
          }
          isComputingRoute = false;
      }, 1000);
  } else {
      currentRoute = null;
      currentMarkers = [];
  }

  $: isLocked = form.status === 'envoye' || !hasPermission(currentUserProfile, ACTIONS.OTTO_WRITE);

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return goto('/');

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
    
    currentUserProfile = { ...session.user, ...profile };

    if (!hasPermission(currentUserProfile, ACTIONS.OTTO_READ)) {
        toast.error("Accès refusé.");
        return goto('/accueil');
    }

    isAuthorized = true;
    await Promise.all([loadCommandes(), loadLinesRef(), loadSocietes(), loadAllStops()]);
    isLoading = false;
  });

  $: if (form.relation && !form.relation.startsWith('TC_')) {
      form.relation = 'TC_';
  }

  $: if (form.societe_id && availableSocietes.length > 0) {
      const selected = availableSocietes.find(s => s.id === form.societe_id);
      if (selected && selected.nom.toLowerCase() !== societeInputValue.toLowerCase()) {
          societeInputValue = selected.nom;
      }
      if (selected && availableChauffeurs.length === 0) loadChauffeurs(form.societe_id);
  }

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

  function exportToExcel() {
    const dataToExport = filteredCommandes.map(cmd => ({
        Relation: cmd.relation,
        Type: cmd.is_direct ? 'Direct' : 'Omnibus',
        Société: cmd.societes_bus?.nom || 'Inconnue',
        Statut: cmd.status === 'envoye' ? 'Clôturé' : 'Brouillon',
        Date: new Date(cmd.date_commande).toLocaleDateString('fr-BE'),
        'Heure Appel': cmd.heure_appel || '',
        Origine: cmd.origine || '',
        Destination: cmd.destination || '',
        Motif: cmd.motif || '',
        'Mail Envoyé': cmd.is_mail_sent ? 'Oui' : 'Non',
        Créateur: cmd.creator?.full_name || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Commandes Otto");
    XLSX.writeFile(workbook, `Export_Otto_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Fichier Excel généré !");
  }

  function exportListPDF() {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text("Liste des Commandes Bus (Otto)", 15, 15);
    
    const rows = filteredCommandes.map(cmd => [
        cmd.relation,
        cmd.is_direct ? 'Direct' : 'Omnibus',
        cmd.societes_bus?.nom || '-',
        cmd.status === 'envoye' ? 'Clôturé' : 'Brouillon',
        new Date(cmd.date_commande).toLocaleDateString('fr-BE'),
        cmd.origine + " -> " + cmd.destination,
        cmd.motif
    ]);

    autoTable(doc, {
        startY: 25,
        head: [['Relation', 'Type', 'Société', 'Statut', 'Date', 'Parcours', 'Motif']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] },
        styles: { fontSize: 8 }
    });

    doc.save(`Liste_Otto_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Liste PDF générée !");
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
    const { data } = await supabase.from('societes_bus').select('id, nom, adresse, telephone, email').order('nom');
    if (data) availableSocietes = data;
  }

  async function loadChauffeurs(societeId) {
      if (!societeId) { availableChauffeurs = []; return; }
      const { data } = await supabase.from('chauffeurs_bus').select('*').eq('societe_id', societeId).order('nom');
      if (data) availableChauffeurs = data;
  }

  $: emailBody = `Bonjour, voici le réquisitoire pour le trajet de ce ${new Date(form.date_commande).toLocaleDateString('fr-BE')} entre ${form.origine || '?'} et ${form.destination || '?'} - ${form.relation} (${form.is_direct ? 'Direct' : 'Omnibus'})

Merci pour vos services,

Cordialement,

${form.validator?.full_name || currentUserProfile?.full_name || 'Équipe PACO'}
PACO Sud-Ouest`;

  function sendEmail() {
    const society = availableSocietes.find(s => s.id === form.societe_id);
    const emailTo = society?.email || "";
    const subject = encodeURIComponent(`Réquisitoire Bus - ${form.relation} - ${new Date(form.date_commande).toLocaleDateString('fr-BE')}`);
    window.location.href = `mailto:${emailTo}?subject=${subject}&body=${encodeURIComponent(emailBody)}`;
    toast.info("N'oubliez pas de joindre le PDF à l'e-mail Outlook !");
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(emailBody);
      hasCopied = true;
      toast.success("Message copié !");
      setTimeout(() => hasCopied = false, 2000);
    } catch (err) { toast.error("Erreur lors de la copie"); }
  }

  // --- LOGIQUE METIER ---
  $: if (form.lignes.length > 0) loadStopsForLines(form.lignes);
  else availableStops = [];

  let stopsMetadata = []; 

  async function loadStopsForLines(lines) {
    const { data } = await supabase.from('ligne_data').select('gare, ligne_nom, ordre').in('ligne_nom', lines); 
    if (data) {
        stopsMetadata = data;
        availableStops = [...new Set(data.map(d => `${d.gare} (${d.ligne_nom})`))];
    }
  }

  function getSortedArrets(arretsSelectionnes, lignesSelectionnees) {
    if (arretsSelectionnes.length <= 1) return arretsSelectionnes;
    const mapped = arretsSelectionnes.map(stopFull => {
        const [gare, rest] = stopFull.split(' (');
        const ligneNom = rest.replace(')', '');
        return stopsMetadata.find(m => m.gare === gare && m.ligne_nom === ligneNom);
    }).filter(Boolean);

    let finalSorted = [];
    const originNode = stopsMetadata.find(s => s.gare === form.origine);
    const destNode = stopsMetadata.find(s => s.gare === form.destination);
    let isDescending = false;
    if (originNode && destNode) isDescending = originNode.ordre > destNode.ordre;

    lignesSelectionnees.forEach(nomLigne => {
        let arretsDeCetteLigne = mapped.filter(m => m.ligne_nom === nomLigne);
        if (arretsDeCetteLigne.length === 0) return;
        arretsDeCetteLigne.sort((a, b) => isDescending ? b.ordre - a.ordre : a.ordre - b.ordre);
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
      form.bus_data = [...form.bus_data, { plaque: '', heure_prevue: lastBus.heure_prevue || '', heure_confirmee: '', heure_demob: lastBus.heure_demob || '', chauffeur_id: null, is_specific_route: false }];
  }

  function removeBus(index) {
      if (form.bus_data.length > 1) form.bus_data = form.bus_data.filter((_, i) => i !== index);
  }

  function handleSocieteChange(event) {
      const val = event.target.value;
      societeInputValue = val;
      if (!val) { clearSocieteSelection(); return; }
      const match = availableSocietes.find(s => s.nom.toLowerCase() === val.toLowerCase());
      if (match) {
          if (form.societe_id !== match.id) selectSociete(match.id);
      } else {
          if (form.societe_id !== null) {
              form.societe_id = null;
              availableChauffeurs = [];
              form.bus_data = form.bus_data.map(b => ({ ...b, chauffeur_id: null }));
          }
      }
  }

  function clearSocieteSelection() {
      societeInputValue = "";
      form.societe_id = null;
      availableChauffeurs = [];
      form.bus_data = form.bus_data.map(b => ({ ...b, chauffeur_id: null }));
  }

  function selectSociete(id) {
      form.societe_id = id;
      loadChauffeurs(id);
      form.bus_data = form.bus_data.map(b => ({ ...b, chauffeur_id: null }));
  }

  function goBackToList() {
      view = 'list';
      goto('/otto', { replaceState: true, noScroll: true });
  }

  function openNew() {
      if (!hasPermission(currentUserProfile, ACTIONS.OTTO_WRITE)) return;
      form = JSON.parse(JSON.stringify(initialForm));
      form.relation = 'TC_';
      societeInputValue = ""; 
      availableChauffeurs = [];
      view = 'form';
      goto('/otto', { replaceState: true, noScroll: true });
  }

  function openEdit(cmd, updateUrl = true) {
      const safeBusData = (cmd.bus_data && cmd.bus_data.length > 0) 
          ? cmd.bus_data.map(b => ({
              ...b,
              chauffeur_id: b.chauffeur_id || null, 
              is_specific_route: !!b.is_specific_route,
              origine_specifique: b.origine_specifique || '',
              destination_specifique: b.destination_specifique || ''
          }))
          : [{ plaque: cmd.plaque || '', heure_prevue: cmd.heure_prevue || '', heure_confirmee: cmd.heure_confirmee || '', heure_demob: cmd.heure_demob || '', chauffeur_id: null, is_specific_route: false }];

      form = { ...cmd, bus_data: safeBusData };
      if (form.societe_id) loadChauffeurs(form.societe_id);
      else { societeInputValue = ""; availableChauffeurs = []; }
      view = 'form';
      if (updateUrl) goto(`?id=${cmd.id}`, { replaceState: false, noScroll: true, keepFocus: true });
  }

  async function saveCommande(targetStatus = 'brouillon') {
      if (!hasPermission(currentUserProfile, ACTIONS.OTTO_WRITE)) return toast.error("Action non autorisée.");
      if (!form.motif) return toast.error("Le motif est requis");
      if (!form.societe_id) return toast.error("Veuillez sélectionner une société valide");
      if (!form.relation || form.relation.trim() === 'TC_' || form.relation.length < 4) return toast.error("Réf. relation requise");

      isSaving = true;
      const currentUserId = currentUserProfile.id;
      const currentUserName = currentUserProfile.full_name || 'Utilisateur inconnu';

      const payload = {
          motif: form.motif,
          relation: form.relation,
          date_commande: form.date_commande,
          heure_appel: form.heure_appel,
          societe_id: form.societe_id,
          lignes: form.lignes,
          arrets: form.is_direct ? [] : form.arrets,
          origine: form.origine,
          is_direct: form.is_direct,
          destination: form.destination,
          is_aller_retour: form.is_aller_retour,
          nombre_voyageurs: form.nombre_voyageurs,
          nombre_pmr: form.nombre_pmr,
          is_mail_sent: form.is_mail_sent,
          capacite_bus: form.capacite_bus,
          bus_data: form.bus_data,
          status: targetStatus
      };

      if (!form.id) payload.user_id = currentUserId;
      if (targetStatus === 'envoye') {
          payload.validated_by = currentUserId;
          if (!form.sent_at) {
            payload.sent_at = new Date().toISOString();
            payload.sent_by_name = currentUserName;
            form.sent_at = payload.sent_at;
            form.sent_by_name = payload.sent_by_name;
          }
      }

      let error;
      if (form.id) {
          const res = await supabase.from('otto_commandes').update(payload).eq('id', form.id);
          error = res.error;
      } else {
          const res = await supabase.from('otto_commandes').insert([payload]).select();
          error = res.error;
      }

      isSaving = false;
      if (error) toast.error("Erreur: " + error.message);
      else {
          toast.success(targetStatus === 'envoye' ? "Commande clôturée !" : "Brouillon sauvegardé");
          await loadCommandes();
          goBackToList();
      }
  }

  async function duplicateCommande(cmd) {
    const newForm = JSON.parse(JSON.stringify(cmd));
    newForm.id = null;
    newForm.status = 'brouillon';
    newForm.date_commande = new Date().toISOString().split('T')[0];
    newForm.created_at = null;
    newForm.sent_at = null;
    newForm.sent_by_name = null;
    newForm.validated_by = null;
    newForm.is_mail_sent = false;
    newForm.bus_data = newForm.bus_data.map(b => ({ ...b, plaque: '', heure_confirmee: '', heure_demob: '', chauffeur_id: null }));
    form = newForm;
    if (form.societe_id) await loadChauffeurs(form.societe_id);
    view = 'form';
    toast.success("Commande dupliquée !");
  }

  function unlockCommande() {
      if (!hasPermission(currentUserProfile, ACTIONS.OTTO_WRITE)) return toast.error("Non autorisé.");
      openConfirmModal("Déverrouiller ce bon ?", async () => await saveCommande('brouillon'));
  }

  function deleteCommande(id) {
      if (!hasPermission(currentUserProfile, ACTIONS.OTTO_DELETE)) return toast.error("Non autorisé.");
      openConfirmModal("Supprimer cette commande ?", async () => {
          await supabase.from('otto_commandes').delete().eq('id', id);
          loadCommandes();
          toast.success("Commande supprimée");
      });
  }

  // --- GENERATION PDF ---
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

  async function generatePDF() {
    const doc = new jsPDF();
    const society = availableSocietes.find(s => s.id === form.societe_id);
    let creatorName = form.creator?.full_name || currentUserProfile?.full_name || "Inconnu";

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

    let y = 75;
    doc.setLineWidth(0.5);
    doc.setDrawColor(0);
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

    y += 25;
    const infoStartY = y; 
    y += 8;
    const labelX = 20; const valueX = 70;

    doc.setFont("helvetica", "bold"); doc.text("Date de circulation :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(new Date(form.date_commande).toLocaleDateString('fr-BE'), valueX, y);
    doc.setFont("helvetica", "bold"); doc.text("Type :", 110, y);
    doc.setFont("helvetica", "normal"); doc.text(form.is_direct ? "DIRECT (Sans arrêt)" : "OMNIBUS (Avec arrêts)", 130, y);

    y += 10;
    doc.setFont("helvetica", "bold"); doc.text("Motif :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.motif || '', valueX, y);
    y += 8;
    doc.setDrawColor(200); doc.line(20, y-4, 190, y-4); doc.setDrawColor(0);

    doc.setFont("helvetica", "bold"); doc.text("Lieu Origine :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.origine || '?', valueX, y);
    y += 6;

    if (!form.is_direct && form.arrets?.length > 0) {
        doc.setFont("helvetica", "bold"); doc.text("Arrêts intermédiaires :", labelX, y);
        doc.setFont("helvetica", "normal"); 
        const sorted = getSortedArrets(form.arrets, form.lignes);
        const arretsSplit = doc.splitTextToSize(sorted.join(', '), 120);
        doc.text(arretsSplit, valueX, y);
        y += (arretsSplit.length * 5) + 2;
    }

    doc.setFont("helvetica", "bold"); doc.text("Lieu Destination :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.destination || '?', valueX, y);
    y += 8;

    doc.setFont("helvetica", "bold"); doc.text("Deux sens :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.is_aller_retour ? "OUI" : "NON", valueX, y);
    y += 8;

    doc.setFont("helvetica", "bold"); doc.text("Lignes concernées :", labelX, y);
    doc.setFont("helvetica", "normal"); doc.text(form.lignes.join(', ') || '-', valueX, y);
    doc.setFont("helvetica", "bold"); doc.text("Heure d'appel :", 110, y);
    doc.setFont("helvetica", "normal"); doc.text(form.heure_appel || '--:--', 140, y);
    y += 5; 

    doc.rect(15, infoStartY, 180, y - infoStartY);
    y += 10; 

    const busRows = form.bus_data.map((b, i) => {
        const chauf = availableChauffeurs.find(c => c.id == b.chauffeur_id);
        const chauffeurStr = chauf ? `\nChauffeur: ${chauf.nom}\nTel: ${chauf.tel}` : ''; 
        const routeStr = b.is_specific_route && (b.origine_specifique || b.destination_specifique)
            ? `\n[TRAJET]: ${b.origine_specifique || '?'} -> ${b.destination_specifique || '?'}` : '';
        return [`Bus ${i+1}${chauffeurStr}${routeStr}`, b.plaque || '?', b.heure_prevue || '-', b.heure_confirmee || '-', b.heure_demob || '-'];
    });

    autoTable(doc, {
        startY: y,
        head: [['Véhicule / Info', 'Plaque', 'H. Prévue', 'H. Confirmée', 'Démob.']],
        body: busRows,
        theme: 'grid',
        headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3, valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.1 }, 
        margin: { left: 15, right: 15 }, 
        tableWidth: 180,                 
        columnStyles: { 0: { cellWidth: 80 } }
    });

    y = doc.lastAutoTable.finalY + 10;
    if (y > 270) { doc.addPage(); y = 20; }

    doc.setFont("helvetica", "bold"); doc.text("Nombre de voyageurs :", 20, y);
    doc.setFont("helvetica", "normal"); doc.text(String(form.nombre_voyageurs || 'Non communiqué'), 60, y);
    doc.setFont("helvetica", "bold"); doc.text("Dont PMR :", 110, y);
    doc.setFont("helvetica", "normal"); doc.text(String(form.nombre_pmr || '0'), 135, y);

    let footerY = Math.max(230, y + 20);
    if (footerY + 45 > doc.internal.pageSize.height - 10) { doc.addPage(); footerY = 20; }

    doc.setDrawColor(0); doc.rect(15, footerY, 180, 45);
    doc.setFontSize(10); 
    doc.setFont("helvetica", "bold"); doc.text("Adresse de facturation :", 20, footerY + 6);
    doc.setFont("helvetica", "normal"); doc.text(["SNCB", "Purchase Accounting B-F.224", "Rue de France 56", "1060 BRUXELLES"], 20, footerY + 12);
    
    const legX = 100;
    doc.setFont("helvetica", "bold"); doc.text("Mentions obligatoires sur la facture :", legX, footerY + 6);
    doc.setFont("helvetica", "normal"); doc.text(`Numéro de TVA : BE 0203 430 576`, legX, footerY + 12);
    doc.text(`N° SAP de la commande : 4522 944 778`, legX, footerY + 17);
    doc.setFont("helvetica", "bold"); doc.text(`Numéro de relation : ${form.relation}`, legX, footerY + 25);

    const safe = (str) => (str || '').replace(/[\\/:*?"<>|]/g, '-');
    const fileName = `${form.date_commande} - C3 - ${safe(society?.nom || 'Inconnue')} - ${safe(form.origine)} - ${safe(form.destination)}.pdf`;
    doc.save(fileName);
  }

  const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-orange-500/50 outline-none transition-all placeholder-gray-600";
  const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1 flex items-center gap-1";
</script>

<svelte:head>
  <title>C3 | Commande Bus</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-orange-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Vérification des accès...</p>
    </div>
{:else}
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
            <button on:click={() => showTutorial = true} class="btn-themed px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all border" style="--primary-rgb: var(--color-primary);">
              <School class="w-5 h-5" />
            </button>

            {#if hasPermission(currentUserProfile, ACTIONS.OTTO_WRITE)}
                <button on:click={openNew} class="btn-themed px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all border" style="--primary-rgb: var(--color-primary);">
                  <Plus class="w-5 h-5" /> Nouvelle Commande
                </button>
            {/if}
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

                    <button on:click={exportToExcel} class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                        <Download size={14} /> Excel
                    </button>
                    <button on:click={exportListPDF} class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center gap-2">
                        <Printer size={14} /> PDF
                    </button>

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
                        <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4 transition-all group 
                            {cmd.status === 'envoye' ? 'opacity-60 grayscale-[30%] hover:opacity-100 hover:grayscale-0' : 'hover:border-orange-500/30'}">
                            <div class="flex-grow min-w-0 w-full">
                                <div class="flex items-center gap-3 mb-3 flex-wrap">
                                    <span class="text-xl font-extrabold text-white tracking-tight">{cmd.relation}</span>
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border {cmd.is_direct ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}">
                                        {cmd.is_direct ? 'Direct' : 'Omnibus'}
                                    </span>
                                    <span class="flex items-center gap-1.5 px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold uppercase shadow-[0_0_10px_rgba(37,99,235,0.1)]">
                                        <Building2 size={12} /> {cmd.societes_bus?.nom || 'Inconnu'}
                                    </span>
                                    <span class="text-xs px-2 py-0.5 rounded border ml-auto md:ml-0 font-bold {cmd.status === 'envoye' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}">
                                        {cmd.status === 'envoye' ? 'Clôturé' : 'Brouillon'}
                                    </span>
                                    {#if cmd.is_mail_sent}
                                        <span class="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold uppercase shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                            <CheckCircle size={12} /> Mail envoyé
                                        </span>
                                    {/if}
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
                                    {#if cmd.status === 'envoye' && cmd.sent_at}
                                        <div class="flex items-center gap-1.5 text-emerald-500/80" title="Envoyé le">
                                            <Mail size={12} /> <span class="text-emerald-400">Le {new Date(cmd.sent_at).toLocaleDateString('fr-BE')} par {cmd.sent_by_name || 'Inconnu'}</span>
                                        </div>
                                    {:else if cmd.validator}
                                        <div class="flex items-center gap-1.5 text-red-500/70" title="Clôturé par">
                                            <UserCheck size={12} /> <span class="text-red-400">{cmd.validator.full_name}</span>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                            <div class="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity self-start mt-2 md:mt-0">
                                <button on:click={() => openEdit(cmd)} class="p-2 hover:bg-white/10 rounded-lg text-blue-400" title="Détails/Éditer"><FileText class="w-5 h-5" /></button>
                                <button on:click={() => duplicateCommande(cmd)} class="p-2 hover:bg-green-500/10 rounded-lg text-green-400" title="Dupliquer"><ClipboardCopy class="w-5 h-5" /></button>
                                {#if hasPermission(currentUserProfile, ACTIONS.OTTO_DELETE)}
                                    <button on:click={() => deleteCommande(cmd.id)} class="p-2 hover:bg-red-500/10 rounded-lg text-red-400" title="Supprimer"><Trash2 class="w-5 h-5" /></button>
                                {/if}
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
                            <div class="md:col-span-2"><label class={labelClass}>Motif</label><input type="text" bind:value={form.motif} disabled={isLocked} class={inputClass} placeholder="Ex: Dérangement L.96..."></div>
                            <div><label class={labelClass}>Date</label><input type="date" bind:value={form.date_commande} disabled={isLocked} class="{inputClass} dark:[color-scheme:dark]"></div>
                            <div><label class={labelClass}>Heure d'appel</label><input type="time" bind:value={form.heure_appel}  disabled={isLocked} class="{inputClass} dark:[color-scheme:dark]"></div>
                            <div><label class={labelClass}>Réf. Relation (TC)</label><input type="text" bind:value={form.relation} disabled={isLocked} class={inputClass} placeholder="TC_123456"></div>
                            <div>
                                <label class={labelClass}>Société</label>
                                <div class="relative group">
                                   <input type="text" list="list_societes" bind:value={societeInputValue} on:input={handleSocieteChange} disabled={isLocked} class="{inputClass} pr-8" placeholder="Rechercher une société...">
                                   <datalist id="list_societes">{#each availableSocietes as soc}<option value={soc.nom}>{soc.nom}</option>{/each}</datalist>
                                   {#if societeInputValue && !isLocked}
                                        <button type="button" on:click={clearSocieteSelection} class="absolute right-2 top-2.5 text-gray-500 hover:text-white transition-colors" title="Effacer"><X size={16} /></button>
                                   {:else if form.societe_id}
                                        <div class="absolute right-3 top-2.5 text-orange-400 pointer-events-none"><CheckCircle size={16} /></div>
                                   {/if}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 space-y-4">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-sm font-bold text-blue-400 uppercase tracking-wide flex items-center gap-2"><MapPin size={16}/> Parcours</h3>
                            <div class="flex items-center gap-4">
                                <label class="flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors border border-white/10">
                                    <input type="checkbox" bind:checked={form.is_direct} disabled={isLocked} class="hidden">
                                    <span class="text-[10px] font-bold {form.is_direct ? 'text-orange-400' : 'text-gray-500'}">DIRECT</span>
                                    <div class="relative w-8 h-4 bg-gray-700 rounded-full transition-colors"><div class="absolute top-1 left-1 w-2 h-2 bg-white rounded-full transition-transform {form.is_direct ? '' : 'translate-x-4'}"></div></div>
                                    <span class="text-[10px] font-bold {!form.is_direct ? 'text-yellow-400' : 'text-gray-500'}">OMNIBUS</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors border border-white/10">
                                    <input type="checkbox" bind:checked={form.is_aller_retour} disabled={isLocked} class="hidden">
                                    <span class="text-xs font-bold {form.is_aller_retour ? 'text-blue-400' : 'text-gray-500'}">A/R</span>
                                    {#if form.is_aller_retour}<ArrowRightLeft size={14} class="text-blue-400"/>{:else}<span class="text-gray-600 text-xs">→</span>{/if}
                                </label>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                            <div><label class={labelClass}>Origine</label><input type="text" list="stations" bind:value={form.origine} disabled={isLocked} class={inputClass} placeholder="Gare"></div>
                            <div><label class={labelClass}>Destination</label><input type="text" list="stations" bind:value={form.destination} disabled={isLocked} class={inputClass} placeholder="Gare"></div>
                            <datalist id="stations">{#each uniqueStationNames as st} <option value={st} /> {/each}</datalist>
                        </div>

                        <div class="w-full h-64 rounded-xl overflow-hidden border border-white/10 relative z-0 mt-4 shadow-inner bg-[#16181d]">
                            {#if isComputingRoute}
                                <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-10 text-orange-400">
                                    <Loader2 size={32} class="animate-spin mb-2" />
                                    <span class="text-xs font-bold uppercase tracking-widest">Recherche itinéraire...</span>
                                </div>
                            {/if}

                            {#if currentRoute}
                                <Map route={currentRoute} markers={currentMarkers} className="w-full h-full" />
                                <div class="absolute top-3 left-3 bg-black/80 backdrop-blur text-xs text-white px-3 py-1.5 rounded-lg border border-white/10 shadow-lg flex items-center gap-2 pointer-events-none">
                                    <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                    {form.origine} <span class="text-gray-500">→</span> {form.destination}
                                    {#if currentMarkers.length > 2}
                                        <span class="bg-orange-500/20 text-orange-400 px-1.5 rounded text-[10px] font-bold">+{currentMarkers.length - 2} arrêts</span>
                                    {/if}
                                </div>
                            {:else}
                                <div class="w-full h-full flex flex-col items-center justify-center text-gray-600">
                                    {#if !form.origine || !form.destination}
                                        <MapPin size={32} class="opacity-20 mb-2" />
                                        <span class="text-xs uppercase tracking-widest opacity-40">Sélectionnez le parcours</span>
                                    {:else if !isComputingRoute}
                                        <MapPin size={32} class="opacity-20 mb-2 text-red-500" />
                                        <span class="text-xs uppercase tracking-widest opacity-40">Coordonnées introuvables</span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                            <div><label class={labelClass}>Nbr Voyageurs</label><input type="number" bind:value={form.nombre_voyageurs} disabled={isLocked} class={inputClass} placeholder="Approx."></div>
                            <div><label class={labelClass}>Dont PMR</label><input type="number" bind:value={form.nombre_pmr} disabled={isLocked} class={inputClass} placeholder="0"></div>
                            <div><label class={labelClass}>Capacité Bus</label><input type="number" bind:value={form.capacite_bus} disabled={isLocked} class={inputClass} placeholder="50"></div>
                        </div>
                    </div>
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-sm font-bold text-green-400 uppercase tracking-wide flex items-center gap-2"><Bus size={16}/> Véhicules & Horaires</h3>
                            {#if !isLocked}
                                <button on:click={addBus} class="text-xs bg-green-500/20 text-green-400 px-3 py-1.5 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 font-bold border border-green-500/30"><Plus size={14}/> Ajouter Bus</button>
                            {/if}
                        </div>
                        
                        <div class="space-y-4">
                            {#each form.bus_data as bus, i}
                                <div class="bg-white/5 rounded-xl border border-white/10 overflow-hidden transition-all hover:border-white/20 hover:bg-white/[0.07]">
                                    <div class="flex justify-between items-center px-4 py-2 bg-black/20 border-b border-white/5">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-mono font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">BUS #{i+1}</span>
                                            {#if bus.chauffeur_id}
                                                {@const chauf = availableChauffeurs.find(c => c.id == bus.chauffeur_id)}
                                                {#if chauf}<span class="text-[10px] text-gray-400 flex items-center gap-1 border-l border-white/10 pl-2 ml-2"><User size={12}/> {chauf.nom} ({chauf.tel})</span>{/if}
                                            {/if}
                                        </div>
                                        <button on:click={() => removeBus(i)} disabled={isLocked} class="text-gray-500 hover:text-red-400 transition-colors p-1"><MinusCircle size={16}/></button>
                                    </div>
                                    <div class="p-4 space-y-4">
                                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div><label class="text-[10px] text-gray-500 uppercase font-bold mb-1.5 block">Plaque</label><input type="text" bind:value={bus.plaque} disabled={isLocked} class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white uppercase outline-none focus:border-green-500/50" placeholder="1-ABC-123"></div>
                                            <div><label class="text-[10px] text-gray-500 uppercase font-bold mb-1.5 block">H. Prévue</label><input type="time" bind:value={bus.heure_prevue} disabled={isLocked} class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50 dark:[color-scheme:dark]"></div>
                                            <div><label class="text-[10px] text-green-500/70 uppercase font-bold mb-1.5 block">H. Confirmée</label><input type="time" bind:value={bus.heure_confirmee} disabled={isLocked} class="w-full bg-black/30 border border-green-900/30 rounded-lg px-3 py-2 text-sm text-green-300 outline-none focus:border-green-500/50 dark:[color-scheme:dark]"></div>
                                            <div><label class="text-[10px] text-gray-500 uppercase font-bold mb-1.5 block">Démob.</label><input type="time" bind:value={bus.heure_demob} disabled={isLocked} class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50 dark:[color-scheme:dark]"></div>
                                        </div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/5">
                                            <div>
                                                <label class="text-[10px] text-blue-400 uppercase font-bold mb-1.5 flex items-center gap-1"><User size={12}/> Chauffeur (Optionnel)</label>
                                                <select bind:value={bus.chauffeur_id} disabled={isLocked || availableChauffeurs.length === 0} class={inputClass}>
                                                    <option value={null}>-- Sélectionner --</option>
                                                    {#each availableChauffeurs as chauf}<option value={chauf.id} class="bg-[#1a1d24] text-white">{chauf.nom}</option>{/each}
                                                </select>
                                                {#if availableChauffeurs.length === 0 && form.societe_id}<p class="text-[9px] text-red-400 mt-1 italic">Aucun chauffeur trouvé pour cette société.</p>{/if}
                                            </div>
                                            <div class="bg-black/20 rounded-lg p-2 border border-white/5">
                                                <label class="flex items-center gap-2 cursor-pointer mb-2">
                                                    <input type="checkbox" bind:checked={bus.is_specific_route} disabled={isLocked} class="hidden peer">
                                                    <div class="w-3 h-3 rounded-full border border-white/30 peer-checked:bg-orange-500 peer-checked:border-orange-500 transition-colors"></div>
                                                    <span class="text-[10px] font-bold text-gray-400 uppercase">Ce bus effectue un trajet différent</span>
                                                </label>
                                                {#if bus.is_specific_route}
                                                    <div class="grid grid-cols-2 gap-2" transition:slide>
                                                        <input type="text" bind:value={bus.origine_specifique} disabled={isLocked} class="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600" placeholder="Origine spécifique">
                                                        <input type="text" bind:value={bus.destination_specifique} disabled={isLocked} class="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600" placeholder="Destination spécifique">
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        </div>
                </div>
                <div class="space-y-6">
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                        <h3 class="text-sm font-bold text-purple-400 uppercase tracking-wide mb-4 sticky top-0 bg-[#16181d] py-2 z-10 flex items-center gap-2"><Hash size={16}/> Lignes</h3>
                        <div class="flex flex-wrap gap-2">{#each availableLines as line}<button on:click={() => !isLocked && toggleLine(line)} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {form.lignes.includes(line) ? 'bg-purple-600 text-white border-purple-500 shadow-md' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}">{line}</button>{/each}</div>
                    </div>
                    {#if !form.is_direct && form.lignes.length > 0}
                        <div class="bg-black/20 border border-white/5 rounded-2xl p-6 max-h-[400px] overflow-y-auto custom-scrollbar" transition:slide>
                            <h3 class="text-sm font-bold text-yellow-400 uppercase tracking-wide mb-4 sticky top-0 bg-[#16181d] py-2 z-10 flex items-center gap-2"><MapPin size={16}/> Arrêts Intermédiaires</h3>
                            {#if availableStops.length === 0}<p class="text-xs text-gray-500">Chargement...</p>{:else}<div class="space-y-1">{#each availableStops as stop}<button on:click={() => !isLocked && toggleStop(stop)} class="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-3 transition-colors {form.arrets.includes(stop) ? 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20' : 'hover:bg-white/5 text-gray-400 border border-transparent'}">{#if form.arrets.includes(stop)}<CheckSquare class="w-4 h-4 flex-shrink-0"/>{:else}<Square class="w-4 h-4 flex-shrink-0"/>{/if}{stop}</button>{/each}</div>{/if}
                        </div>
                    {/if}
                </div>
            </div>

            <div class="fixed bottom-4 left-4 right-4 z-50 flex flex-wrap justify-end items-center gap-4 p-4 border border-white/10 bg-[#0f1115]/80 backdrop-blur-2xl shadow-2xl rounded-2xl" in:fly={{ y: 20 }}>
                {#if isLocked && form.sent_at}
                    <div class="mr-auto flex flex-col">
                        <span class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Envoyé le</span>
                        <span class="text-xs text-emerald-400 font-bold">{new Date(form.sent_at).toLocaleString('fr-BE')}</span>
                        <span class="text-[10px] text-gray-400">par {form.sent_by_name || '...'}</span>
                    </div>
                {:else}
                    <label class="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-all mr-auto {isLocked ? 'opacity-50 pointer-events-none' : ''}">
                        <div class="relative flex items-center">
                            <input type="checkbox" bind:checked={form.is_mail_sent} disabled={isLocked} class="sr-only peer">
                            <div class="w-10 h-5 bg-gray-600 rounded-full peer peer-checked:bg-emerald-500 transition-colors"></div>
                            <div class="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                        </div>
                        <span class="text-xs font-bold {form.is_mail_sent ? 'text-emerald-400' : 'text-gray-400'} uppercase tracking-wider">{form.is_mail_sent ? 'Mail envoyé' : 'Mail non envoyé'}</span>
                    </label>
                {/if}
                <button on:click={() => showEmailExport = true} class="px-5 py-2.5 rounded-full text-sm font-bold text-blue-400 bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all flex items-center gap-2">
                    <Mail class="w-4 h-4" /> <span class="hidden sm:inline">E-mail</span>
                </button>
                <button on:click={() => generatePDF()} class="px-5 py-2.5 rounded-full text-sm font-bold text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 backdrop-blur-md">
                    <Printer class="w-4 h-4" /> <span class="hidden sm:inline">Télécharger PDF</span>
                </button>
                {#if isLocked}
                    {#if hasPermission(currentUserProfile, ACTIONS.OTTO_WRITE)}
                        <button on:click={unlockCommande} class="px-6 py-2.5 rounded-full text-sm font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 hover:text-orange-300 transition-all flex items-center gap-2">
                            <LockOpen class="w-4 h-4" /> <span>Déverrouiller</span>
                        </button>
                    {/if}
                {:else}
                    <button on:click={() => saveCommande('brouillon')} disabled={isSaving} class="px-6 py-2.5 rounded-full text-sm font-medium text-gray-400 bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Save class="w-4 h-4" /> <span>Brouillon</span>
                    </button>
                    <button on:click={() => saveCommande('envoye')} disabled={isSaving} class="px-6 py-2.5 rounded-full text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all duration-300 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        {#if isSaving}<Loader2 class="w-4 h-4 animate-spin"/>{:else}<CheckCircle class="w-4 h-4" />{/if} <span>Clôturer</span>
                    </button>
                {/if}
            </div>
            <div class="h-24"></div>
        {/if}
      {/if}
    </div>
{/if} {#if showEmailExport}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" in:fly={{ y: 20 }}>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-white flex items-center gap-2"><Mail class="text-blue-400" size={20} /> Export E-mail</h3>
        <button on:click={() => showEmailExport = false} class="text-gray-500 hover:text-white"><X size={20} /></button>
      </div>
      <div class="relative group">
        <textarea readonly class="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none font-mono" bind:value={emailBody}></textarea>
        <button on:click={copyToClipboard} class="absolute top-3 right-3 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 shadow-lg transition-all flex items-center gap-2 text-xs font-bold">
          {#if hasCopied}<Check size={14} /> Copié{:else}<ClipboardCopy size={14} /> Copier{/if}
        </button>
      </div>
      <div class="mt-6 flex justify-between gap-3">
        <button on:click={() => showEmailExport = false} class="px-4 py-2 rounded-xl bg-white/5 text-gray-400 font-bold hover:bg-white/10 transition-colors">Fermer</button>
        <button on:click={sendEmail} class="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"><Mail size={18} /> Ouvrir dans Outlook</button>
      </div>
    </div>
  </div>
{/if}

{#if showTutorial}<OttoTutorialModal on:close={() => showTutorial = false} />{/if}

<style>
  .btn-themed { background-color: rgba(var(--primary-rgb), 0.2); border-color: rgba(var(--primary-rgb), 0.3); color: rgb(var(--primary-rgb)); }
  .btn-themed:hover { background-color: rgba(var(--primary-rgb), 0.3); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.2); }
</style>