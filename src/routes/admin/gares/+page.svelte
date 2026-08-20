<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { MapPin, Search, Trash2, Pencil, Check, X, Loader2, ArrowLeft, Plus, RefreshCw } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { GeoService } from '$lib/services/geo.service.js';

    let isLoading = $state(true);
    let isAuthorized = $state(false);
    let currentUser = $state(null);
    let gares = $state([]);
    let searchQuery = $state("");

    let editingNom = $state(null);
    let tempLon = $state("");
    let tempLat = $state("");

    let showAddForm = $state(false);
    let newGare = $state({ nom: '', lon: '', lat: '' });
    let isSaving = $state(false);
    let resolvingNom = $state(null);

    let filteredGares = $derived.by(() => {
        if (!searchQuery.trim()) return gares;
        const q = searchQuery.toLowerCase();
        return gares.filter(g => g.nom.toLowerCase().includes(q));
    });

    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.ADMIN_ACCESS)) {
            toast.error("Accès réservé aux administrateurs.");
            return goto('/accueil');
        }
        isAuthorized = true;

        await reload();
        isLoading = false;
    });

    async function reload() {
        try {
            gares = await GeoService.listCachedGares();
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement du cache des gares");
        }
    }

    function startEdit(g) {
        editingNom = g.nom;
        tempLon = String(g.lon);
        tempLat = String(g.lat);
    }

    function cancelEdit() {
        editingNom = null;
    }

    async function saveEdit(nom) {
        const lon = parseFloat(tempLon);
        const lat = parseFloat(tempLat);
        if (isNaN(lon) || isNaN(lat)) {
            toast.error("Coordonnées invalides");
            return;
        }
        try {
            await GeoService.setGareCoordinates(nom, lon, lat);
            toast.success(`Coordonnées de "${nom}" mises à jour`);
            editingNom = null;
            await reload();
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors de la sauvegarde");
        }
    }

    function deleteGare(g) {
        openConfirmModal({
            title: "Supprimer du cache ?",
            message: `"${g.nom}" sera re-géocodée automatiquement via Nominatim au prochain usage.`,
            confirmText: "Supprimer",
            danger: true,
            onConfirm: async () => {
                try {
                    await GeoService.deleteCachedGare(g.nom);
                    toast.success("Supprimé du cache");
                    await reload();
                } catch (e) {
                    console.error(e);
                    toast.error("Erreur lors de la suppression");
                }
            }
        });
    }

    async function resolveGare(g) {
        resolvingNom = g.nom;
        try {
            const coords = await GeoService._geocodeViaNominatim(g.nom);
            if (coords) {
                await GeoService.setGareCoordinates(g.nom, coords[0], coords[1]);
                toast.success(`"${g.nom}" re-géocodée`);
                await reload();
            } else {
                toast.error("Aucun résultat Nominatim");
            }
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors du géocodage");
        } finally {
            resolvingNom = null;
        }
    }

    async function addGare() {
        const nom = newGare.nom.trim();
        const lon = parseFloat(newGare.lon);
        const lat = parseFloat(newGare.lat);
        if (!nom || isNaN(lon) || isNaN(lat)) {
            toast.error("Champs invalides");
            return;
        }
        isSaving = true;
        try {
            await GeoService.setGareCoordinates(nom, lon, lat);
            toast.success(`"${nom}" ajoutée au cache`);
            newGare = { nom: '', lon: '', lat: '' };
            showAddForm = false;
            await reload();
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors de l'ajout");
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="mx-auto max-w-4xl px-4 py-6">
    <div class="mb-6 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <a href="/admin" class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
                <ArrowLeft class="h-5 w-5" />
            </a>
            <div>
                <h1 class="flex items-center gap-2 text-xl font-black text-white">
                    <MapPin class="h-5 w-5 text-blue-400" /> Cache des coordonnées de gares
                </h1>
                <p class="text-xs text-gray-500">
                    Table persistée, résolue une fois via Nominatim puis corrigeable manuellement — évite de re-géocoder à chaque affichage de carte.
                </p>
            </div>
        </div>
        <button
            onclick={() => (showAddForm = !showAddForm)}
            class="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-400 transition-colors hover:bg-blue-500/20"
        >
            <Plus class="h-4 w-4" /> Ajouter
        </button>
    </div>

    {#if showAddForm}
        <div class="glass-panel mb-4 rounded-xl border border-white/5 p-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <input bind:value={newGare.nom} placeholder="Nom de la gare" class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white sm:col-span-2" />
                <input bind:value={newGare.lon} placeholder="Longitude" class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                <input bind:value={newGare.lat} placeholder="Latitude" class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </div>
            <div class="mt-3 flex justify-end gap-2">
                <button onclick={() => (showAddForm = false)} class="rounded-lg px-3 py-1.5 text-xs font-bold text-gray-400 hover:bg-white/5">Annuler</button>
                <button onclick={addGare} disabled={isSaving} class="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                    {isSaving ? 'Ajout...' : 'Ajouter'}
                </button>
            </div>
        </div>
    {/if}

    <div class="relative mb-4">
        <Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
            bind:value={searchQuery}
            placeholder="Rechercher une gare..."
            class="w-full rounded-lg border border-white/10 bg-white/5 py-2 pr-3 pl-9 text-sm text-white placeholder-gray-500"
        />
    </div>

    {#if isLoading}
        <div class="flex justify-center py-16"><Loader2 class="h-6 w-6 animate-spin text-blue-500/30" /></div>
    {:else if !isAuthorized}
        <p class="text-center text-sm text-gray-500">Accès non autorisé.</p>
    {:else if filteredGares.length === 0}
        <p class="py-8 text-center text-sm text-gray-500">Aucune gare en cache pour le moment. Les gares seront ajoutées automatiquement lors de leur premier géocodage.</p>
    {:else}
        <div class="glass-panel overflow-hidden rounded-xl border border-white/5">
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b border-white/5 text-left text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                        <th class="px-4 py-2">Gare</th>
                        <th class="px-4 py-2">Longitude</th>
                        <th class="px-4 py-2">Latitude</th>
                        <th class="px-4 py-2">Source</th>
                        <th class="px-4 py-2 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filteredGares as g (g.nom)}
                        <tr class="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                            <td class="px-4 py-2 font-bold text-white">{g.nom}</td>
                            {#if editingNom === g.nom}
                                <td class="px-4 py-2"><input bind:value={tempLon} class="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" /></td>
                                <td class="px-4 py-2"><input bind:value={tempLat} class="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" /></td>
                                <td class="px-4 py-2 text-xs text-gray-500">manuel</td>
                                <td class="px-4 py-2 text-right">
                                    <button onclick={() => saveEdit(g.nom)} class="rounded p-1.5 text-green-400 hover:bg-green-400/10"><Check class="h-4 w-4" /></button>
                                    <button onclick={cancelEdit} class="rounded p-1.5 text-gray-400 hover:bg-white/5"><X class="h-4 w-4" /></button>
                                </td>
                            {:else}
                                <td class="px-4 py-2 text-gray-400">{g.lon}</td>
                                <td class="px-4 py-2 text-gray-400">{g.lat}</td>
                                <td class="px-4 py-2 text-xs {g.source === 'manuel' ? 'text-amber-400' : 'text-gray-500'}">{g.source || 'nominatim'}</td>
                                <td class="px-4 py-2 text-right">
                                    <button onclick={() => resolveGare(g)} disabled={resolvingNom === g.nom} class="rounded p-1.5 text-blue-400 hover:bg-blue-400/10 disabled:opacity-50" title="Re-géocoder via Nominatim">
                                        {#if resolvingNom === g.nom}<Loader2 class="h-4 w-4 animate-spin" />{:else}<RefreshCw class="h-4 w-4" />{/if}
                                    </button>
                                    <button onclick={() => startEdit(g)} class="rounded p-1.5 text-gray-400 hover:bg-white/5"><Pencil class="h-4 w-4" /></button>
                                    <button onclick={() => deleteGare(g)} class="rounded p-1.5 text-red-400 hover:bg-red-400/10"><Trash2 class="h-4 w-4" /></button>
                                </td>
                            {/if}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
