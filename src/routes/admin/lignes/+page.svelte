<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { flip } from 'svelte/animate';
    import { dndzone } from 'svelte-dnd-action';
    import { goto } from '$app/navigation';
    import {
        Route, Search, Plus, Trash2, Pencil, Check, X, GripVertical,
        Loader2, MapPin, Building2, AlertTriangle, ArrowLeft
    } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { LignesAdminService } from '$lib/services/lignesAdmin.service.js';

    // --- ÉTAT ---
    let isLoading = $state(true);
    let isAuthorized = $state(false);
    let currentUser = $state(null);
    let allStops = $state([]);

    let selectedLigne = $state(null);
    let stopsForSelectedLine = $state([]);

    let searchQuery = $state("");
    let newStopName = $state("");

    let editingLineName = $state(false);
    let tempLineName = $state("");
    let editingDistrict = $state(false);
    let tempDistrict = $state("");

    let editingStopId = $state(null);
    let tempStopName = $state("");

    let showCreateModal = $state(false);
    let isCreating = $state(false);
    let newLine = $state({ ligne_nom: '', district: '', gare: '' });

    // --- DERIVED ---
    let canWrite = $derived(hasPermission(currentUser, ACTIONS.LIGNES_WRITE));
    let canDelete = $derived(hasPermission(currentUser, ACTIONS.LIGNES_DELETE));

    let knownDistricts = $derived(
        [...new Set(allStops.map(r => r.district).filter(Boolean))].sort()
    );

    function naturalCompare(a, b) {
        const parse = (str) => parseFloat(String(str).replace('L.', '').replace('A', '.1').replace('C', '.2').replace(/[^0-9.]/g, '')) || 0;
        return parse(a) - parse(b);
    }

    let linesSummary = $derived.by(() => {
        const map = new Map();
        for (const row of allStops) {
            if (!map.has(row.ligne_nom)) {
                map.set(row.ligne_nom, { ligne_nom: row.ligne_nom, district: row.district, count: 0 });
            }
            const entry = map.get(row.ligne_nom);
            entry.count++;
            if (!entry.district && row.district) entry.district = row.district;
        }
        return [...map.values()].sort((a, b) => naturalCompare(a.ligne_nom, b.ligne_nom));
    });

    let filteredLines = $derived.by(() => {
        if (!searchQuery.trim()) return linesSummary;
        const q = searchQuery.toLowerCase();
        return linesSummary.filter(l =>
            l.ligne_nom.toLowerCase().includes(q) ||
            (l.district || '').toLowerCase().includes(q)
        );
    });

    let selectedLineMeta = $derived(linesSummary.find(l => l.ligne_nom === selectedLigne) || null);

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.LIGNES_READ)) {
            toast.error("Accès réservé aux administrateurs et modérateurs.");
            return goto('/accueil');
        }
        isAuthorized = true;

        await reload();
        isLoading = false;
    });

    // --- DATA ---
    async function reload() {
        try {
            allStops = await LignesAdminService.loadAll();
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement des lignes");
        }
    }

    // Sync le sous-panneau à chaque changement de sélection ou de données
    $effect(() => {
        if (selectedLigne) {
            stopsForSelectedLine = allStops
                .filter(r => r.ligne_nom === selectedLigne)
                .sort((a, b) => (a.ordre ?? 999999) - (b.ordre ?? 999999));
        } else {
            stopsForSelectedLine = [];
        }
    });

    function selectLine(ligne_nom) {
        selectedLigne = ligne_nom;
        editingLineName = false;
        editingDistrict = false;
        editingStopId = null;
        newStopName = "";
    }

    // --- LIGNE: CRÉATION ---
    function openCreateModal() {
        newLine = { ligne_nom: '', district: '', gare: '' };
        showCreateModal = true;
    }

    async function handleCreateLine() {
        if (!newLine.ligne_nom.trim() || !newLine.gare.trim()) {
            return toast.error("Nom de ligne et premier arrêt requis");
        }
        if (linesSummary.some(l => l.ligne_nom.toLowerCase() === newLine.ligne_nom.trim().toLowerCase())) {
            return toast.error("Cette ligne existe déjà");
        }
        isCreating = true;
        try {
            await LignesAdminService.createStop({
                ligne_nom: newLine.ligne_nom.trim(),
                gare: newLine.gare.trim(),
                district: newLine.district.trim() || null,
                ordre: 1
            });
            await reload();
            selectLine(newLine.ligne_nom.trim());
            showCreateModal = false;
            toast.success("Ligne créée !");
        } catch (e) {
            console.error(e);
            toast.error("Erreur création : " + e.message);
        } finally {
            isCreating = false;
        }
    }

    // --- LIGNE: RENOMMER ---
    function startEditLineName() {
        tempLineName = selectedLigne;
        editingLineName = true;
    }

    async function saveLineName() {
        const newName = tempLineName.trim();
        if (!newName || newName === selectedLigne) { editingLineName = false; return; }
        if (linesSummary.some(l => l.ligne_nom.toLowerCase() === newName.toLowerCase())) {
            return toast.error("Une ligne porte déjà ce nom");
        }
        try {
            await LignesAdminService.renameLine(selectedLigne, newName);
            await reload();
            selectedLigne = newName;
            editingLineName = false;
            toast.success("Ligne renommée");
        } catch (e) {
            toast.error("Erreur renommage : " + e.message);
        }
    }

    // --- LIGNE: DISTRICT ---
    function startEditDistrict() {
        tempDistrict = selectedLineMeta?.district || '';
        editingDistrict = true;
    }

    async function saveDistrict() {
        try {
            await LignesAdminService.updateDistrict(selectedLigne, tempDistrict.trim() || null);
            await reload();
            editingDistrict = false;
            toast.success("District mis à jour");
        } catch (e) {
            toast.error("Erreur : " + e.message);
        }
    }

    // --- LIGNE: SUPPRESSION ---
    function handleDeleteLine() {
        if (!canDelete) return toast.error("Non autorisé.");
        openConfirmModal(`Supprimer la ligne ${selectedLigne} et ses ${stopsForSelectedLine.length} arrêt(s) ?`, async () => {
            try {
                await LignesAdminService.deleteLine(selectedLigne);
                await reload();
                selectedLigne = null;
                toast.success("Ligne supprimée");
            } catch (e) {
                toast.error("Erreur suppression : " + e.message);
            }
        });
    }

    // --- ARRÊTS: AJOUT ---
    async function addStop() {
        const name = newStopName.trim();
        if (!name) return;
        const maxOrdre = stopsForSelectedLine.reduce((max, r) => Math.max(max, r.ordre ?? 0), 0);
        try {
            await LignesAdminService.createStop({
                ligne_nom: selectedLigne,
                gare: name,
                district: selectedLineMeta?.district || null,
                ordre: maxOrdre + 1
            });
            await reload();
            newStopName = "";
            toast.success("Arrêt ajouté");
        } catch (e) {
            toast.error("Erreur ajout : " + e.message);
        }
    }

    // --- ARRÊTS: ÉDITION ---
    function startEditStop(row) {
        editingStopId = row.id;
        tempStopName = row.gare;
    }

    async function saveStopName(row) {
        const name = tempStopName.trim();
        if (!name || name === row.gare) { editingStopId = null; return; }
        try {
            await LignesAdminService.updateStop(row.id, { gare: name });
            await reload();
            editingStopId = null;
            toast.success("Arrêt renommé");
        } catch (e) {
            toast.error("Erreur : " + e.message);
        }
    }

    // --- ARRÊTS: SUPPRESSION ---
    function handleDeleteStop(row) {
        if (!canDelete) return toast.error("Non autorisé.");
        openConfirmModal(`Supprimer l'arrêt "${row.gare}" ?`, async () => {
            try {
                await LignesAdminService.deleteStop(row.id);
                await reload();
                toast.success("Arrêt supprimé");
            } catch (e) {
                toast.error("Erreur suppression : " + e.message);
            }
        });
    }

    // --- ARRÊTS: DRAG & DROP ---
    function handleConsider(e) {
        stopsForSelectedLine = e.detail.items;
    }

    async function handleFinalize(e) {
        stopsForSelectedLine = e.detail.items;
        try {
            await LignesAdminService.reorderStops(stopsForSelectedLine);
            await reload();
        } catch (err) {
            console.error(err);
            toast.error("Erreur réorganisation");
            await reload();
        }
    }
