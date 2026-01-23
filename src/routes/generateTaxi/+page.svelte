<script>
    import { onMount } from 'svelte';
    import { fly, fade, slide, scale } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    
    // Icons
    import { 
        Car, Calendar, Clock, MapPin, FileText, Save, Trash2, Plus, Loader2, ArrowLeft,
        Printer, Search, X, User, Users, ArrowRightLeft, Mail, ClipboardCopy, Check, 
        Phone, ArrowRight, MoreHorizontal, FilePenLine, MessageSquare, Repeat
    } from 'lucide-svelte';

    // Services & Libs
    import { supabase } from '$lib/supabase';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { TaxiService } from '$lib/services/taxi.service.js';
    import { TaxiPdfService } from '$lib/services/taxiPdf.service.js';

    // CONSTANTES
    const PMR_CAUSES = [
        "Pas de personnel pour la prise en charge", "Gare taxi (17 gares)", 
        "Travaux Infrabel planifiés", "Travaux B-ST planifiés", 
        "Défaut infrastructure gare B-ST", "Défaut Infrabel", "Défaut rampes mobiles B-PT2",
        "Problème lors du voyage PMR", "Acte commercial suite erreur SNCB", "Acte commercial suite erreur client"
    ];
    const FACTURATION_OPTIONS = ["Infrabel", "SNCB", "Tiers", "B-CS 1 Accompagnement", "B-TO 1 Conduite", "B-TC Matériel", "B-PT 5 EMMA", "B-CS 4 Planification"];

    // --- ÉTAT (RUNES) ---
    let view = $state('list');
    let isLoading = $state(true);
    let isSaving = $state(false);
    let currentUser = $state(null);
    let isAuthorized = $state(false);

    // Données
    let commandes = $state([]);
    let taxis = $state([]);
    let pmrClients = $state([]);
    let stationList = $state([]);

    // Formulaire
    let form = $state(getInitialForm());
    let selectedCommand = $state(null);
    
    // Email Modal
    let showEmailExport = $state(false);
    let emailContent = $state("");
    let hasCopied = $state(false);

    // --- DERIVED ---
    let isLocked = $derived(form.status === 'envoye' || !hasPermission(currentUser, ACTIONS.GENERATE_TAXI_WRITE));

    // --- HELPERS ---
    const cleanData = (input) => {
        if (!input) return '';
        if (Array.isArray(input)) return input.join(', ');
        return String(input).replace(/[\[\]"]/g, '').replace(/,/g, ', ');
    };

    function toLocalInput(dateStr) {
        const d = dateStr ? new Date(dateStr) : new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    }

    function getInitialForm() {
        return {
            id: null, redacteur: '', status: 'brouillon', motif: '', 
            date_trajet: toLocalInput(), date_retour: '',
            taxi_nom: '', taxi_email: '', taxi_adresse: '', taxi_tel: '', 
            type_trajet: 'aller', gare_origine: 'Mons', gare_arrivee: '', gare_via: '',
            gare_retour_origine: '', gare_retour_arrivee: '',
            nombre_passagers: 1, nombre_pmr: 0, nombre_vehicules: 1, 
            is_pmr: false, pmr_type: 'NV', pmr_nom: '', pmr_prenom: '', pmr_tel: '', pmr_dossier: '', pmr_motif: '', pmr_search: '', 
            passager_nom: '', relation_number: '', facturation: 'SNCB'
        };
    }

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.GENERATE_TAXI_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        await loadAllData();
        isLoading = false;
    });

    async function loadAllData() {
        try {
            const [cmds, txs, pmrs, sts] = await Promise.all([
                TaxiService.loadCommandesHistory(),
                TaxiService.getAllTaxis(),
                TaxiService.loadPmrClients(),
                TaxiService.loadStations()
            ]);
            commandes = cmds;
            taxis = txs;
            pmrClients = pmrs;
            stationList = sts;
        } catch(e) {
            toast.error("Erreur chargement données");
        }
    }

    // --- LOGIQUE METIER ---
    
    // Auto-fill Taxi info
    $effect(() => {
        if (form.taxi_nom) {
            const found = taxis.find(t => t.nom.toLowerCase() === form.taxi_nom.toLowerCase());
            if (found) {
                form.taxi_adresse = cleanData(found.adresse);
                form.taxi_email = cleanData(found.email);
                form.taxi_tel = cleanData(found.contacts);
            }
        }
    });

    // Auto-fill Retour info
    $effect(() => {
        if (form.type_trajet === 'aller-retour') {
            if (!form.gare_retour_origine) form.gare_retour_origine = form.gare_arrivee;
            if (!form.gare_retour_arrivee) form.gare_retour_arrivee = form.gare_origine;
        }
    });

    function handlePmrSelect(e) {
        const val = e.target.value;
        form.pmr_search = val;
        const found = pmrClients.find(c => `${c.nom} ${c.prenom}` === val);
        if (found) {
            form.pmr_nom = found.nom; form.pmr_prenom = found.prenom;
            form.pmr_tel = found.telephone;
            if (found.type) form.pmr_type = found.type; 
        } else {
            const parts = val.split(' ');
            form.pmr_nom = parts[0] || val; form.pmr_prenom = parts.slice(1).join(' ') || '';
        }
    }

    function generateEmailBody(data) {
        let details = data.is_pmr 
            ? `Cause : ${data.pmr_motif || 'Non spécifiée'}\nRemarques : ${data.motif || '-'}\nVéhicules : ${data.nombre_vehicules}`
            : `Motif : ${data.motif || '-'}\nFacturation : ${data.facturation}`;

        return `Bonjour,

Veuillez trouver ci-joint une commande de taxi.

Date : ${new Date(data.date_trajet).toLocaleString('fr-BE')}
Trajet : ${data.gare_origine} > ${data.gare_arrivee}
${data.type_trajet === 'aller-retour' ? `RETOUR : ${new Date(data.date_retour).toLocaleString('fr-BE')}` : ''}

Passagers : ${data.nombre_passagers} ${data.is_pmr ? `(dont ${data.nombre_pmr} PMR)` : ''}
${data.is_pmr ? `Client : ${data.pmr_nom} ${data.pmr_prenom} (${data.pmr_type}) - Dos: ${data.pmr_dossier}` : `Réf : ${data.relation_number}`}

${details}

Merci de confirmer.
${data.redacteur || 'SNCB'}`;
    }

    // --- ACTIONS ---

    function openNew() {
        form = getInitialForm();
        form.redacteur = currentUser.full_name;
        view = 'form';
    }

    function openEdit(cmd) {
        form = JSON.parse(JSON.stringify(cmd));
        form.date_trajet = toLocalInput(form.date_trajet);
        if(form.date_retour) form.date_retour = toLocalInput(form.date_retour);
        selectedCommand = null;
        view = 'form';
    }

    async function handleSave() {
        if (!form.taxi_nom) return toast.error("Société requise");
        if (!form.gare_arrivee) return toast.error("Destination requise");

        isSaving = true;
        try {
            const savedCmd = await TaxiService.saveCommande(form);
            toast.success(form.id ? "Modifié" : "Créé");
            
            if (!form.id) {
                // Auto-générer PDF si création
                TaxiPdfService.generatePDF(savedCmd);
            }
            
            await loadAllData();
            view = 'list';
        } catch(e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSaving = false;
        }
    }

    function handleDelete(id) {
        openConfirmModal("Supprimer ?", async () => {
            await TaxiService.deleteCommande(id);
            await loadAllData();
            selectedCommand = null;
            toast.success("Supprimé");
        });
    }

    function openEmail(data) {
        emailContent = generateEmailBody(data);
        showEmailExport = true;
        selectedCommand = null;
    }

    function sendEmailLink() {
        const society = taxis.find(s => s.nom === form.taxi_nom);
        const emailTo = society?.email || "";
        const subject = encodeURIComponent(`Commande Taxi - ${new Date(form.date_trajet).toLocaleDateString('fr-BE')}`);
        window.location.href = `mailto:${emailTo}?subject=${subject}&body=${encodeURIComponent(emailContent)}`;
    }

    // --- STYLES HELPER ---
    const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-yellow-500/50 outline-none transition-all placeholder-gray-600";
    const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1";

