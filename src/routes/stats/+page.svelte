<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fade, fly } from 'svelte/transition';
  import { 
    BarChart3, TrendingUp, Users, Map, Car, Bus, 
    Calendar, Building2, Loader2, ArrowRight
  } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  // --- ÉTATS ---
  let isLoading = true;
  let period = 'all'; // 'all', 'month', 'year' (Pour future évolution)
  
  // Données brutes
  let ottos = [];
  let taxis = [];

  // Données calculées
  let stats = {
    global: { total: 0, otto: 0, taxi: 0 },
    topSocieties: [],
    topRoutes: [],
    topCreators: [],
    monthlyActivity: []
  };

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return goto('/');

    await loadData();
  });

  async function loadData() {
    isLoading = true;

    // 1. Récupération des données OTTO
    const { data: dataOtto, error: errOtto } = await supabase
      .from('otto_commandes')
      .select(`
        id, date_commande, origine, destination, 
        societes_bus(nom), 
        creator:user_id(full_name)
      `);

    // 2. Récupération des données TAXI (Adapté selon ta structure probable)
    // Assure-toi que la table s'appelle bien 'taxi_commandes' ou adapte ici
    const { data: dataTaxi, error: errTaxi } = await supabase
      .from('taxi_commandes')
      .select(`
        id, date_commande, origine, destination, 
        societes_taxi(nom), 
        creator:user_id(full_name)
      `);

    if (errOtto) console.error("Erreur Otto", errOtto);
    if (errTaxi) console.error("Erreur Taxi", errTaxi);

    ottos = dataOtto || [];
    taxis = dataTaxi || [];

    calculateStats();
    isLoading = false;
  }

  function calculateStats() {
    // A. Totaux
    stats.global.otto = ottos.length;
    stats.global.taxi = taxis.length;
    stats.global.total = ottos.length + taxis.length;

    // B. Sociétés les plus sollicitées (Combiné)
    const socMap = {};
    const processSoc = (list, type) => {
        list.forEach(item => {
            // Gestion des noms de sociétés selon la table (bus vs taxi)
            const name = type === 'bus' ? item.societes_bus?.nom : item.societes_taxi?.nom;
            const finalName = name || 'Inconnu';
            if (!socMap[finalName]) socMap[finalName] = { name: finalName, count: 0, type };
            socMap[finalName].count++;
        });
    };
    processSoc(ottos, 'bus');
    processSoc(taxis, 'taxi');
    
    stats.topSocieties = Object.values(socMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5

    // C. Trajets les plus fréquents (Distincts par type pour éviter confusion)
    const routeMap = {};
    const processRoute = (list, type) => {
        list.forEach(item => {
            if(!item.origine || !item.destination) return;
            const key = `${item.origine} → ${item.destination}`;
            if (!routeMap[key]) routeMap[key] = { name: key, count: 0, type };
            routeMap[key].count++;
        });
    }
    processRoute(ottos, 'bus');
    processRoute(taxis, 'taxi');

    stats.topRoutes = Object.values(routeMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8); // Top 8

    // D. Top Rédacteurs (Qui crée le plus de bons ?)
    const userMap = {};
    const allItems = [...ottos, ...taxis];
    allItems.forEach(item => {
        const name = item.creator?.full_name || 'Inconnu';
        if (!userMap[name]) userMap[name] = { name, count: 0 };
        userMap[name].count++;
    });

    stats.topCreators = Object.values(userMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
  }

  // Helper pour calculer le pourcentage de largeur des barres
  const getPercent = (val, max) => (val / max) * 100;
</script>

<svelte:head>
  <title>C3 | Statistiques</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 min-h-screen space-y-8">
  
  <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
          <BarChart3 class="w-8 h-8" />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Tableau de Bord</h1>
          <p class="text-gray-500 text-sm mt-1">Analyse des commandes et de l'activité.</p>
        </div>
    </div>
    
    <div class="flex gap-2">
        <button on:click={loadData} class="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <TrendingUp size={20} />
        </button>
    </div>
  </header>

  {#if isLoading}
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-indigo-500" />
        <p class="text-gray-500 text-sm">Calcul des statistiques...</p>
    </div>
  {:else}
    <div in:fade={{ duration: 300 }} class="space-y-8">

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-indigo-500/30 transition-all">
                <div class="absolute right-0 top-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-indigo-500/10 transition-all"></div>
                <div class="relative z-10">
                    <p class="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2">Total Commandes</p>
                    <div class="flex items-baseline gap-2">
                        <span class="text-4xl font-extrabold text-white">{stats.global.total}</span>
                        <span class="text-xs text-gray-500">dossiers</span>
                    </div>
                </div>
            </div>

            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-orange-500/30 transition-all">
                <div class="absolute right-0 top-0 p-32 bg-orange-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-orange-500/10 transition-all"></div>
                <div class="relative z-10 flex justify-between items-center">
                    <div>
                        <p class="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Bus size={14}/> Bus (Otto)</p>
                        <span class="text-4xl font-extrabold text-orange-400">{stats.global.otto}</span>
                    </div>
                    <div class="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <span class="text-xs font-bold text-orange-400">{Math.round((stats.global.otto / stats.global.total) * 100 || 0)}%</span>
                    </div>
                </div>
            </div>

            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                <div class="absolute right-0 top-0 p-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-cyan-500/10 transition-all"></div>
                <div class="relative z-10 flex justify-between items-center">
                    <div>
                        <p class="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Car size={14}/> Taxis</p>
                        <span class="text-4xl font-extrabold text-cyan-400">{stats.global.taxi}</span>
                    </div>
                    <div class="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                        <span class="text-xs font-bold text-cyan-400">{Math.round((stats.global.taxi / stats.global.total) * 100 || 0)}%</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col">
                <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Building2 class="text-gray-400" size={20} /> Sociétés les plus sollicitées
                </h3>
                
                <div class="space-y-5 flex-grow">
                    {#each stats.topSocieties as soc, i}
                        <div class="relative">
                            <div class="flex justify-between text-sm mb-1.5 z-10 relative">
                                <span class="text-gray-200 font-medium flex items-center gap-2">
                                    <span class="w-5 h-5 rounded flex items-center justify-center text-[10px] bg-white/5 text-gray-500 font-bold">{i+1}</span>
                                    {soc.name}
                                </span>
                                <span class="text-gray-400 font-mono">{soc.count}</span>
                            </div>
                            <div class="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div 
                                    class="h-full rounded-full transition-all duration-1000 {soc.type === 'bus' ? 'bg-orange-500' : 'bg-cyan-500'}"
                                    style="width: {getPercent(soc.count, stats.topSocieties[0].count)}%"
                                ></div>
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
                
                <div class="space-y-4">
                    {#each stats.topCreators as user, i}
                        <div class="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-white font-bold text-sm">
                                {user.name.charAt(0)}
                            </div>
                            <div class="flex-grow">
                                <p class="text-sm font-bold text-gray-200">{user.name}</p>
                                <div class="w-full bg-black/40 h-1.5 rounded-full mt-1.5">
                                    <div class="bg-indigo-500 h-1.5 rounded-full" style="width: {getPercent(user.count, stats.topCreators[0].count)}%"></div>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="block text-lg font-bold text-white">{user.count}</span>
                                <span class="text-[10px] text-gray-500 uppercase">Cmds</span>
                            </div>
                        </div>
                    {:else}
                        <p class="text-gray-500 text-sm italic">Pas assez de données.</p>
                    {/each}
                </div>
            </div>

        </div>

        <div class="bg-black/20 border border-white/5 rounded-2xl p-6">
            <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Map class="text-gray-400" size={20} /> Trajets Fréquents
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {#each stats.topRoutes as route}
                    <div class="p-4 bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/10 rounded-xl transition-all flex flex-col justify-between h-32 relative overflow-hidden">
                        
                        <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl {route.type === 'bus' ? 'from-orange-500/10' : 'from-cyan-500/10'} to-transparent rounded-bl-3xl -mr-4 -mt-4"></div>

                        <div class="flex items-start justify-between z-10">
                            {#if route.type === 'bus'}
                                <Bus size={18} class="text-orange-400" />
                            {:else}
                                <Car size={18} class="text-cyan-400" />
                            {/if}
                            <span class="text-xs font-bold px-2 py-1 rounded bg-black/40 text-gray-300 border border-white/5">{route.count} x</span>
                        </div>

                        <div class="z-10 mt-2">
                            {@const parts = route.name.split(' → ')}
                            <div class="flex flex-col gap-1">
                                <span class="text-sm font-bold text-white truncate" title={parts[0]}>{parts[0]}</span>
                                <div class="flex items-center gap-2 text-gray-600">
                                    <div class="h-px bg-gray-700 w-full"></div>
                                    <ArrowRight size={12} />
                                </div>
                                <span class="text-sm font-bold text-white truncate" title={parts[1]}>{parts[1]}</span>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="col-span-full text-center py-10 text-gray-500">
                        Aucun trajet enregistré.
                    </div>
                {/each}
            </div>
        </div>

    </div>
  {/if}
</div>