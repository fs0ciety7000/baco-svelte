<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { Bus, Loader2, ArrowLeft } from 'lucide-svelte';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    
    // Services
    import { OttoService } from '$lib/services/otto.service.js';
    import { supabase } from '$lib/supabase';

    // Components
    import OttoList from './components/OttoList.svelte';
    import OttoForm from './components/OttoForm.svelte';
    import OttoTutorialModal from '$lib/components/OttoTutorialModal.svelte';

    // --- STATE (Runes) ---
    let view = $state('list'); // 'list' | 'form'
    let isLoading = $state(true);
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let showTutorial = $state(false);

    // Data
    let commandes = $state([]);
    let societes = $state([]);
    let referenceData = $state({ lines: [], stops: [], raw: [] });
    
    // Form State
    let form = $state(getInitialForm());
    let chauffeurs = $state([]); // Filtered for current form society

    // --- DERIVED ---
    let isLocked = $derived(form.status === 'envoye' || !hasPermission(currentUser, ACTIONS.OTTO_WRITE));

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.OTTO_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }
        isAuthorized = true;

        await loadAllData();
        
        // Handle URL ID
        const urlId = $page.url.searchParams.get('id');
        if (urlId) {
            const cmd = commandes.find(c => c.id == urlId);
            if (cmd) openEdit(cmd, false);
        }
        
        isLoading = false;
    });

    // --- DATA LOADING ---
    async function loadAllData() {
        try {
            const [cmds, socs, refs] = await Promise.all([
                OttoService.loadCommandes(),
                OttoService.loadSocietes(),
                OttoService.loadReferenceData()
            ]);
            commandes = cmds;
            societes = socs;
            referenceData = refs;
        } catch(e) {
            toast.error("Erreur chargement données");
        }
    }

    // Effect: Load chauffeurs when society changes in form
    $effect(() => {
        if (form.societe_id) {
            loadChauffeursForSociety(form.societe_id);
        } else {
            chauffeurs = [];
        }
    });

    async function loadChauffeursForSociety(id) {
        try {
            chauffeurs = await OttoService.loadChauffeurs(id);
        } catch(e) { console.error(e); }
    }

    // --- ACTIONS ---
    function getInitialForm() {
        return {
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
            capacite_bus: 80,
            bus_data: [{ plaque: '', heure_prevue: '', heure_confirmee: '', heure_demob: '', chauffeur_id: null }]
        };
    }

    function openNew() {
        if (!hasPermission(currentUser, ACTIONS.OTTO_WRITE)) return;
        form = getInitialForm();
        view = 'form';
        goto('/otto', { replaceState: true, noScroll: true });
    }

    function openEdit(cmd, updateUrl = true) {
        // Deep copy & normalization
        const safeBusData = (cmd.bus_data?.length) 
            ? cmd.bus_data.map(b => ({ ...b, chauffeur_id: b.chauffeur_id || null }))
            : [{ plaque: '', heure_prevue: '', chauffeur_id: null }];

        form = { ...cmd, bus_data: safeBusData };
        view = 'form';
        if (updateUrl) goto(`?id=${cmd.id}`, { replaceState: false, noScroll: true });
    }

    function handleDuplicate(cmd) {
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
        view = 'form';
        toast.success("Commande dupliquée !");
    }

    function handleDelete(id) {
        if (!hasPermission(currentUser, ACTIONS.OTTO_DELETE)) return toast.error("Non autorisé.");
        openConfirmModal("Supprimer cette commande ?", async () => {
            await OttoService.deleteCommande(id);
            commandes = await OttoService.loadCommandes();
            toast.success("Supprimé.");
        });
    }

    function handleUnlock() {
        if (!hasPermission(currentUser, ACTIONS.OTTO_WRITE)) return toast.error("Non autorisé.");
        openConfirmModal("Déverrouiller ce bon ?", async () => handleSave('brouillon'));
    }

    async function handleSave(status) {
        if (!hasPermission(currentUser, ACTIONS.OTTO_WRITE)) return toast.error("Non autorisé.");
        if (!form.motif) return toast.error("Motif requis");
        if (!form.societe_id) return toast.error("Société requise");

        // --- CORRECTION: NETTOYAGE DU PAYLOAD ---
        // On retire les propriétés de jointure (objets) qui ne sont pas des colonnes SQL
        const { 
            id,
            creator, 
            validator, 
            societes_bus, 
            ...cleanForm 
        } = form;

        const payload = {
            ...cleanForm,
            status,
            arrets: form.is_direct ? [] : form.arrets
        };

        if (!form.id) payload.user_id = currentUser.id;
        if (status === 'envoye') {
            payload.validated_by = currentUser.id;
            if (!payload.sent_at) {
                payload.sent_at = new Date().toISOString();
                payload.sent_by_name = currentUser.full_name;
            }
        }

        try {
            // On passe 'payload' (sans id) et 'form.id' (pour le WHERE id = ...)
            await OttoService.saveCommande(payload, form.id);
            
            toast.success(status === 'envoye' ? "Clôturé !" : "Sauvegardé");
            commandes = await OttoService.loadCommandes();
            goBack();
        } catch(e) {
            console.error("Erreur Save:", e);
            toast.error("Erreur sauvegarde: " + e.message);
        }
    }

    function goBack() {
        view = 'list';
        goto('/otto', { replaceState: true, noScroll: true });
    }
</script>

<svelte:head>
  <title>C3 | Commande Bus</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-orange-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
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
            
            {#if view === 'form'}
                <button onclick={goBack} class="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all">
                     <ArrowLeft class="w-5 h-5" /> Retour liste
                </button>
            {/if}
        </header>

        {#if isLoading}
            <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-orange-500/50" /></div>
        {:else if view === 'list'}
            <OttoList 
                {commandes} 
                {currentUser}
                onEdit={openEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onNew={openNew}
                onTutorial={() => showTutorial = true}
            />
        {:else}
            <OttoForm 
                bind:form
                {societes}
                {chauffeurs}
                {referenceData}
                {isLocked}
                {currentUser}
                onSave={handleSave}
                onUnlock={handleUnlock}
                onBack={goBack}
            />
        {/if}
    </div>
{/if}

{#if showTutorial}
    <OttoTutorialModal on:close={() => showTutorial = false} />
{/if}