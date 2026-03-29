<script>
    import { onMount, onDestroy } from 'svelte';
    import { toast } from '$lib/stores/toast';
    import {
        iRailService,
        formatDelay,
        formatUnixTime,
        formatDate,
        formatTime,
        formatVehicleId,
        getDelayClass,
        getDelayBadgeClass
    } from '$lib/services/irail.service.js';
    import {
        Radio,
        Train,
        MapPin,
        Clock,
        AlertTriangle,
        RefreshCw,
        Search,
        ArrowRight,
        Armchair,
        Bike,
        Wind,
        Toilet,
        ChevronDown,
        Zap
    } from 'lucide-svelte';

    // --- ÉTAT ---
    let mode = $state('gare'); // 'train' | 'gare'

    // Recherche par train
    let trainInput = $state('');
    let trainDate = $state(new Date().toISOString().split('T')[0]);

    // Recherche par gare
    let stationInput = $state('');
    let stationDate = $state(new Date().toISOString().split('T')[0]);
    let stationTime = $state('');
    let arrdep = $state('departure');

    // Résultats
    let vehicleData = $state(null);
    let compositionData = $state(null);
    let liveboardData = $state(null);
    let loading = $state(false);
    let error = $state(null);

    // Autocomplete gares
    let stations = $state([]);
    let showSuggestions = $state(false);
    let stationSuggestions = $derived(
        stationInput.length >= 2
            ? stations
                  .filter(
                      (s) =>
                          s.standardname.toLowerCase().includes(stationInput.toLowerCase()) ||
                          s.name.toLowerCase().includes(stationInput.toLowerCase())
                  )
                  .slice(0, 8)
            : []
    );

    // Auto-refresh
    let autoRefresh = $state(false);
    let countdown = $state(30);
    let refreshInterval = null;
    let countdownInterval = null;

    onMount(async () => {
        const now = new Date();
        stationTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        try {
            stations = await iRailService.getStations();
        } catch {
            // fail silently
        }
    });

    onDestroy(() => {
        clearInterval(refreshInterval);
        clearInterval(countdownInterval);
    });

    // --- ACTIONS ---
    async function searchTrain() {
        if (!trainInput.trim()) return;
        error = null;
        loading = true;
        vehicleData = null;
        compositionData = null;
        try {
            const id = formatVehicleId(trainInput);
            const date = formatDate(trainDate);
            const [vehicle, composition] = await Promise.all([
                iRailService.getVehicle(id, date),
                iRailService.getComposition(id, date)
            ]);
            vehicleData = vehicle;
            compositionData = composition;
        } catch (e) {
            error = e.message;
            toast.error(e.message);
        } finally {
            loading = false;
        }
    }

    async function searchStation() {
        if (!stationInput.trim()) return;
        error = null;
        loading = true;
        liveboardData = null;
        try {
            const date = formatDate(stationDate);
            const time = formatTime(stationTime);
            liveboardData = await iRailService.getLiveboard(stationInput, { date, time, arrdep });
        } catch (e) {
            error = e.message;
            toast.error(e.message);
        } finally {
            loading = false;
        }
    }

    function handleSearch() {
        if (mode === 'train') searchTrain();
        else searchStation();
    }

    function handleKeydown(e) {
        if (e.key === 'Enter') handleSearch();
    }

    function selectStation(station) {
        stationInput = station.standardname;
        showSuggestions = false;
    }

    function toggleAutoRefresh() {
        autoRefresh = !autoRefresh;
        if (autoRefresh) {
            countdown = 30;
            startAutoRefresh();
        } else {
            clearInterval(refreshInterval);
            clearInterval(countdownInterval);
        }
    }

    function startAutoRefresh() {
        clearInterval(refreshInterval);
        clearInterval(countdownInterval);
        countdown = 30;
        refreshInterval = setInterval(() => {
            if (mode === 'gare') searchStation();
            else searchTrain();
            countdown = 30;
        }, 30000);
        countdownInterval = setInterval(() => {
            countdown = Math.max(0, countdown - 1);
        }, 1000);
    }

    // --- HELPERS ---
    function getStops() {
        if (!vehicleData) return [];
        const stops = vehicleData.stops?.stop || [];
        return Array.isArray(stops) ? stops : [stops];
    }

    function getCurrentStopIndex(stops) {
        const idx = stops.findIndex((s) => s.left === '0' || s.left === 0);
        return idx >= 0 ? idx : stops.length;
    }

    function getDepartures() {
        if (!liveboardData) return [];
        const key = arrdep === 'departure' ? 'departures' : 'arrivals';
        const subKey = arrdep === 'departure' ? 'departure' : 'arrival';
        const items = liveboardData[key]?.[subKey] || [];
        return Array.isArray(items) ? items : [items];
    }

    function isPlatformChanged(platforminfo) {
        return platforminfo?.normal === '0';
    }

    function getCompositionUnits() {
        try {
            const segments = compositionData?.composition?.segments?.segment;
            if (!segments) return [];
            const segment = Array.isArray(segments) ? segments[0] : segments;
            const units = segment?.composition?.units?.unit;
            if (!units) return [];
            return Array.isArray(units) ? units : [units];
        } catch {
            return [];
        }
    }

    function getUnitSeats(unit) {
        const seats = unit.seats?.seat;
        if (!seats) return { c1: 0, c2: 0 };
        const arr = Array.isArray(seats) ? seats : [seats];
        let c1 = 0,
            c2 = 0;
        arr.forEach((s) => {
            if (s.class === '1') c1 += parseInt(s.seats || 0);
            else if (s.class === '2') c2 += parseInt(s.seats || 0);
        });
        return { c1, c2 };
    }

    function getTotalSeats(units) {
        return units.reduce(
            (acc, u) => {
                const { c1, c2 } = getUnitSeats(u);
                return { c1: acc.c1 + c1, c2: acc.c2 + c2 };
            },
            { c1: 0, c2: 0 }
        );
    }

    function getTrainShortname() {
        return vehicleData?.vehicleinfo?.shortname || vehicleData?.vehicle?.split('.').pop() || '';
    }

    function getTrainOrigin(stops) {
        return stops[0]?.station || '';
    }

    function getTrainDestination(stops) {
        return stops[stops.length - 1]?.station || '';
    }

    function getMaxDelay(stops) {
        return stops.reduce((max, s) => Math.max(max, parseInt(s.delay || 0)), 0);
    }
