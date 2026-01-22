<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import { goto } from '$app/navigation';
    import {
        List,
        Filter,
        Download,
        Eye,
        Edit,
        Trash2,
        Calendar,
        Search,
        RefreshCw,
        FileText,
        X
    } from 'lucide-svelte';

    // État
    let loading = $state(false);
    let movements = $state([]);
    let filteredMovements = $state([]);

    // Filtres
    let searchQuery = $state('');
    let filterDateStart = $state('');
    let filterDateEnd = $state('');
    let filterZone = $state('all'); // all, FMS, FTY
    let filterPeriod = $state('all'); // all, morning, afternoon

    // Pagination
    let currentPage = $state(1);
    let itemsPerPage = $state(20);
    let totalPages = $derived(Math.ceil(filteredMovements.length / itemsPerPage));
    let paginatedMovements = $derived(
        filteredMovements.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    );

    onMount(() => {
        loadMovements();
    });

    async function loadMovements() {
        loading = true;
        try {
            const { data, error } = await supabase
                .from('daily_movements')
                .select(`
                    *,
                    interventions:movement_interventions(*)
                `)
                .order('date', { ascending: false })
                .limit(100);

            if (error) throw error;
            movements = data || [];
            applyFilters();
        } catch (e) {
            toast.error("Erreur : " + e.message);
        } finally {
            loading = false;
        }
    }

    function applyFilters() {
        let result = [...movements];

        // Filtre par recherche (date)
        if (searchQuery) {
            result = result.filter(m =>
                m.date.includes(searchQuery)
            );
        }

        // Filtre par plage de dates
        if (filterDateStart) {
            result = result.filter(m => m.date >= filterDateStart);
        }
        if (filterDateEnd) {
            result = result.filter(m => m.date <= filterDateEnd);
        }

        // Filtre par zone (en vérifiant les interventions)
        if (filterZone !== 'all') {
            result = result.filter(m =>
                m.interventions && m.interventions.some(i => i.zone === filterZone)
            );
        }

        // Filtre par période
        if (filterPeriod !== 'all') {
            result = result.filter(m =>
                m.interventions && m.interventions.some(i => i.period === filterPeriod)
            );
        }

        filteredMovements = result;
        currentPage = 1; // Reset à la page 1
    }

    function clearFilters() {
        searchQuery = '';
        filterDateStart = '';
        filterDateEnd = '';
        filterZone = 'all';
        filterPeriod = 'all';
        applyFilters();
    }

    function viewDetails(movement) {
        goto(`/deplacements?date=${movement.date}`);
    }

    async function deleteMovement(movement) {
        if (!confirm(`Supprimer le rapport du ${new Date(movement.date).toLocaleDateString('fr-BE')} ?`)) {
            return;
        }

        try {
            // Supprimer les interventions associées
            await supabase.from('movement_interventions').delete().eq('movement_id', movement.id);

            // Supprimer le mouvement
            const { error } = await supabase.from('daily_movements').delete().eq('id', movement.id);
            if (error) throw error;

            toast.success("Rapport supprimé !");
            loadMovements();
        } catch (e) {
            toast.error("Erreur : " + e.message);
        }
    }

    function getTotalInterventions(movement) {
        return movement.interventions ? movement.interventions.length : 0;
    }

    function getInterventionsByPeriod(movement, period) {
        if (!movement.interventions) return 0;
        return movement.interventions.filter(i => i.period === period || (!i.period && period === 'morning')).length;
    }

    // Réactivité des filtres
    $effect(() => {
        searchQuery;
        filterDateStart;
        filterDateEnd;
        filterZone;
        filterPeriod;
        applyFilters();
    });
</script>

