<script>
    import { onMount } from 'svelte';
    import { 
        MapPin, Wind, Search, X, Edit2, Loader2,
        // Icônes Météo Jour
        Sun, CloudSun, 
        // Icônes Météo Nuit (Nouveaux)
        Moon, CloudMoon,
        // Icônes Neutres
        Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle
    } from 'lucide-svelte';

    // --- ÉTATS ---
    let weatherData = null;
    let loading = true;
    let locationName = "Mons"; 
    let latitude = 50.4542;    
    let longitude = 3.9567;

    // Recherche
    let showSearch = false;
    let searchQuery = "";
    let searchResults = [];
    let searchLoading = false;

    // --- ICONE RÉACTIVE ---
    // On passe maintenant le code ET l'indicateur jour/nuit
    $: WeatherIcon = weatherData ? getWeatherIcon(weatherData.weather_code, weatherData.is_day) : Cloud;

    onMount(async () => {
        if (typeof localStorage !== 'undefined') {
            const savedLoc = localStorage.getItem('bacoWeatherLocation');
            if (savedLoc) {
                try {
                    const parsed = JSON.parse(savedLoc);
                    locationName = parsed.name;
                    latitude = parsed.lat;
                    longitude = parsed.lon;
                } catch (e) {}
            }
        }
        await loadWeather();
    });

    async function loadWeather() {
        loading = true;
        try {
            // AJOUT DE 'is_day' DANS L'URL
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=Europe%2FBrussels&t=${Date.now()}`);
            const data = await res.json();
            weatherData = data.current;
            console.log(`Météo ${locationName}: Code ${weatherData.weather_code}, Jour: ${weatherData.is_day}`);
        } catch (e) { 
            console.error(e); 
        } finally {
            loading = false;
        }
    }

    async function searchCity() {
        if (searchQuery.length < 2) return;
        searchLoading = true;
        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5&language=fr&format=json`);
            const data = await res.json();
            searchResults = data.results || [];
        } catch (e) { searchResults = []; } 
        finally { searchLoading = false; }
    }

    function selectCity(city) {
        locationName = city.name;
        latitude = city.latitude;
        longitude = city.longitude;
        localStorage.setItem('bacoWeatherLocation', JSON.stringify({ name: city.name, lat: city.latitude, lon: city.longitude }));
        showSearch = false;
        searchQuery = "";
        searchResults = [];
        loadWeather();
    }

    // --- LOGIQUE JOUR / NUIT ---
    function getWeatherIcon(code, isDay) {
        // isDay : 1 = Jour, 0 = Nuit
        
        // 0: Ciel dégagé
        if (code === 0) return isDay ? Sun : Moon;
        
        // 1, 2: Partiellement nuageux / Voilé
        if (code === 1 || code === 2) return isDay ? CloudSun : CloudMoon;
        
        // 3: Couvert (Pas de différence jour/nuit visible)
        if (code === 3) return Cloud;
        
        // Brouillard
        if (code === 45 || code === 48) return CloudFog;
        
        // Pluie / Bruine
        if (code >= 51 && code <= 67) return CloudRain;
        if (code >= 80 && code <= 82) return CloudRain;
        
        // Neige
        if (code >= 71 && code <= 86) return CloudSnow;
        
        // Orage
        if (code >= 95) return CloudLightning;
        
        return Cloud;
    }

    let timeout;
    function handleInput() {
        clearTimeout(timeout);
        timeout = setTimeout(searchCity, 500);
    }
</script>

<div class="relative flex flex-col justify-between overflow-visible h-full glass-panel rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
    
    <div class="absolute -right-6 -top-6 w-32 h-32 blur-[50px] rounded-full pointer-events-none transition-colors duration-1000
        {weatherData && !weatherData.is_day ? 'bg-indigo-500/20' : 'bg-orange-500/20'}">
    </div>
    
    <div class="p-6 pb-0 flex justify-between items-start relative z-20">
        
        <div class="flex-1 relative">
            {#if showSearch}
                <div class="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                    <div class="relative w-full">
                        <Search class="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"/>
                        <input type="text" bind:value={searchQuery} on:input={handleInput} placeholder="Ville..." class="w-full bg-black/60 border border-blue-500/50 rounded-xl py-2 pl-9 pr-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" autoFocus />
                        {#if searchResults.length > 0}
                            <div class="absolute top-full left-0 right-0 mt-2 bg-[#1a1d24] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                {#each searchResults as result}
                                    <button on:click={() => selectCity(result)} class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-blue-600 hover:text-white transition-colors border-b border-white/5 flex justify-between">
                                        <span>{result.name}</span>
                                        <span class="text-xs text-gray-500">{result.country_code}</span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button on:click={() => showSearch = false} class="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"><X class="w-4 h-4" /></button>
                </div>
            {:else}
                <div class="group cursor-pointer inline-flex flex-col" on:click={() => showSearch = true}>
                    <h3 class="text-lg font-bold text-white flex items-center gap-2 transition-colors group-hover:text-blue-300">
                        <MapPin class="w-4 h-4 text-orange-400" /> {locationName}
                        <Edit2 class="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <p class="text-xs text-gray-400 uppercase tracking-wider mt-1 ml-6">Météo en direct</p>
                </div>
            {/if}
        </div>

        {#if !loading && weatherData && !showSearch}
            {#key `${weatherData.weather_code}-${weatherData.is_day}`}
                <div class="animate-in fade-in zoom-in duration-500">
                    <svelte:component 
                        this={WeatherIcon} 
                        class="w-10 h-10 {weatherData.is_day ? 'text-orange-300' : 'text-blue-300'} drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" 
                    />
                </div>
            {/key}
        {/if}
    </div>

    <div class="p-6 pt-2 relative z-10 mt-auto">
        {#if loading}
            <div class="animate-pulse space-y-3 mt-4">
                <div class="h-10 w-24 bg-white/10 rounded-lg"></div>
            </div>
        {:else if weatherData}
            <div class="flex items-end gap-2 mt-4">
                <span class="text-5xl font-bold text-white tracking-tighter drop-shadow-lg">{Math.round(weatherData.temperature_2m)}°</span>
                <span class="text-lg text-gray-400 mb-1.5 font-medium">C</span>
            </div>
            <div class="flex items-center gap-2 mt-2 text-sm text-gray-400 bg-black/20 inline-block px-3 py-1 rounded-full border border-white/5">
                <Wind class="w-3.5 h-3.5 inline mr-1" /> <span>{weatherData.wind_speed_10m} km/h</span>
            </div>
        {:else}
            <p class="text-sm text-red-400 mt-4">Erreur</p>
        {/if}
    </div>
</div>