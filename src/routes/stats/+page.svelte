<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import {
        BarChart3, RefreshCw, Loader2, TrendingUp, Building2, Users, ArrowRight,
        Bus, CheckCircle, Award, SlidersHorizontal, X, Car, Route as RouteIcon
    } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { OttoService } from '$lib/services/otto.service.js';
    import { getDistrictStyle, DISTRICT_ORDER } from '$lib/utils/districtColors.js';
    import ChartCanvas from '$lib/components/charts/ChartCanvas.svelte';
    import {
        filterCommandes, computeKpis, buildTimeline, peakMonth,
        byDistrict, byC3Type, byStatus,
        topSocietes, topRedacteurs, topRoutes,
        distinctSocietes, distinctRedacteurs,
        C3_TYPE_LABELS, C3_TYPE_COLORS
    } from '$lib/utils/ottoStats.js';

    // --- ÉTAT ---
    let isLoading = $state(true);
    let isAuthorized = $state(false);
    let currentUser = $state(null);
    let allCommandes = $state([]);
    let taxiCount = $state(0);

    // --- FILTRES ---
    let dateFrom = $state("");
    let dateTo = $state("");
    let districtFilter = $state("all");
    let societeFilter = $state("all");
    let redacteurFilter = $state("all");
    let c3TypeFilter = $state("all");
    let statusFilter = $state("all");
    let activePreset = $state("all");
    let showFilters = $state(false);

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.STATS_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }
        isAuthorized = true;

        await loadData();
        isLoading = false;
    });

    async function loadData() {
        try {
            const [commandes, taxiRes] = await Promise.all([
                OttoService.loadCommandes(),
                supabase.from('taxi_commands').select('id', { count: 'exact', head: true })
            ]);
            allCommandes = commandes;
            taxiCount = taxiRes.count || 0;
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement statistiques");
        }
    }

    async function refresh() {
        isLoading = true;
        await loadData();
        isLoading = false;
        toast.success("Statistiques actualisées");
    }

    // --- FILTRES: PRESETS DATE ---
    function iso(d) { return d.toISOString().split('T')[0]; }
    function setPreset(preset) {
        const today = new Date();
        activePreset = preset;
        if (preset === '7d') { dateFrom = iso(new Date(today.getTime() - 6 * 86400000)); dateTo = iso(today); }
        else if (preset === '30d') { dateFrom = iso(new Date(today.getTime() - 29 * 86400000)); dateTo = iso(today); }
        else if (preset === 'month') { dateFrom = iso(new Date(today.getFullYear(), today.getMonth(), 1)); dateTo = iso(today); }
        else if (preset === 'year') { dateFrom = iso(new Date(today.getFullYear(), 0, 1)); dateTo = iso(today); }
        else { dateFrom = ""; dateTo = ""; }
    }
    function onCustomDateChange() { activePreset = "custom"; }

    function clearAllFilters() {
        dateFrom = ""; dateTo = ""; activePreset = "all";
        districtFilter = "all"; societeFilter = "all"; redacteurFilter = "all";
        c3TypeFilter = "all"; statusFilter = "all";
    }

    // --- DÉRIVÉS: FILTRAGE + AGRÉGATIONS ---
    let filtered = $derived(filterCommandes(allCommandes, {
        dateFrom, dateTo, district: districtFilter, societe: societeFilter,
        redacteur: redacteurFilter, c3Type: c3TypeFilter, status: statusFilter
    }));

    let kpis = $derived(computeKpis(filtered));
    let timeline = $derived(buildTimeline(filtered, dateFrom, dateTo));
    let peak = $derived(peakMonth(filtered));
    let districtBreakdown = $derived(byDistrict(filtered));
    let typeBreakdown = $derived(byC3Type(filtered));
    let statusBreakdown = $derived(byStatus(filtered));
    let societesTop = $derived(topSocietes(filtered, 6));
    let redacteursTop = $derived(topRedacteurs(filtered, 6));
    let routesTop = $derived(topRoutes(filtered, 8));

    let societesList = $derived(distinctSocietes(allCommandes));
    let redacteursList = $derived(distinctRedacteurs(allCommandes));

    let activeFilterCount = $derived(
        (dateFrom ? 1 : 0) + (dateTo && activePreset === 'custom' ? 1 : 0) +
        (districtFilter !== 'all' ? 1 : 0) + (societeFilter !== 'all' ? 1 : 0) +
        (redacteurFilter !== 'all' ? 1 : 0) + (c3TypeFilter !== 'all' ? 1 : 0) +
        (statusFilter !== 'all' ? 1 : 0)
    );

    // --- DONNÉES CHART.JS ---
    let timelineChartData = $derived({
        labels: timeline.labels,
        datasets: [{
            label: 'Commandes',
            data: timeline.counts,
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.15)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: timeline.counts.length > 60 ? 0 : 3,
            pointBackgroundColor: '#f97316',
            pointBorderColor: '#f97316'
        }]
    });

    const timelineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#1a1d24', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, titleColor: '#e5e7eb', bodyColor: '#e5e7eb' }
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', maxRotation: 0, autoSkip: true, maxTicksLimit: 14, font: { size: 10 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', precision: 0, font: { size: 10 } } }
        }
    };

    function toDonutData(rows) {
        return {
            labels: rows.map(r => r.label),
            datasets: [{ data: rows.map(r => r.count), backgroundColor: rows.map(r => r.color), borderWidth: 0, hoverOffset: 6 }]
        };
    }
    const donutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#1a1d24', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, titleColor: '#e5e7eb', bodyColor: '#e5e7eb' }
        }
    };

    let districtChartData = $derived(toDonutData(districtBreakdown));
    let typeChartData = $derived(toDonutData(typeBreakdown));
    let statusChartData = $derived(toDonutData(statusBreakdown));

    function getPercent(val, max) { return max > 0 ? (val / max) * 100 : 0; }