</script>

<svelte:head>
  <title>Gestion des lignes | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-cyan-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
        <header class="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
            <div class="flex items-center gap-4">
                <div class="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                    <Route class="w-8 h-8" />
                </div>
                <div>
                    <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Gestion des lignes</h1>
                    <p class="text-gray-500 text-sm mt-1">{linesSummary.length} lignes · {allStops.length} arrêts référencés</p>
                </div>
            </div>
            <a href="/admin" class="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all text-sm">
                <ArrowLeft class="w-4 h-4" /> Retour admin
            </a>
        </header>

        {#if isLoading}
            <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-cyan-500/50" /></div>
        {:else}
            <div class="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6" in:fade>

                <!-- ═══════════════════════════════ COLONNE LIGNES ═══ -->
                <div class="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 lg:h-[calc(100vh-220px)] lg:sticky lg:top-4">
                    <div class="flex items-center gap-2">
                        <div class="relative flex-grow">
                            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                bind:value={searchQuery}
                                placeholder="Rechercher..."
                                class="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                            />
                        </div>
                        {#if canWrite}
                            <button onclick={openCreateModal} class="shrink-0 p-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-all" title="Nouvelle ligne">
                                <Plus size={18} />
                            </button>
                        {/if}
                    </div>

                    <div class="flex-grow overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                        {#if filteredLines.length === 0}
                            <p class="text-center text-gray-600 text-sm py-8">Aucune ligne trouvée.</p>
                        {/if}
                        {#each filteredLines as line (line.ligne_nom)}
                            <button
                                onclick={() => selectLine(line.ligne_nom)}
                                class="w-full text-left px-3 py-2.5 rounded-xl border transition-all group flex items-center justify-between gap-2
                                    {selectedLigne === line.ligne_nom
                                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                                        : 'bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5 hover:border-white/10'}"
                            >
                                <div class="min-w-0">
                                    <div class="font-bold text-sm truncate">{line.ligne_nom}</div>
                                    <div class="flex items-center gap-1.5 mt-0.5">
                                        {#if line.district}
                                            <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/5 text-gray-500 border border-white/10">{line.district}</span>
                                        {/if}
                                        <span class="text-[10px] text-gray-500">{line.count} arrêt{line.count > 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- ═══════════════════════════════ COLONNE DÉTAIL ═══ -->
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 min-h-[400px]">
                    {#if !selectedLigne}
                        <div class="h-full flex flex-col items-center justify-center py-20 text-center gap-3 text-gray-600">
                            <Route size={40} class="opacity-20" />
                            <p class="text-sm">Sélectionnez une ligne à gauche,<br>ou créez-en une nouvelle.</p>
                        </div>
                    {:else}
                        <div in:fade={{ duration: 150 }}>
                            <!-- En-tête ligne -->
                            <div class="flex flex-wrap items-start justify-between gap-4 pb-5 mb-5 border-b border-white/5">
                                <div class="space-y-2">
                                    {#if editingLineName}
                                        <div class="flex items-center gap-2">
                                            <input
                                                type="text"
                                                bind:value={tempLineName}
                                                class="bg-black/40 border border-cyan-500/30 rounded-lg px-3 py-1.5 text-lg font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                                onkeydown={(e) => e.key === 'Enter' && saveLineName()}
                                            />
                                            <button onclick={saveLineName} class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Check size={16} /></button>
                                            <button onclick={() => editingLineName = false} class="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10"><X size={16} /></button>
                                        </div>
                                    {:else}
                                        <div class="flex items-center gap-2 group">
                                            <h2 class="text-xl font-extrabold text-white">{selectedLigne}</h2>
                                            {#if canWrite}
                                                <button onclick={startEditLineName} class="p-1 rounded text-gray-600 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={13} /></button>
                                            {/if}
                                        </div>
                                    {/if}

                                    {#if editingDistrict}
                                        <div class="flex items-center gap-2">
                                            <input
                                                type="text"
                                                list="districts-list"
                                                bind:value={tempDistrict}
                                                placeholder="District"
                                                class="bg-black/40 border border-cyan-500/30 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-32"
                                                onkeydown={(e) => e.key === 'Enter' && saveDistrict()}
                                            />
                                            <datalist id="districts-list">{#each knownDistricts as d}<option value={d} />{/each}</datalist>
                                            <button onclick={saveDistrict} class="p-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Check size={13} /></button>
                                            <button onclick={() => editingDistrict = false} class="p-1 rounded bg-white/5 text-gray-400 hover:bg-white/10"><X size={13} /></button>
                                        </div>
                                    {:else}
                                        <button onclick={() => canWrite && startEditDistrict()} class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-cyan-400 transition-colors group w-fit">
                                            <Building2 size={12} />
                                            {selectedLineMeta?.district || 'Aucun district'}
                                            {#if canWrite}<Pencil size={10} class="opacity-0 group-hover:opacity-100 transition-opacity" />{/if}
                                        </button>
                                    {/if}
                                </div>

                                {#if canDelete}
                                    <button onclick={handleDeleteLine} class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all">
                                        <Trash2 size={13} /> Supprimer la ligne
                                    </button>
                                {/if}
                            </div>

                            <!-- Ajout d'arrêt -->
                            {#if canWrite}
                                <div class="flex items-center gap-2 mb-4">
                                    <input
                                        type="text"
                                        bind:value={newStopName}
                                        placeholder="Nom du nouvel arrêt..."
                                        class="flex-grow bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                                        onkeydown={(e) => e.key === 'Enter' && addStop()}
                                    />
                                    <button onclick={addStop} disabled={!newStopName.trim()} class="shrink-0 px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 font-bold text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                        <Plus size={15} /> Ajouter
                                    </button>
                                </div>
                            {/if}

                            <!-- Liste des arrêts (drag & drop) -->
                            {#if stopsForSelectedLine.length === 0}
                                <p class="text-center text-gray-600 text-sm py-10">Aucun arrêt sur cette ligne.</p>
                            {:else}
                                <p class="text-[10px] text-gray-600 uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
                                    <GripVertical size={11} /> Glissez pour réordonner
                                </p>
                                <div
                                    class="space-y-1.5"
                                    use:dndzone={{
                                        items: stopsForSelectedLine,
                                        flipDurationMs: 200,
                                        dropFromOthersDisabled: true,
                                        dragDisabled: !canWrite
                                    }}
                                    onconsider={handleConsider}
                                    onfinalize={handleFinalize}
                                >
                                    {#each stopsForSelectedLine as row, idx (row.id)}
                                        <div
                                            class="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2.5 group hover:border-white/10 transition-colors {canWrite ? 'cursor-grab active:cursor-grabbing' : ''}"
                                            animate:flip={{ duration: 200 }}
                                        >
                                            {#if canWrite}
                                                <GripVertical size={15} class="text-gray-600 shrink-0" />
                                            {/if}
                                            <span class="shrink-0 w-7 h-7 rounded-lg bg-black/30 border border-white/10 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center">{idx + 1}</span>

                                            {#if editingStopId === row.id}
                                                <input
                                                    type="text"
                                                    bind:value={tempStopName}
                                                    class="flex-grow bg-black/40 border border-cyan-500/30 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                                    onkeydown={(e) => e.key === 'Enter' && saveStopName(row)}
                                                />
                                                <button onclick={() => saveStopName(row)} class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Check size={14} /></button>
                                                <button onclick={() => editingStopId = null} class="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10"><X size={14} /></button>
                                            {:else}
                                                <span class="flex-grow text-sm text-gray-200 flex items-center gap-1.5"><MapPin size={12} class="text-gray-600 shrink-0" />{row.gare}</span>
                                                {#if canWrite}
                                                    <button onclick={() => startEditStop(row)} class="p-1.5 rounded-lg text-gray-600 hover:text-cyan-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={13} /></button>
                                                {/if}
                                                {#if canDelete}
                                                    <button onclick={() => handleDeleteStop(row)} class="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
                                                {/if}
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
{/if}

<!-- ═══════════════════════════ MODAL NOUVELLE LIGNE ═══════════════════════ -->
{#if showCreateModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
        <div class="bg-[#1a1d24] w-full max-w-md rounded-2xl shadow-2xl border border-white/10" transition:fly={{ y: 20 }}>
            <div class="flex justify-between items-center px-6 py-4 border-b border-white/10">
                <h3 class="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Route size={20} class="text-cyan-400" />
                    Nouvelle ligne
                </h3>
                <button onclick={() => showCreateModal = false} class="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-white/5">
                    <X size={20} />
                </button>
            </div>

            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1.5">Nom de la ligne *</label>
                    <input
                        type="text"
                        bind:value={newLine.ligne_nom}
                        placeholder="Ex: L.96"
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-cyan-500/50 outline-none"
                    />
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1.5">District</label>
                    <input
                        type="text"
                        list="districts-list-modal"
                        bind:value={newLine.district}
                        placeholder="Ex: DSO"
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-cyan-500/50 outline-none"
                    />
                    <datalist id="districts-list-modal">{#each knownDistricts as d}<option value={d} />{/each}</datalist>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1.5">Premier arrêt *</label>
                    <input
                        type="text"
                        bind:value={newLine.gare}
                        placeholder="Ex: Mons"
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-cyan-500/50 outline-none"
                    />
                    <p class="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5"><AlertTriangle size={11} /> Les autres arrêts s'ajoutent ensuite depuis la fiche de la ligne.</p>
                </div>
            </div>

            <div class="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <button onclick={() => showCreateModal = false} class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-bold text-sm">
                    Annuler
                </button>
                <button
                    onclick={handleCreateLine}
                    disabled={isCreating}
                    class="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                >
                    {#if isCreating}<Loader2 size={16} class="animate-spin" />{/if}
                    Créer la ligne
                </button>
            </div>
        </div>
    </div>
{/if}
