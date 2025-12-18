<script>
    import { onMount } from 'svelte';
    import { TrainFront, Search, X, Edit2, Clock, AlertTriangle } from 'lucide-svelte';

    let currentStation = 'Mons';
    let allStations = [];
    let stationSearch = '';
    let showStationSelector = false;
    let trainDepartures = [];
    let loading = true;

    $: filteredStations = allStations.filter(s => s.name.toLowerCase().includes(stationSearch.toLowerCase())).slice(0, 10);

    onMount(() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('bacoFavoriteStation');
            if (saved) currentStation = saved;
        }
        loadAllStations();
        loadTrains();
    });

    async function loadAllStations() {
        try {
            const res = await fetch('https://api.irail.be/stations/?format=json&lang=fr');
            const data = await res.json();
            allStations = data.station;
        } catch (e) { console.error(e); }
    }

    async function loadTrains() {
        loading = true;
        try {
            const res = await fetch(`https://api.irail.be/liveboard/?station=${encodeURIComponent(currentStation)}&format=json&lang=fr`);
            const data = await res.json();
            if (data?.departures?.departure) {
                const all = Array.isArray(data.departures.departure) ? data.departures.departure : [data.departures.departure];
                const now = Math.floor(Date.now() / 1000);
                // On filtre pour les 3 prochaines heures
                trainDepartures = all.filter(t => parseInt(t.time) <= now + (3 * 60 * 60));
            }
        } catch (e) { console.error(e); }
        loading = false;
    }

    function selectStation(name) {
        currentStation = name;
        showStationSelector = false;
        localStorage.setItem('bacoFavoriteStation', name);
        loadTrains();
    }

    const formatTrainTime = (ts) => new Date(ts * 1000).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
</script>

<div class="glass-panel rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
    
    <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] sticky top-0 z-20 backdrop-blur-xl min-h-[60px]">
        {#if showStationSelector}
            <div class="flex-1 flex items-center gap-2 animate-in fade-in">
                <div class="relative flex-1">
                    <Search class="absolute left-3 top-2.5 w-4 h-4 text-gray-400"/>
                    <input type="text" bind:value={stationSearch} placeholder="Gare..." class="w-full bg-black/40 border border-blue-500/50 rounded-xl py-2 pl-9 text-sm text-white focus:outline-none" autoFocus />
                    {#if stationSearch.length > 1}
                        <div class="absolute top-full left-0 right-0 mt-2 bg-[#1a1d24] border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                            {#each filteredStations as station}
                                <button on:click={() => selectStation(station.name)} class="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-blue-600 hover:text-white transition-colors border-b border-white/5">{station.name}</button>
                            {/each}
                        </div>
                    {/if}
                </div>
                <button on:click={() => showStationSelector = false} class="p-2 hover:bg-white/10 rounded-lg text-gray-400"><X class="w-5 h-5" /></button>
            </div>
        {:else}
            <div class="flex items-center gap-3 cursor-pointer group/title" on:click={() => showStationSelector = true}>
                <div class="p-2 rounded-lg bg-blue-600/20 text-blue-300 border border-blue-500/30 group-hover/title:bg-blue-500 group-hover/title:text-white transition-colors"><TrainFront class="w-5 h-5" /></div>
                <div>
                    <h3 class="text-base font-bold text-white flex items-center gap-2">
                        {currentStation} <Edit2 class="w-3 h-3 text-gray-600 group-hover/title:text-blue-400" />
                    </h3>
                    <p class="text-[10px] text-gray-400 uppercase tracking-wider">Prochains départs</p>
                </div>
            </div>
        {/if}
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
        {#if loading}
            <div class="flex items-center justify-center h-full gap-2 text-gray-500">
                <div class="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <span class="text-xs">Chargement...</span>
            </div>
        {:else if trainDepartures.length > 0}
            <div class="divide-y divide-white/5 text-sm">
                {#each trainDepartures as train}
                    {@const isCanceled = train.canceled === "1"}
                    <div class="flex items-center justify-between p-3 hover:bg-white/[0.03] transition-colors {isCanceled ? 'opacity-50' : ''}">
                        <div class="flex items-center gap-3">
                            <span class="font-mono font-bold text-base {isCanceled ? 'text-gray-500 line-through' : 'text-blue-300'}">
                                {formatTrainTime(train.time)}
                            </span>
                            <div>
                                <span class="block font-bold text-gray-200 text-sm leading-tight">{train.station}</span>
                                {#if train.delay > 0 && !isCanceled}
                                    <span class="text-[10px] font-bold text-red-400 flex items-center gap-0.5">
                                        +{Math.floor(train.delay / 60)}'
                                    </span>
                                {/if}
                                {#if isCanceled}
                                    <span class="text-[9px] font-bold text-red-500 uppercase">Supprimé</span>
                                {/if}
                            </div>
                        </div>
                        <div class="flex flex-col items-end">
                            <span class="text-[9px] text-gray-500 uppercase">Voie</span>
                            <span class="font-bold text-white bg-white/5 px-1.5 rounded border border-white/10">{train.platform || '?'}</span>
                        </div>
                    </div>
                {/each}
            </div>
        {:else}
            <div class="flex flex-col items-center justify-center h-full text-gray-500 gap-2 opacity-60">
                <Clock class="w-8 h-8" />
                <p class="text-xs">Aucun départ.</p>
            </div>
        {/if}
    </div>
</div>