</script>

<svelte:head>
  <title>C3 | Générateur Taxi</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-yellow-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.15)]">
              <Car class="w-8 h-8" />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Commandes Taxi</h1>
              <p class="text-gray-500 text-sm mt-1">Génération de bons & PMR.</p>
            </div>
        </div>
        
        {#if view === 'list'}
            {#if hasPermission(currentUser, ACTIONS.GENERATE_TAXI_WRITE)}
                <button onclick={openNew} class="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all">
                    <Plus class="w-5 h-5" /> Nouvelle Commande
                </button>
            {/if}
        {:else}
            <button onclick={() => { view = 'list'; loadAllData(); }} class="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all">
                <ArrowLeft class="w-5 h-5" /> Retour liste
            </button>
        {/if}
      </header>

      {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-yellow-500" /></div>
      {:else}
    
        {#if view === 'list'}
            <div class="grid grid-cols-1 gap-4" in:fly={{ y: 20 }}>
                {#if commandes.length === 0}
                    <div class="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-black/20"><p class="text-gray-500">Aucune commande.</p></div>
                {:else}
                    {#each commandes as cmd}
                        <button onclick={() => selectedCommand = cmd} class="w-full text-left bg-black/20 border border-white/5 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-yellow-500/30 hover:bg-white/[0.02] transition-all group relative overflow-hidden">
                            <div class="flex-grow space-y-3 relative z-10 w-full">
                                 <div class="flex items-center gap-3 flex-wrap">
                                    {#if cmd.is_pmr}
                                        <span class="px-2 py-1 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"><Users size={10}/> PMR</span>
                                    {:else}
                                        <span class="px-2 py-1 rounded text-[10px] font-bold uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1"><User size={10}/> Standard</span>
                                    {/if}
                                    <span class="text-lg font-bold text-white tracking-tight">{cmd.taxi_nom}</span>
                                    {#if cmd.pmr_dossier}<span class="text-xs font-mono text-gray-500 border border-white/10 px-2 py-0.5 rounded">{cmd.pmr_dossier}</span>{/if}
                                 </div>
                                 <div class="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                    <div class="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                        <Calendar size={14} class="text-gray-500"/> 
                                        <span class="font-medium text-gray-200">{new Date(cmd.date_trajet).toLocaleDateString()}</span>
                                        <span class="font-bold text-yellow-500">{new Date(cmd.date_trajet).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <div class="flex items-center gap-2 text-gray-300">
                                        <span>{cmd.gare_origine}</span> <ArrowRight size={14} class="text-gray-600"/> <span>{cmd.gare_arrivee}</span>
                                    </div>
                                 </div>
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
                        <h3 class="text-sm font-bold text-yellow-400 uppercase tracking-wide mb-4 flex items-center gap-2"><FileText size={16}/> Mission</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="md:col-span-2">
                                {#if form.is_pmr}
                                    <label class={labelClass}>Cause (PMR)</label>
                                    <select bind:value={form.pmr_motif} class={inputClass + " mb-3"} disabled={isLocked}>
                                        <option value="" disabled selected>-- Cause --</option>
                                        {#each PMR_CAUSES as cause}<option value={cause}>{cause}</option>{/each}
                                    </select>
                                    <label class={labelClass}>Remarques</label>
                                    <input type="text" bind:value={form.motif} disabled={isLocked} class={inputClass} placeholder="Détails...">
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
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-sm font-bold text-blue-400 uppercase tracking-wide flex items-center gap-2"><MapPin size={16}/> Trajet</h3>
                            <div class="flex items-center bg-white/5 p-1 rounded-lg border border-white/10">
                                <button disabled={isLocked} class="px-3 py-1 text-xs font-bold rounded-md transition-all {form.type_trajet === 'aller' ? 'bg-blue-500 text-white' : 'text-gray-500'}" onclick={() => !isLocked && (form.type_trajet = 'aller')}>Aller Simple</button>
                                <button disabled={isLocked} class="px-3 py-1 text-xs font-bold rounded-md transition-all {form.type_trajet === 'aller-retour' ? 'bg-blue-500 text-white' : 'text-gray-500'}" onclick={() => !isLocked && (form.type_trajet = 'aller-retour')}>Aller-Retour</button>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label class={labelClass}>Date & Heure</label><input type="datetime-local" bind:value={form.date_trajet} disabled={isLocked} class="{inputClass} dark:[color-scheme:dark]"></div>
                            <div><label class={labelClass}>Via</label><input type="text" list="stations" bind:value={form.gare_via} disabled={isLocked} class={inputClass}></div>
                            <div><label class={labelClass}>Départ</label><input type="text" list="stations" bind:value={form.gare_origine} disabled={isLocked} class={inputClass}></div>
                            <div><label class={labelClass}>Arrivée</label><input type="text" list="stations" bind:value={form.gare_arrivee} disabled={isLocked} class={inputClass}></div>
                        </div>
                        {#if form.type_trajet === 'aller-retour'}
                            <div class="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4" transition:slide>
                                <div class="md:col-span-2"><label class="{labelClass} text-blue-400">Date Retour</label><input type="datetime-local" bind:value={form.date_retour} disabled={isLocked} class="{inputClass} dark:[color-scheme:dark] border-blue-500/30"></div>
                                <div><label class={labelClass}>Départ Retour</label><input type="text" list="stations" bind:value={form.gare_retour_origine} disabled={isLocked} class={inputClass}></div>
                                <div><label class={labelClass}>Arrivée Retour</label><input type="text" list="stations" bind:value={form.gare_retour_arrivee} disabled={isLocked} class={inputClass}></div>
                            </div>
                        {/if}
                        <datalist id="stations">{#each stationList as st} <option value={st} /> {/each}</datalist>
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative">
                        <h3 class="text-sm font-bold text-yellow-400 uppercase tracking-wide mb-4 flex items-center gap-2"><Car size={16}/> Société</h3>
                        <div><input list="taxis-list" type="text" bind:value={form.taxi_nom} disabled={isLocked} class={inputClass} placeholder="Rechercher..."><datalist id="taxis-list">{#each taxis as t}<option value={t.nom} />{/each}</datalist></div>
                        {#if form.taxi_email || form.taxi_adresse || form.taxi_tel}
                            <div class="mt-4 p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-400 space-y-2" transition:slide>
                                {#if form.taxi_adresse}<div class="flex gap-2"><MapPin size={12} class="text-gray-500"/> {cleanData(form.taxi_adresse)}</div>{/if}
                                {#if form.taxi_tel}<div class="flex gap-2 text-green-200"><Phone size={12} class="text-green-400"/> {cleanData(form.taxi_tel)}</div>{/if}
                            </div>
                        {/if}
                    </div>

                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative {form.is_pmr ? 'border-purple-500/30' : ''}">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-sm font-bold uppercase tracking-wide flex items-center gap-2 {form.is_pmr ? 'text-purple-400' : 'text-yellow-400'}">
                                {#if form.is_pmr}<Users size={16}/> PMR{:else}<User size={16}/> Passager{/if}
                            </h3>
                        </div>
                        <div class="bg-black/40 p-1 rounded-xl flex mb-6 border border-white/10">
                            <button disabled={isLocked} class="flex-1 py-2 rounded-lg text-xs font-bold { !form.is_pmr ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400' }" onclick={() => !isLocked && (form.is_pmr = false)}>STANDARD</button>
                            <button disabled={isLocked} class="flex-1 py-2 rounded-lg text-xs font-bold { form.is_pmr ? 'bg-purple-600 text-white' : 'text-gray-400' }" onclick={() => !isLocked && (form.is_pmr = true)}>PMR</button>
                        </div>
                        <div class="space-y-4">
                            {#if form.is_pmr}
                                <div class="grid grid-cols-3 gap-2">
                                    <div><label class={labelClass}>PMR</label><input type="number" min="1" bind:value={form.nombre_pmr} disabled={isLocked} class={inputClass}></div>
                                    <div><label class={labelClass}>Pass.</label><input type="number" min="1" bind:value={form.nombre_passagers} disabled={isLocked} class={inputClass}></div>
                                    <div><label class={labelClass}>Véh.</label><input type="number" min="1" bind:value={form.nombre_vehicules} disabled={isLocked} class={inputClass}></div>
                                </div>
                                <div transition:slide class="space-y-4 pt-2 border-t border-white/5">
                                    <div><label class={labelClass}>Client PMR</label><input list="pmr-list" type="text" bind:value={form.pmr_search} oninput={handlePmrSelect} disabled={isLocked} class={inputClass}><datalist id="pmr-list">{#each pmrClients as c}<option value={`${c.nom} ${c.prenom}`} />{/each}</datalist></div>
                                    <div class="grid grid-cols-2 gap-2">
                                        <input type="text" placeholder="Nom" bind:value={form.pmr_nom} disabled={isLocked} class={inputClass}>
                                        <input type="text" placeholder="Prénom" bind:value={form.pmr_prenom} disabled={isLocked} class={inputClass}>
                                    </div>
                                    <div><label class={labelClass}>Type</label><select bind:value={form.pmr_type} disabled={isLocked} class={inputClass}><option value="NV">Non-Voyant</option><option value="CRF">Chaise Roulante Fixe</option><option value="CRE">Chaise Electrique</option><option value="CRP">Chaise Pliable</option><option value="MR">Marche Difficile</option></select></div>
                                    <div><label class={labelClass}>Dossier</label><input type="text" bind:value={form.pmr_dossier} disabled={isLocked} class={inputClass}></div>
                                </div>
                            {:else}
                                <div><label class={labelClass}>Total Passagers</label><input type="number" min="1" bind:value={form.nombre_passagers} disabled={isLocked} class={inputClass}></div>
                                <div><label class={labelClass}>Nom (Optionnel)</label><input type="text" bind:value={form.passager_nom} disabled={isLocked} class={inputClass}></div>
                                <div><label class={labelClass}>Réf / Ordre</label><input type="text" bind:value={form.relation_number} disabled={isLocked} class={inputClass}></div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

            <div class="fixed bottom-4 left-4 right-4 z-50 flex flex-wrap justify-end items-center gap-4 p-4 border border-white/10 bg-[#0f1115]/80 backdrop-blur-2xl shadow-2xl rounded-2xl" in:fly={{ y: 20 }}>
                <button onclick={() => openEmail(form)} class="mr-auto px-5 py-2.5 rounded-full text-sm font-bold text-blue-400 bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 flex items-center gap-2">
                    <Mail class="w-4 h-4" /> <span class="hidden sm:inline">E-mail</span>
                </button>
                {#if !isLocked}
                    <button onclick={handleSave} disabled={isSaving} class="px-6 py-2.5 rounded-full text-sm font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 flex items-center gap-2">
                        {#if isSaving}<Loader2 class="w-4 h-4 animate-spin"/>{:else}<Save class="w-4 h-4" />{/if} 
                        <span>{form.id ? 'Modifier' : 'Enregistrer'} & PDF</span>
                    </button>
                {/if}
            </div>
            <div class="h-24"></div>
        {/if}
      {/if}
    </div>

    {#if selectedCommand}
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
            <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" in:scale={{start: 0.95}}>
                <button onclick={() => selectedCommand = null} class="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20}/></button>
                <h3 class="text-lg font-bold text-white mb-1">Commande #{selectedCommand.id}</h3>
                <p class="text-sm text-gray-400 mb-6">{new Date(selectedCommand.date_trajet).toLocaleDateString()} - {selectedCommand.taxi_nom}</p>
                <div class="space-y-3">
                    {#if hasPermission(currentUser, ACTIONS.GENERATE_TAXI_WRITE)}
                        <button onclick={() => openEdit(selectedCommand)} class="w-full py-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold hover:bg-purple-500/20 flex items-center justify-center gap-2"><FilePenLine size={18}/> Modifier</button>
                    {/if}
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick={() => TaxiPdfService.generatePDF(selectedCommand)} class="w-full py-3 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold hover:bg-yellow-500/20 flex items-center justify-center gap-2"><Printer size={18}/> PDF</button>
                        <button onclick={() => openEmail(selectedCommand)} class="w-full py-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold hover:bg-blue-500/20 flex items-center justify-center gap-2"><Mail size={18}/> Email</button>
                    </div>
                    {#if hasPermission(currentUser, ACTIONS.GENERATE_TAXI_DELETE)}
                        <div class="h-px bg-white/10 my-2"></div>
                        <button onclick={() => handleDelete(selectedCommand.id)} class="w-full py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold hover:bg-red-500/20 flex items-center justify-center gap-2"><Trash2 size={18}/> Supprimer</button>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if showEmailExport}
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade>
            <div class="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl" in:fly={{ y: 20 }}>
                <div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold text-white flex items-center gap-2"><Mail class="text-blue-400" size={20} /> Aperçu E-mail</h3><button onclick={() => showEmailExport = false} class="text-gray-500 hover:text-white"><X size={20} /></button></div>
                <div class="relative group"><textarea readonly class="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none font-mono" bind:value={emailContent}></textarea></div>
                <div class="mt-6 flex justify-between gap-3"><button onclick={() => showEmailExport = false} class="px-4 py-2 rounded-xl bg-white/5 text-gray-400 font-bold hover:bg-white/10 transition-colors">Fermer</button><button onclick={sendEmailLink} class="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"><Mail size={18} /> Ouvrir Outlook</button></div>
            </div>
        </div>
    {/if}
{/if}