<script>
    import { onMount } from 'svelte';
    import { 
        MapPin, Wind, Search, X, Edit2, 
        Sun, CloudSun, Moon, CloudMoon,
        Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog
    } from 'lucide-svelte';

    // Réception des données du serveur (optionnel)
    let { ssrData } = $props();

    // --- ÉTAT (Runes) ---
    // Si on a des données SSR, on les utilise directement pour un affichage instantané
    let weatherData = $state(ssrData || null);
    let loading = $state(!ssrData); 
    
    // Position par défaut (Mons) ou celle du serveur
    let locationName = $state("Mons");
    let latitude = $state(50.4542);
    let longitude = $state(3.9567);

    // Recherche
    let showSearch = $state(false);
    let searchQuery = $state("");
    let searchResults = $state([]);
    let searchTimeout;

    // --- ICONE DÉRIVÉE ---
    let WeatherIcon = $derived(
        weatherData ? getWeatherIcon(weatherData.weather_code, weatherData.is_day) : Cloud
    );

    onMount(async () => {
        // 1. Vérifier si l'utilisateur a une préférence locale
        if (typeof localStorage !== 'undefined') {
            const savedLoc = localStorage.getItem('bacoWeatherLocation');
            if (savedLoc) {
                try {
                    const parsed = JSON.parse(savedLoc);
                    locationName = parsed.name;
                    latitude = parsed.lat;
                    longitude = parsed.lon;
                    
                    // Si on a une sauvegarde locale, on recharge la météo pour cette ville
                    // (car le serveur a peut-être envoyé la météo par défaut)
                    await loadWeather();
                    return;
                } catch (e) { console.error(e); }
            }
        }

        // 2. Si pas de préférence locale et pas de données SSR, on charge la défaut
        if (!weatherData) {
            await loadWeather();
        }
    });

    async function loadWeather() {
        loading = true;
        try {
            // Ajout d'un timestamp pour éviter le cache agressif
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=Europe%2FBrussels&t=${Date.now()}`);
            const data = await res.json();
            weatherData = data.current;
        } catch (e) { 
            console.error("Erreur Météo:", e); 
        } finally { 
            loading = false; 
        }
    }

    async function searchCity() {
        if (searchQuery.length < 2) return;
        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5&language=fr&format=json`);
            const data = await res.json();
            searchResults = data.results || [];
        } catch (e) { 
            searchResults = []; 
        }
    }

    function selectCity(city) {
        locationName = city.name;
        latitude = city.latitude;
        longitude = city.longitude;
        // Sauvegarde de la préférence
        localStorage.setItem('bacoWeatherLocation', JSON.stringify({ name: city.name, lat: city.latitude, lon: city.longitude }));
        
        showSearch = false;
        searchQuery = "";
        searchResults = [];
        loadWeather();
    }

    function getWeatherIcon(code, isDay) {
        if (code === 0) return isDay ? Sun : Moon;
        if (code === 1 || code === 2) return isDay ? CloudSun : CloudMoon;
        if (code === 3) return Cloud;
        if (code === 45 || code === 48) return CloudFog;
        if (code >= 51 && code <= 67) return CloudRain;
        if (code >= 80 && code <= 82) return CloudRain;
        if (code >= 71 && code <= 86) return CloudSnow;
        if (code >= 95) return CloudLightning;
        return Cloud;
    }

    function handleInput() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(searchCity, 500);
    }
</script>

<div class="relative flex flex-col justify-between overflow-visible h-full glass-panel rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md transition-all duration-300">
    
    <div class="absolute -right-6 -top-6 w-32 h-32 blur-[50px] rounded-full pointer-events-none transition-colors duration-1000
        {weatherData && !weatherData.is_day ? 'bg-indigo-500/20' : 'bg-orange-500/20'}">
    </div>
    
    <div class="p-6 pb-0 flex justify-between items-start relative z-20">
        <div class="flex-1 relative">
            {#if showSearch}
                <div class="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                    <div class="relative w-full">
                        <Search class="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"/>
                        <input 
                            type="text" 
                            bind:value={searchQuery} 
                            oninput={handleInput} 
                            placeholder="Ville..." 
                            class="w-full bg-black/60 border border-blue-500/50 rounded-xl py-2 pl-9 pr-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                            autofocus 
                        />
                        
                        {#if searchResults.length > 0}
                            <div class="absolute top-full left-0 right-0 mt-2 bg-[#1a1d24] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                {#each searchResults as result}
                                    <button 
                                        onclick={() => selectCity(result)} 
                                        class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-blue-600 hover:text-white transition-colors border-b border-white/5 flex justify-between"
                                    >
                                        <span>{result.name}</span>
                                        <span class="text-xs text-gray-500">{result.country_code}</span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button onclick={() => showSearch = false} class="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                        <X class="w-4 h-4" />
                    </button>
                </div>
            {:else}
                <div class="group cursor-pointer inline-flex flex-col" onclick={() => showSearch = true} role="button" tabindex="0" onkeypress={(e) => e.key === 'Enter' && (showSearch = true)}>
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
            <div class="animate-pulse flex flex-col justify-end h-full">
                <div class="flex items-end gap-2 mt-4">
                    <div class="h-12 w-24 bg-white/10 rounded-lg"></div>
                    <div class="h-6 w-6 bg-white/10 rounded-lg mb-1"></div>
                </div>
                <div class="h-6 w-20 bg-white/5 rounded-full mt-2"></div>
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
            <p class="text-sm text-red-400 mt-4">Impossible de charger la météo</p>
        {/if}
    </div>
</div>