</script>

<div class="w-full min-h-screen pb-20">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        <!-- Header -->
        <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
                <div class="p-3 rounded-xl bg-[rgba(var(--color-primary),0.1)] text-[rgb(var(--color-primary))] border border-[rgba(var(--color-primary),0.2)]">
                    <Radio class="w-7 h-7" />
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <h1 class="text-2xl font-bold text-gray-200">Live</h1>
                        <span class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            IRAIL
                        </span>
                    </div>
                    <p class="text-gray-500 text-sm mt-0.5">Temps réel · iRail / SNCB</p>
                </div>
            </div>

            <!-- Auto-refresh -->
            {#if liveboardData || vehicleData}
                <button
                    onclick={toggleAutoRefresh}
                    class="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all
                        {autoRefresh
                        ? 'bg-[rgba(var(--color-primary),0.1)] border-[rgba(var(--color-primary),0.3)] text-[rgb(var(--color-primary))]'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300'}"
                >
                    <RefreshCw class="w-4 h-4 {autoRefresh ? 'animate-spin' : ''}" style="animation-duration: 3s" />
                    {#if autoRefresh}
                        <span class="font-mono">{countdown}s</span>
                    {:else}
                        Auto-refresh
                    {/if}
                </button>
            {/if}
        </div>

        <!-- Mode tabs + Search -->
        <div class="bg-black/20 border border-white/5 rounded-2xl p-5 space-y-4">
            <!-- Tabs -->
            <div class="flex gap-2">
                <button
                    onclick={() => { mode = 'gare'; vehicleData = null; compositionData = null; error = null; }}
                    class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                        {mode === 'gare'
                        ? 'bg-[rgba(var(--color-primary),0.15)] border border-[rgba(var(--color-primary),0.3)] text-[rgb(var(--color-primary))]'
                        : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20'}"
                >
                    <MapPin class="w-4 h-4" /> Par gare
                </button>
                <button
                    onclick={() => { mode = 'train'; liveboardData = null; error = null; }}
                    class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                        {mode === 'train'
                        ? 'bg-[rgba(var(--color-primary),0.15)] border border-[rgba(var(--color-primary),0.3)] text-[rgb(var(--color-primary))]'
                        : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-300 hover:border-white/20'}"
                >
                    <Train class="w-4 h-4" /> Par train
                </button>
            </div>

            <!-- Formulaire gare -->
            {#if mode === 'gare'}
                <div class="flex flex-wrap gap-3 items-end">
                    <div class="flex-1 min-w-48 relative">
                        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Gare</label>
                        <input
                            type="text"
                            bind:value={stationInput}
                            onfocus={() => (showSuggestions = true)}
                            onblur={() => setTimeout(() => (showSuggestions = false), 150)}
                            onkeydown={handleKeydown}
                            placeholder="Ex : Mons, Bruxelles-Central…"
                            class="w-full bg-black/40 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[rgba(var(--color-primary),0.5)] transition-all"
                        />
                        {#if showSuggestions && stationSuggestions.length > 0}
                            <div class="absolute z-20 top-full mt-1 w-full bg-[#111318] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                                {#each stationSuggestions as s}
                                    <button
                                        class="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0"
                                        onmousedown={() => selectStation(s)}
                                    >
                                        {s.standardname}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <div>
                        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
                        <input
                            type="date"
                            bind:value={stationDate}
                            class="bg-black/40 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[rgba(var(--color-primary),0.5)] transition-all [&::-webkit-calendar-picker-indicator]:invert"
                        />
                    </div>

                    <div>
                        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Heure</label>
                        <input
                            type="time"
                            bind:value={stationTime}
                            class="bg-black/40 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[rgba(var(--color-primary),0.5)] transition-all [&::-webkit-calendar-picker-indicator]:invert"
                        />
                    </div>

                    <div>
                        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
                        <div class="flex rounded-xl overflow-hidden border border-white/10">
                            <button
                                onclick={() => (arrdep = 'departure')}
                                class="px-3 py-2.5 text-sm font-medium transition-all
                                    {arrdep === 'departure' ? 'bg-[rgba(var(--color-primary),0.2)] text-[rgb(var(--color-primary))]' : 'bg-black/40 text-gray-400 hover:text-gray-300'}"
                            >Départs</button>
                            <button
                                onclick={() => (arrdep = 'arrival')}
                                class="px-3 py-2.5 text-sm font-medium transition-all border-l border-white/10
                                    {arrdep === 'arrival' ? 'bg-[rgba(var(--color-primary),0.2)] text-[rgb(var(--color-primary))]' : 'bg-black/40 text-gray-400 hover:text-gray-300'}"
                            >Arrivées</button>
                        </div>
                    </div>

                    <button
                        onclick={searchStation}
                        disabled={loading || !stationInput.trim()}
                        class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgba(var(--color-primary),0.15)] border border-[rgba(var(--color-primary),0.3)] text-[rgb(var(--color-primary))] text-sm font-semibold hover:bg-[rgba(var(--color-primary),0.25)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Search class="w-4 h-4" />
                        {loading ? 'Chargement…' : 'Rechercher'}
                    </button>
                </div>
            {/if}

            <!-- Formulaire train -->
            {#if mode === 'train'}
                <div class="flex flex-wrap gap-3 items-end">
                    <div class="flex-1 min-w-48">
                        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Numéro de train</label>
                        <input
                            type="text"
                            bind:value={trainInput}
                            onkeydown={handleKeydown}
                            placeholder="Ex : IC 1234, P 4956, S1 7890…"
                            class="w-full bg-black/40 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[rgba(var(--color-primary),0.5)] transition-all"
                        />
                    </div>

                    <div>
                        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
                        <input
                            type="date"
                            bind:value={trainDate}
                            class="bg-black/40 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[rgba(var(--color-primary),0.5)] transition-all [&::-webkit-calendar-picker-indicator]:invert"
                        />
                    </div>

                    <button
                        onclick={searchTrain}
                        disabled={loading || !trainInput.trim()}
                        class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgba(var(--color-primary),0.15)] border border-[rgba(var(--color-primary),0.3)] text-[rgb(var(--color-primary))] text-sm font-semibold hover:bg-[rgba(var(--color-primary),0.25)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Search class="w-4 h-4" />
                        {loading ? 'Chargement…' : 'Rechercher'}
                    </button>
                </div>
            {/if}
        </div>

        <!-- Erreur -->
        {#if error}
            <div class="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 text-red-400 text-sm">
                <AlertTriangle class="w-5 h-5 shrink-0" />
                {error}
            </div>
        {/if}

        <!-- === RÉSULTATS TABLEAU DE BORD GARE === -->
        {#if liveboardData}
            {@const departures = getDepartures()}
            <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
                <!-- En-tête tableau de bord -->
                <div class="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <div class="flex items-center gap-3">
                        <MapPin class="w-5 h-5 text-[rgb(var(--color-primary))]" />
                        <div>
                            <span class="text-white font-bold text-lg">{liveboardData.stationinfo?.standardname || liveboardData.station}</span>
                            <span class="ml-3 text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded-full
                                {arrdep === 'departure' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}">
                                {arrdep === 'departure' ? 'Départs' : 'Arrivées'}
                            </span>
                        </div>
                    </div>
                    <span class="text-xs text-gray-600 font-mono">
                        {new Date(parseInt(liveboardData.timestamp) * 1000).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>

                <!-- Table -->
                {#if departures.length === 0}
                    <div class="py-16 text-center text-gray-600 text-sm">Aucun résultat pour ce créneau.</div>
                {:else}
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="text-xs uppercase tracking-wider text-gray-600 border-b border-white/5">
                                    <th class="px-5 py-3 text-left font-medium">Train</th>
                                    <th class="px-5 py-3 text-left font-medium">{arrdep === 'departure' ? 'Destination' : 'Origine'}</th>
                                    <th class="px-5 py-3 text-left font-medium">Heure</th>
                                    <th class="px-5 py-3 text-left font-medium">Retard</th>
                                    <th class="px-5 py-3 text-left font-medium">Voie</th>
                                    <th class="px-5 py-3 text-left font-medium">Statut</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/[0.04]">
                                {#each departures as dep}
                                    {@const delay = formatDelay(dep.delay)}
                                    {@const platformChanged = isPlatformChanged(dep.platforminfo)}
                                    {@const canceled = dep.canceled === '1'}
                                    <tr class="hover:bg-white/[0.02] transition-colors {canceled ? 'opacity-40' : ''}">
                                        <td class="px-5 py-3.5">
                                            <span class="font-mono font-bold text-white text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                                                {dep.vehicleinfo?.shortname || dep.vehicle?.split('.').pop() || '—'}
                                            </span>
                                        </td>
                                        <td class="px-5 py-3.5 text-gray-300 font-medium">
                                            {dep.stationinfo?.standardname || dep.station}
                                        </td>
                                        <td class="px-5 py-3.5">
                                            <span class="font-mono text-gray-200">{formatUnixTime(dep.time)}</span>
                                            {#if delay}
                                                <span class="ml-1.5 font-mono text-xs {getDelayClass(dep.delay)}">
                                                    → {formatUnixTime(parseInt(dep.time) + parseInt(dep.delay))}
                                                </span>
                                            {/if}
                                        </td>
                                        <td class="px-5 py-3.5">
                                            {#if canceled}
                                                <span class="text-xs font-medium text-red-400">Supprimé</span>
                                            {:else if delay}
                                                <span class="inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-mono font-bold {getDelayBadgeClass(dep.delay)}">
                                                    {delay}
                                                </span>
                                            {:else}
                                                <span class="text-emerald-400 text-xs font-medium">À l'heure</span>
                                            {/if}
                                        </td>
                                        <td class="px-5 py-3.5">
                                            <span class="font-mono font-bold text-sm {platformChanged ? 'text-orange-400' : 'text-gray-300'}">
                                                {dep.platforminfo?.name || dep.platform || '—'}
                                            </span>
                                            {#if platformChanged}
                                                <span class="ml-1.5 text-xs text-orange-400/70">⚠ modifiée</span>
                                            {/if}
                                        </td>
                                        <td class="px-5 py-3.5">
                                            {#if dep.left === '1'}
                                                <span class="text-xs text-gray-600">Parti</span>
                                            {:else if dep.isExtra === '1'}
                                                <span class="text-xs text-blue-400">Extra</span>
                                            {:else}
                                                <span class="w-2 h-2 rounded-full bg-emerald-400/60 inline-block animate-pulse"></span>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- === RÉSULTATS TRAIN === -->
        {#if vehicleData}
            {@const stops = getStops()}
            {@const currentIdx = getCurrentStopIndex(stops)}
            {@const maxDelay = getMaxDelay(stops)}
            {@const units = getCompositionUnits()}
            {@const totalSeats = getTotalSeats(units)}

            <!-- Bandeau info train -->
            <div class="bg-black/20 border border-white/5 rounded-2xl p-5">
                <div class="flex items-center justify-between flex-wrap gap-4">
                    <div class="flex items-center gap-4">
                        <div class="p-3 rounded-xl bg-[rgba(var(--color-primary),0.1)] border border-[rgba(var(--color-primary),0.2)]">
                            <Train class="w-6 h-6 text-[rgb(var(--color-primary))]" />
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="text-white font-bold text-xl font-mono">
                                    {getTrainShortname()}
                                </span>
                                {#if maxDelay > 0}
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-xl border text-sm font-mono font-bold {getDelayBadgeClass(maxDelay)}">
                                        {formatDelay(maxDelay)}
                                    </span>
                                {:else}
                                    <span class="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-xl">À l'heure</span>
                                {/if}
                            </div>
                            <div class="flex items-center gap-2 mt-0.5 text-sm text-gray-400">
                                <span>{getTrainOrigin(stops)}</span>
                                <ArrowRight class="w-3 h-3" />
                                <span>{getTrainDestination(stops)}</span>
                            </div>
                        </div>
                    </div>
                    {#if units.length > 0}
                        <div class="flex items-center gap-4 text-sm text-gray-400">
                            <span class="flex items-center gap-1.5">
                                <Armchair class="w-4 h-4 text-blue-400" />
                                <span class="text-blue-400 font-medium">{totalSeats.c1}</span> 1ère
                            </span>
                            <span class="flex items-center gap-1.5">
                                <Armchair class="w-4 h-4 text-gray-300" />
                                <span class="text-gray-300 font-medium">{totalSeats.c2}</span> 2ème
                            </span>
                            <span class="text-gray-600">·</span>
                            <span>{units.length} rame{units.length > 1 ? 's' : ''}</span>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Timeline des arrêts -->
            <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
                <div class="px-6 py-4 border-b border-white/5">
                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Itinéraire</h3>
                </div>
                <div class="p-6">
                    <div class="relative">
                        <!-- Ligne verticale -->
                        <div class="absolute left-[11px] top-3 bottom-3 w-px bg-white/10"></div>

                        <div class="space-y-0">
                            {#each stops as stop, i}
                                {@const isPast = i < currentIdx}
                                {@const isCurrent = i === currentIdx}
                                {@const delay = formatDelay(stop.delay)}
                                {@const platformChanged = isPlatformChanged(stop.platforminfo)}
                                {@const canceled = stop.departureCanceled === '1' || stop.arrivalCanceled === '1'}

                                <div class="flex items-start gap-4 py-2.5 {isPast ? 'opacity-40' : ''}">
                                    <!-- Indicateur -->
                                    <div class="relative z-10 mt-0.5 shrink-0">
                                        {#if isCurrent}
                                            <div class="w-5 h-5 rounded-full border-2 border-[rgb(var(--color-primary))] bg-[rgba(var(--color-primary),0.3)] flex items-center justify-center">
                                                <div class="w-2 h-2 rounded-full bg-[rgb(var(--color-primary))] animate-pulse"></div>
                                            </div>
                                        {:else if isPast}
                                            <div class="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                                                <div class="w-1.5 h-1.5 rounded-full bg-white/30"></div>
                                            </div>
                                        {:else}
                                            <div class="w-5 h-5 rounded-full border border-white/20 bg-black/40 flex items-center justify-center">
                                                <div class="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                                            </div>
                                        {/if}
                                    </div>

                                    <!-- Contenu -->
                                    <div class="flex-1 flex items-center justify-between gap-4 min-w-0">
                                        <div class="min-w-0">
                                            <span class="font-medium {isCurrent ? 'text-white' : 'text-gray-300'} truncate block">
                                                {stop.stationinfo?.standardname || stop.station}
                                            </span>
                                            {#if isCurrent}
                                                <span class="text-xs text-[rgb(var(--color-primary))]">Position actuelle</span>
                                            {/if}
                                        </div>
                                        <div class="flex items-center gap-3 shrink-0 text-sm">
                                            <!-- Heure -->
                                            <span class="font-mono text-gray-400">
                                                {formatUnixTime(stop.scheduledDepartureTime || stop.scheduledArrivalTime || stop.time)}
                                            </span>
                                            <!-- Retard -->
                                            {#if canceled}
                                                <span class="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg">Supprimé</span>
                                            {:else if delay}
                                                <span class="font-mono text-xs font-bold px-2 py-0.5 rounded-lg border {getDelayBadgeClass(stop.delay)}">{delay}</span>
                                            {/if}
                                            <!-- Voie -->
                                            <span class="font-mono text-sm {platformChanged ? 'text-orange-400' : 'text-gray-400'}">
                                                Voie {stop.platforminfo?.name || stop.platform || '?'}
                                                {#if platformChanged}
                                                    <span class="text-orange-400/70 text-xs"> ⚠</span>
                                                {/if}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Composition -->
            {#if units.length > 0}
                <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
                    <div class="px-6 py-4 border-b border-white/5">
                        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Composition · {units.length} rame{units.length > 1 ? 's' : ''}</h3>
                    </div>
                    <div class="p-5 overflow-x-auto">
                        <div class="flex gap-2 min-w-max">
                            {#each units as unit, i}
                                {@const seats = getUnitSeats(unit)}
                                <div class="flex flex-col items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl p-3 min-w-28">
                                    <!-- Type -->
                                    <span class="text-xs font-mono font-bold text-[rgb(var(--color-primary))]">
                                        {unit.materialType?.type_name || unit.type || '?'}
                                    </span>
                                    <!-- Places -->
                                    <div class="text-center">
                                        {#if seats.c1 > 0}
                                            <div class="text-xs text-blue-400"><span class="font-bold">{seats.c1}</span> 1ère</div>
                                        {/if}
                                        {#if seats.c2 > 0}
                                            <div class="text-xs text-gray-400"><span class="font-bold">{seats.c2}</span> 2ème</div>
                                        {/if}
                                    </div>
                                    <!-- Icônes équipements -->
                                    <div class="flex gap-1.5 flex-wrap justify-center">
                                        {#if unit.hasAirco === '1'}
                                            <Wind class="w-3 h-3 text-cyan-400" title="Climatisation" />
                                        {/if}
                                        {#if unit.hasToilets === '1'}
                                            <Toilet class="w-3 h-3 text-gray-400" title="Toilettes" />
                                        {/if}
                                        {#if unit.hasBikeSection === '1'}
                                            <Bike class="w-3 h-3 text-green-400" title="Section vélos" />
                                        {/if}
                                        {#if unit.hasSecondClassOutlets === '1' || unit.hasFirstClassOutlets === '1'}
                                            <Zap class="w-3 h-3 text-yellow-400" title="Prises" />
                                        {/if}
                                    </div>
                                </div>
                                {#if i < units.length - 1}
                                    <div class="flex items-center self-center text-gray-700">
                                        <div class="w-4 h-0.5 bg-white/10"></div>
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}
        {/if}

        <!-- État vide -->
        {#if !loading && !vehicleData && !liveboardData && !error}
            <div class="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                    <Radio class="w-10 h-10 text-gray-700" />
                </div>
                <div>
                    <p class="text-gray-500 font-medium">Recherchez une gare ou un numéro de train</p>
                    <p class="text-gray-700 text-sm mt-1">Données temps réel via l'API publique iRail / SNCB</p>
                </div>
            </div>
        {/if}

    </div>
</div>