</script>

<svelte:head>
  <title>Statistiques | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-indigo-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
<div class="container mx-auto p-4 md:p-8 min-h-screen space-y-6">

    <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                <BarChart3 class="w-8 h-8" />
            </div>
            <div>
                <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Statistiques</h1>
                <p class="text-gray-500 text-sm mt-1">Dashboard complet des commandes C3 (Otto).</p>
            </div>
        </div>
        <button onclick={refresh} disabled={isLoading} class="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-50" title="Rafraîchir">
            <RefreshCw size={18} class={isLoading ? 'animate-spin' : ''} />
        </button>
    </header>

    {#if isLoading}
        <div class="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 class="w-10 h-10 animate-spin text-indigo-500" />
            <p class="text-gray-500 text-sm">Calcul des statistiques...</p>
        </div>
    {:else}
    <div in:fade={{ duration: 300 }} class="space-y-6">

        <!-- ═══════════════════════════════════════ FILTRES ═══ -->
        <div class="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-3" in:fly={{ y: 10 }}>
            <div class="flex flex-wrap items-center gap-2 justify-between">
                <div class="flex flex-wrap items-center gap-1.5">
                    <button onclick={() => setPreset('7d')} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {activePreset === '7d' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">7 jours</button>
                    <button onclick={() => setPreset('30d')} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {activePreset === '30d' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">30 jours</button>
                    <button onclick={() => setPreset('month')} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {activePreset === 'month' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Ce mois</button>
                    <button onclick={() => setPreset('year')} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {activePreset === 'year' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Cette année</button>
                    <button onclick={() => setPreset('all')} class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all {activePreset === 'all' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Tout</button>

                    <div class="w-px h-5 bg-white/10 mx-1 hidden sm:block"></div>

                    <div class="flex items-center gap-1.5">
                        <input type="date" bind:value={dateFrom} oninput={onCustomDateChange} class="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:[color-scheme:dark]" />
                        <span class="text-gray-600 text-xs">→</span>
                        <input type="date" bind:value={dateTo} oninput={onCustomDateChange} class="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:[color-scheme:dark]" />
                    </div>
                </div>

                <button
                    onclick={() => showFilters = !showFilters}
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                           {showFilters ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}"
                >
                    <SlidersHorizontal size={13} />
                    Filtres
                    {#if activeFilterCount > 0}
                        <span class="bg-indigo-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
                    {/if}
                </button>
            </div>

            {#if showFilters}
                <div class="border-t border-white/5 pt-3 flex flex-col gap-3" in:fly={{ y: -5, duration: 150 }}>

                    <!-- District pills -->
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mr-1">District</span>
                        <button onclick={() => districtFilter = 'all'} class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {districtFilter === 'all' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Toutes zones</button>
                        {#each DISTRICT_ORDER as d}
                            {@const style = getDistrictStyle(d)}
                            <button onclick={() => districtFilter = d} class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {districtFilter === d ? style.badge : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">
                                <span class="w-1.5 h-1.5 rounded-full {style.dot}"></span>{style.label}
                            </button>
                        {/each}
                    </div>

                    <!-- Type C3 pills -->
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mr-1">Type C3</span>
                        <button onclick={() => c3TypeFilter = 'all'} class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {c3TypeFilter === 'all' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Tous types</button>
                        {#each [1, 2, 3] as t}
                            <button onclick={() => c3TypeFilter = String(t)} class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {c3TypeFilter === String(t) ? 'text-white border-transparent' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}" style={c3TypeFilter === String(t) ? `background-color:${C3_TYPE_COLORS[t]}33; border-color:${C3_TYPE_COLORS[t]}66;` : ''}>
                                <span class="w-1.5 h-1.5 rounded-full" style="background-color:{C3_TYPE_COLORS[t]}"></span>{C3_TYPE_LABELS[t]}
                            </button>
                        {/each}
                    </div>

                    <!-- Statut pills -->
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mr-1">Statut</span>
                        <button onclick={() => statusFilter = 'all'} class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {statusFilter === 'all' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Tous</button>
                        <button onclick={() => statusFilter = 'brouillon'} class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {statusFilter === 'brouillon' ? 'bg-gray-500/20 text-gray-300 border-gray-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Brouillons</button>
                        <button onclick={() => statusFilter = 'envoye'} class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all {statusFilter === 'envoye' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}">Clôturés</button>
                    </div>

                    <!-- Société / Rédacteur selects -->
                    <div class="flex flex-wrap gap-3">
                        <div class="flex flex-col gap-1">
                            <span class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Société</span>
                            <select bind:value={societeFilter} class="w-52 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                                <option value="all">Toutes</option>
                                {#each societesList as s}<option value={s}>{s}</option>{/each}
                            </select>
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Rédacteur</span>
                            <select bind:value={redacteurFilter} class="w-52 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                                <option value="all">Tous</option>
                                {#each redacteursList as r}<option value={r}>{r}</option>{/each}
                            </select>
                        </div>
                        {#if activeFilterCount > 0}
                            <div class="flex flex-col gap-1 justify-end">
                                <button onclick={clearAllFilters} class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all">
                                    <X size={12} /> Effacer tout
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

        <!-- ═══════════════════════════════════════ KPIs ═══ -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div class="bg-black/20 border border-white/5 rounded-2xl p-4">
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Commandes</p>
                <p class="text-2xl font-extrabold text-white">{kpis.total}</p>
            </div>
            <div class="bg-black/20 border border-white/5 rounded-2xl p-4">
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Bus size={11}/> Bus engagés</p>
                <p class="text-2xl font-extrabold text-orange-400">{kpis.totalBus}</p>
            </div>
            <div class="bg-black/20 border border-white/5 rounded-2xl p-4">
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><CheckCircle size={11}/> Clôturé</p>
                <p class="text-2xl font-extrabold text-red-400">{kpis.tauxCloture}%</p>
            </div>
            <div class="bg-black/20 border border-white/5 rounded-2xl p-4">
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Building2 size={11}/> Sociétés</p>
                <p class="text-2xl font-extrabold text-white">{kpis.nbSocietes}</p>
            </div>
            <div class="bg-black/20 border border-white/5 rounded-2xl p-4">
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Users size={11}/> Rédacteurs</p>
                <p class="text-2xl font-extrabold text-white">{kpis.nbRedacteurs}</p>
            </div>
            <div class="bg-black/20 border border-white/5 rounded-2xl p-4">
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Car size={11}/> Taxis (total)</p>
                <p class="text-2xl font-extrabold text-cyan-400">{taxiCount}</p>
            </div>
        </div>

        <!-- Callout Meilleur mois -->
        {#if peak}
            <div class="bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20 rounded-2xl p-4 flex items-center gap-4">
                <div class="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    <Award size={20} />
                </div>
                <div>
                    <p class="text-xs text-amber-400/80 font-bold uppercase tracking-wider">Meilleur mois (période filtrée)</p>
                    <p class="text-lg font-extrabold text-white">{peak.label} <span class="text-amber-400">— {peak.count} commande{peak.count > 1 ? 's' : ''}</span></p>
                </div>
            </div>
        {/if}

        <!-- ═══════════════════════════════════════ TIMELINE ═══ -->
        <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                    <TrendingUp class="text-gray-400" size={20} /> Évolution des commandes
                </h3>
                <span class="text-[10px] text-gray-500 font-bold uppercase tracking-wider px-2 py-1 rounded bg-white/5 border border-white/10">
                    Granularité : {timeline.granularity === 'day' ? 'jour' : timeline.granularity === 'week' ? 'semaine' : 'mois'}
                </span>
            </div>
            {#if timeline.labels.length === 0}
                <p class="text-center text-gray-500 text-sm py-16">Aucune donnée sur cette période.</p>
            {:else}
                <ChartCanvas type="line" data={timelineChartData} options={timelineChartOptions} height="300px" />
            {/if}
        </div>

        <!-- ═══════════════════════════════════ RÉPARTITIONS ═══ -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- District -->
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
                <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wide">Par district</h3>
                {#if districtBreakdown.length === 0}
                    <p class="text-center text-gray-500 text-sm py-10">Pas de données.</p>
                {:else}
                    <div class="h-40 mb-4"><ChartCanvas type="doughnut" data={districtChartData} options={donutOptions} height="160px" /></div>
                    <div class="space-y-2">
                        {#each districtBreakdown as row}
                            <div class="flex items-center justify-between text-xs">
                                <span class="flex items-center gap-2 text-gray-300"><span class="w-2 h-2 rounded-full" style="background-color:{row.color}"></span>{row.label}</span>
                                <span class="text-gray-400 font-mono">{row.count} <span class="text-gray-600">({row.percent}%)</span></span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Type C3 -->
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
                <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wide">Par type C3</h3>
                {#if typeBreakdown.length === 0}
                    <p class="text-center text-gray-500 text-sm py-10">Pas de données.</p>
                {:else}
                    <div class="h-40 mb-4"><ChartCanvas type="doughnut" data={typeChartData} options={donutOptions} height="160px" /></div>
                    <div class="space-y-2">
                        {#each typeBreakdown as row}
                            <div class="flex items-center justify-between text-xs">
                                <span class="flex items-center gap-2 text-gray-300"><span class="w-2 h-2 rounded-full" style="background-color:{row.color}"></span>{row.label}</span>
                                <span class="text-gray-400 font-mono">{row.count} <span class="text-gray-600">({row.percent}%)</span></span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Statut -->
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
                <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wide">Par statut</h3>
                {#if statusBreakdown.length === 0}
                    <p class="text-center text-gray-500 text-sm py-10">Pas de données.</p>
                {:else}
                    <div class="h-40 mb-4"><ChartCanvas type="doughnut" data={statusChartData} options={donutOptions} height="160px" /></div>
                    <div class="space-y-2">
                        {#each statusBreakdown as row}
                            <div class="flex items-center justify-between text-xs">
                                <span class="flex items-center gap-2 text-gray-300"><span class="w-2 h-2 rounded-full" style="background-color:{row.color}"></span>{row.label}</span>
                                <span class="text-gray-400 font-mono">{row.count} <span class="text-gray-600">({row.percent}%)</span></span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <!-- ═══════════════════════════════════ TOP LISTES ═══ -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col">
                <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Building2 class="text-gray-400" size={20} /> Sociétés les plus sollicitées
                </h3>
                <div class="space-y-5 flex-grow">
                    {#each societesTop as soc, i}
                        <div class="relative">
                            <div class="flex justify-between text-sm mb-1.5">
                                <span class="text-gray-200 font-medium flex items-center gap-2">
                                    <span class="w-5 h-5 rounded flex items-center justify-center text-[10px] bg-white/5 text-gray-500 font-bold">{i + 1}</span>
                                    {soc.name}
                                </span>
                                <span class="text-gray-400 font-mono">{soc.count}</span>
                            </div>
                            <div class="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div class="h-full rounded-full bg-orange-500 transition-all duration-700" style="width: {getPercent(soc.count, societesTop[0].count)}%"></div>
                            </div>
                        </div>
                    {:else}
                        <p class="text-gray-500 text-sm italic">Pas assez de données.</p>
                    {/each}
                </div>
            </div>

            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col">
                <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Users class="text-gray-400" size={20} /> Top Rédacteurs
                </h3>
                <div class="space-y-3">
                    {#each redacteursTop as u, i}
                        {@const style = getDistrictStyle(u.district)}
                        <div class="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                {u.name.charAt(0)}
                            </div>
                            <div class="flex-grow min-w-0">
                                <p class="text-sm font-bold text-gray-200 truncate flex items-center gap-1.5">
                                    {u.name}
                                    <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded {style.badge}">{style.label}</span>
                                </p>
                                <div class="w-full bg-black/40 h-1.5 rounded-full mt-1.5">
                                    <div class="bg-indigo-500 h-1.5 rounded-full" style="width: {getPercent(u.count, redacteursTop[0].count)}%"></div>
                                </div>
                            </div>
                            <div class="text-right shrink-0">
                                <span class="block text-lg font-bold text-white">{u.count}</span>
                                <span class="text-[10px] text-gray-500 uppercase">Cmds</span>
                            </div>
                        </div>
                    {:else}
                        <p class="text-gray-500 text-sm italic">Pas assez de données.</p>
                    {/each}
                </div>
            </div>
        </div>

        <!-- ═══════════════════════════════════ TRAJETS FRÉQUENTS ═══ -->
        <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
            <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <RouteIcon class="text-gray-400" size={20} /> Trajets Fréquents
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {#each routesTop as route}
                    <div class="p-4 bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/10 rounded-xl transition-all flex flex-col justify-between h-32 relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-500/10 to-transparent rounded-bl-3xl -mr-4 -mt-4"></div>
                        <div class="flex items-start justify-between z-10">
                            <Bus size={18} class="text-orange-400" />
                            <span class="text-xs font-bold px-2 py-1 rounded bg-black/40 text-gray-300 border border-white/5">{route.count} x</span>
                        </div>
                        <div class="z-10 mt-2">
                            <div class="flex flex-col gap-1">
                                <span class="text-sm font-bold text-white truncate" title={route.origine}>{route.origine}</span>
                                <div class="flex items-center gap-2 text-gray-600">
                                    <div class="h-px bg-gray-700 w-full"></div>
                                    <ArrowRight size={12} />
                                </div>
                                <span class="text-sm font-bold text-white truncate" title={route.destination}>{route.destination}</span>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="col-span-full text-center py-10 text-gray-500">Aucun trajet enregistré sur cette période.</div>
                {/each}
            </div>
        </div>

    </div>
    {/if}
</div>
{/if}