<div class="space-y-8 p-4 md:p-8 max-w-[1800px] mx-auto pb-32 animate-fade-in">
    <!-- Header -->
    <header class="relative flex flex-col md:flex-row md:justify-between md:items-end gap-6 pb-8 overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-emerald-600/10 via-teal-600/10 to-cyan-600/10 rounded-3xl animate-gradient-shift"></div>
        <div class="absolute inset-0 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-sm"></div>

        <div class="relative flex items-center gap-4 p-6">
            <div class="p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/50 animate-pulse-soft">
                <List class="w-10 h-10" />
            </div>
            <div>
                <h1 class="text-4xl font-black bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
                    Historique des Déplacements
                </h1>
                <p class="text-slate-400 text-sm mt-2 font-medium">
                    {filteredMovements.length} rapport{filteredMovements.length > 1 ? 's' : ''} trouvé{filteredMovements.length > 1 ? 's' : ''}
                </p>
            </div>
        </div>

        <div class="relative flex flex-wrap gap-3 p-6">
            <button
                onclick={loadMovements}
                disabled={loading}
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/70 hover:scale-105 disabled:opacity-50"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <RefreshCw class="w-5 h-5 {loading ? 'animate-spin' : ''}" />
                Actualiser
            </button>
            <a
                href="/deplacements"
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-blue-500/50 hover:shadow-xl hover:scale-105"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <FileText class="w-5 h-5" />
                Nouveau Rapport
            </a>
        </div>
    </header>

    <!-- Filtres -->
    <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-3xl blur-lg opacity-25 group-hover:opacity-50 transition duration-500"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg shadow-lg">
                    <Filter class="w-5 h-5 text-white" />
                </div>
                <h2 class="text-xl font-black bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                    Filtres
                </h2>
                {#if searchQuery || filterDateStart || filterDateEnd || filterZone !== 'all' || filterPeriod !== 'all'}
                    <button
                        onclick={clearFilters}
                        class="ml-auto flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium transition-all border border-red-500/30"
                    >
                        <X class="w-4 h-4" />
                        Réinitialiser
                    </button>
                {/if}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <!-- Recherche -->
                <div class="lg:col-span-1">
                    <label class="text-xs uppercase font-bold text-emerald-300 mb-2 flex items-center gap-2">
                        <Search class="w-4 h-4" /> Recherche
                    </label>
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Rechercher..."
                        class="w-full bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    />
                </div>

                <!-- Date début -->
                <div>
                    <label class="text-xs uppercase font-bold text-emerald-300 mb-2 flex items-center gap-2">
                        <Calendar class="w-4 h-4" /> Date début
                    </label>
                    <input
                        type="date"
                        bind:value={filterDateStart}
                        class="w-full bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    />
                </div>

                <!-- Date fin -->
                <div>
                    <label class="text-xs uppercase font-bold text-emerald-300 mb-2 flex items-center gap-2">
                        <Calendar class="w-4 h-4" /> Date fin
                    </label>
                    <input
                        type="date"
                        bind:value={filterDateEnd}
                        class="w-full bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    />
                </div>

                <!-- Zone -->
                <div>
                    <label class="text-xs uppercase font-bold text-emerald-300 mb-2 block">Zone</label>
                    <select
                        bind:value={filterZone}
                        class="w-full bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all cursor-pointer"
                    >
                        <option value="all">Toutes les zones</option>
                        <option value="FMS">FMS</option>
                        <option value="FTY">FTY</option>
                    </select>
                </div>

                <!-- Période -->
                <div>
                    <label class="text-xs uppercase font-bold text-emerald-300 mb-2 block">Période</label>
                    <select
                        bind:value={filterPeriod}
                        class="w-full bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all cursor-pointer"
                    >
                        <option value="all">Toutes les périodes</option>
                        <option value="morning">Matin</option>
                        <option value="afternoon">Après-midi</option>
                    </select>
                </div>
            </div>
        </div>
    </div>

    <!-- Tableau des résultats -->
    <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-600 rounded-3xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-xl border-2 border-emerald-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div class="p-5 border-b-2 border-emerald-500/30 bg-gradient-to-r from-slate-950/80 to-emerald-950/30">
                <h3 class="font-black text-lg flex items-center gap-3">
                    <div class="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg shadow-lg">
                        <List class="w-5 h-5 text-white" />
                    </div>
                    <span class="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
                        Rapports ({paginatedMovements.length})
                    </span>
                </h3>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse">
                    <thead class="text-emerald-300 uppercase text-xs font-black bg-gradient-to-r from-slate-950 to-emerald-950/50 sticky top-0 z-10 border-b-2 border-emerald-500/30">
                        <tr>
                            <th class="px-6 py-4 text-left">Date</th>
                            <th class="px-6 py-4 text-center">Total Interventions</th>
                            <th class="px-6 py-4 text-center">Matin</th>
                            <th class="px-6 py-4 text-center">Après-midi</th>
                            <th class="px-6 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-emerald-500/10">
                        {#if loading}
                            <tr>
                                <td colspan="5" class="px-6 py-12 text-center text-slate-400">
                                    <RefreshCw class="w-8 h-8 animate-spin mx-auto mb-2" />
                                    Chargement...
                                </td>
                            </tr>
                        {:else if paginatedMovements.length === 0}
                            <tr>
                                <td colspan="5" class="px-6 py-12 text-center text-slate-400">
                                    Aucun rapport trouvé
                                </td>
                            </tr>
                        {:else}
                            {#each paginatedMovements as movement}
                                <tr class="hover:bg-emerald-500/5 group/row transition-all duration-200">
                                    <td class="px-6 py-4">
                                        <div class="font-bold text-emerald-300 text-base">
                                            {new Date(movement.date).toLocaleDateString('fr-BE', {
                                                weekday: 'short',
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="inline-flex items-center justify-center bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-full font-bold text-base">
                                            {getTotalInterventions(movement)}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="inline-flex items-center justify-center bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full font-semibold border border-blue-500/30">
                                            {getInterventionsByPeriod(movement, 'morning')}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="inline-flex items-center justify-center bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full font-semibold border border-purple-500/30">
                                            {getInterventionsByPeriod(movement, 'afternoon')}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="flex items-center justify-center gap-2">
                                            <button
                                                onclick={() => viewDetails(movement)}
                                                class="p-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-all hover:scale-110 border border-blue-500/30"
                                                title="Voir / Modifier"
                                            >
                                                <Edit class="w-4 h-4" />
                                            </button>
                                            <button
                                                onclick={() => deleteMovement(movement)}
                                                class="p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-all hover:scale-110 border border-red-500/30"
                                                title="Supprimer"
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        {/if}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            {#if totalPages > 1}
                <div class="p-5 border-t-2 border-emerald-500/30 bg-gradient-to-r from-slate-950/80 to-emerald-950/30 flex items-center justify-between">
                    <button
                        onclick={() => currentPage = Math.max(1, currentPage - 1)}
                        disabled={currentPage === 1}
                        class="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded-lg font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-emerald-500/30"
                    >
                        ← Précédent
                    </button>
                    <div class="text-emerald-300 font-semibold">
                        Page {currentPage} / {totalPages}
                    </div>
                    <button
                        onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
                        disabled={currentPage === totalPages}
                        class="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded-lg font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-emerald-500/30"
                    >
                        Suivant →
                    </button>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .animate-fade-in {
        animation: fadeIn 0.6s ease-out;
    }

    @keyframes pulseSoft {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.85;
            transform: scale(1.03);
        }
    }

    .animate-pulse-soft {
        animation: pulseSoft 3s ease-in-out infinite;
    }

    @keyframes gradientShift {
        0% {
            background-position: 0% 50%;
        }
        50% {
            background-position: 100% 50%;
        }
        100% {
            background-position: 0% 50%;
        }
    }

    .animate-gradient-shift {
        background-size: 200% 200%;
        animation: gradientShift 15s ease infinite;
    }
</style>
