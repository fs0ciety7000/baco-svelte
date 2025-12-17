<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  // J'ai ajouté les imports de transition manquants
  import { fly, slide, fade } from 'svelte/transition'; 
  
  import { 
    Search, BookCopy, Activity, ChevronDown, 
    Shield, Accessibility, Users, Bus, Car, BookUser, 
    Train, Folder, Tag, MapPin, Hash, CheckCircle2,
    CalendarDays, Cake, ListTodo, Zap 
  } from 'lucide-svelte';

  // --- ÉTATS (DATA) ---
  let userProfile = null;
  let pmrIssues = [];
  let journalEntries = [];
  let upcomingLeaves = [];
  let upcomingBirthdays = [];

  // États de chargement
  let loadingPmr = true;
  let loadingJournal = true;
  let loadingPlanning = true;
  
  // États d'ouverture des widgets
  let isPmrOpen = true;
  let isJournalOpen = true;
  let isLeavesOpen = true;
  let isBirthdaysOpen = true;

  // --- STYLES GLASSMORPHIC & NÉON ---
  
  // 1. Style de base pour les Conteneurs (Tuiles)
  const glassCardBase = "relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md transition-all duration-300 group hover:bg-white/10 hover:border-white/20 hover:shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]";

  // 2. Style pour les Icones "Accès Rapide" (Gros boutons du haut)
  const iconBoxBase = "p-3 rounded-xl bg-white/5 border border-white/5 text-gray-400 transition-all duration-300 group-hover:scale-110 group-hover:bg-white/10 group-hover:text-white";
  
  // 3. Helper pour le Néon coloré (Glow spécifique par couleur)
  // On injecte ces classes dans les éléments pour que l'ombre corresponde à la couleur de l'icône
  const getNeonStyle = (color) => `
    [&>svg]:transition-all [&>svg]:duration-300 
    group-hover:[&>svg]:drop-shadow-[0_0_8px_${color}]
  `;

  // --- INITIALISATION ---
  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      userProfile = data;
    }

    if (typeof localStorage !== 'undefined') {
      isPmrOpen = localStorage.getItem('bacoPmrWidgetState') !== 'closed';
      isJournalOpen = localStorage.getItem('bacoJournalWidgetState') !== 'closed';
      isLeavesOpen = localStorage.getItem('bacoLeavesWidgetState') !== 'closed';
      isBirthdaysOpen = localStorage.getItem('bacoBirthdaysWidgetState') !== 'closed';
    }

    loadPmrIssues();
    loadRecentJournal();
    loadPlanningWidgetsData();
  });

  // --- CHARGEMENT DONNÉES ---

  async function loadPmrIssues() {
    loadingPmr = true;
    const { data, error } = await supabase
      .from('pmr_data')
      .select('gare, quai, etat_rampe, rampe_id')
      .in('etat_rampe', ['HS', 'En attente'])
      .order('gare', { ascending: true });
    if (!error) pmrIssues = data || [];
    loadingPmr = false;
  }

  async function loadRecentJournal() {
    loadingJournal = true;
    const { data, error } = await supabase
      .from('main_courante')
      .select(`*, profiles ( full_name, avatar_url )`)
      .order('created_at', { ascending: false })
      .limit(3);
    if (!error) journalEntries = data || [];
    loadingJournal = false;
  }
  
  async function loadPlanningWidgetsData() {
    loadingPlanning = true;
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];

    // Congés
    const { data: leaves } = await supabase
        .from('leave_requests')
        .select(`start_date, end_date, type, status, profiles(full_name)`)
        .in('status', ['APPROVED', 'PENDING'])
        .gte('end_date', todayString)
        .order('start_date', { ascending: true })
        .limit(5);
    upcomingLeaves = leaves || [];
    
    // Anniversaires
    const { data: profiles } = await supabase
        .from('profiles')
        .select('full_name, birthday')
        .not('birthday', 'is', null);
        
    if (profiles) {
        upcomingBirthdays = profiles
            .map(profile => {
                const bday = new Date(profile.birthday.replace(/-/g, '/')); 
                const currentYear = today.getFullYear();
                let nextBday = new Date(currentYear, bday.getMonth(), bday.getDate());
                if (nextBday < today) {
                    nextBday = new Date(currentYear + 1, bday.getMonth(), bday.getDate());
                }
                return {
                    name: profile.full_name,
                    date: nextBday,
                    displayDate: nextBday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
                    isToday: nextBday.toDateString() === today.toDateString()
                };
            })
            .sort((a, b) => a.date - b.date)
            .slice(0, 5);
    }
    loadingPlanning = false;
  }

  // --- UTILITAIRES ---

  function toggleWidget(widgetName) {
    if (widgetName === 'pmr') {
      isPmrOpen = !isPmrOpen;
      localStorage.setItem('bacoPmrWidgetState', isPmrOpen ? 'open' : 'closed');
    } else if (widgetName === 'journal') {
      isJournalOpen = !isJournalOpen;
      localStorage.setItem('bacoJournalWidgetState', isJournalOpen ? 'open' : 'closed');
    } else if (widgetName === 'leaves') {
      isLeavesOpen = !isLeavesOpen;
      localStorage.setItem('bacoLeavesWidgetState', isLeavesOpen ? 'open' : 'closed');
    } else if (widgetName === 'birthdays') {
      isBirthdaysOpen = !isBirthdaysOpen;
      localStorage.setItem('bacoBirthdaysWidgetState', isBirthdaysOpen ? 'open' : 'closed');
    }
  }

  function formatLogDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }).replace('.', '');
  }

  function handleSearch() {
    window.dispatchEvent(new CustomEvent('openGlobalSearch'));
  }
</script>

<svelte:head>
  <title>Accueil - Portail BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-10">
  
  <header class="text-center space-y-4" in:fly={{ y: -20, duration: 800 }}>
    <div class="flex justify-center items-center gap-4">
      {#if userProfile?.avatar_url}
        <img 
          src={userProfile.avatar_url} 
          alt="Avatar" 
          class="w-16 h-16 rounded-full object-cover shadow-[0_0_20px_rgba(255,255,255,0.15)] border border-white/10"
        >
      {/if}
      <div class="text-left">
        <h2 class="text-3xl font-bold text-white tracking-tight">
          Bonjour, <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">{userProfile?.full_name || 'Utilisateur'}</span>
        </h2>
        <p class="text-gray-400 text-sm">Bienvenue sur BACO.</p>
      </div>
    </div>
  </header>

  <div in:fly={{ y: 20, duration: 800, delay: 100 }}>
   <div class="flex items-center gap-3 mb-6 pl-1">
      <div class="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
        <Zap class="w-5 h-5" />
      </div>
      <h2 class="text-lg font-bold text-white tracking-wide">Accès Rapide</h2>
   </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <button 
        on:click={handleSearch}
        class="{glassCardBase} block h-full p-6 text-left hover:-translate-y-1">
        <div class="flex items-center gap-4 mb-3">
          <div class="{iconBoxBase} group-hover:text-blue-300 {getNeonStyle('rgba(147,197,253,0.8)')}">
              <Search class="w-6 h-6" />
          </div>
          <h3 class="text-xl font-bold text-white">Rechercher</h3>
        </div>
        <p class="text-sm text-gray-400 pl-1 group-hover:text-gray-300 transition-colors">Accédez à tout instantanément (<kbd class="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs border border-white/10 text-gray-300">Ctrl+K</kbd>).</p>
      </button>
      
      <a href="/journal" class="{glassCardBase} block h-full p-6 hover:-translate-y-1">
        <div class="flex items-center gap-4 mb-3">
          <div class="{iconBoxBase} group-hover:text-yellow-300 {getNeonStyle('rgba(253,224,71,0.8)')}">
              <BookCopy class="w-6 h-6" />
          </div>
          <h3 class="text-xl font-bold text-white">Nouvelle Entrée</h3>
        </div>
        <p class="text-sm text-gray-400 pl-1 group-hover:text-gray-300 transition-colors">Consigner un événement dans la main courante.</p>
      </a>

      <a href="/planning" class="{glassCardBase} block h-full p-6 hover:-translate-y-1">
        <div class="flex items-center gap-4 mb-3">
          <div class="{iconBoxBase} group-hover:text-pink-300 {getNeonStyle('rgba(249,168,212,0.8)')}">
              <CalendarDays class="w-6 h-6" />
          </div>
          <h3 class="text-xl font-bold text-white">Planning</h3>
        </div>
        <p class="text-sm text-gray-400 pl-1 group-hover:text-gray-300 transition-colors">Gérer les congés et voir les présents.</p>
      </a>
      </div>
  </div>
  
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8" in:fly={{ y: 20, duration: 800, delay: 200 }}>
    
    <div class="{glassCardBase} p-0">
      <button 
        on:click={() => toggleWidget('leaves')}
        class="w-full text-left p-5 flex items-center justify-between group cursor-pointer"
      >
        <span class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 transition-all duration-300 group-hover:bg-green-500/20 group-hover:text-green-300 {getNeonStyle('rgba(134,239,172,0.8)')}">
             <ListTodo class="w-5 h-5" />
          </div>
          <span class="text-lg font-bold text-white">Congés à venir</span>
        </span>
        <div class="text-white/50 transition-transform duration-300 {isLeavesOpen ? 'rotate-180' : ''}">
             <ChevronDown class="w-5 h-5" />
        </div>
      </button>

      {#if isLeavesOpen}
        <div class="p-5 pt-0 space-y-3" transition:slide>
          {#if loadingPlanning}
            <div class="text-center text-gray-400 animate-pulse py-4 text-sm">Chargement...</div>
          {:else if upcomingLeaves.length === 0}
            <p class="text-sm text-gray-500 text-center py-4 bg-black/20 rounded-xl border border-white/5">Aucun congé prévu prochainement.</p>
          {:else}
            <ul class="space-y-2">
              {#each upcomingLeaves as leave}
                <li class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] transition-colors">
                    <div>
                        <span class="block font-medium text-gray-200 text-sm">{leave.profiles.full_name}</span>
                        <span class="text-[10px] text-gray-500 uppercase tracking-wider">{leave.type}</span>
                    </div>
                    <div class="text-right">
                         <span class="text-[10px] font-bold px-2 py-0.5 rounded-full {leave.status === 'APPROVED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}">
                            {leave.status === 'APPROVED' ? 'Validé' : 'En attente'}
                         </span>
                         <p class="text-[10px] text-gray-500 mt-1">
                            {new Date(leave.start_date).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})} → {new Date(leave.end_date).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})}
                         </p>
                    </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>
    
    <div class="{glassCardBase} p-0">
        <button 
            on:click={() => toggleWidget('birthdays')}
            class="w-full text-left p-5 flex items-center justify-between group cursor-pointer"
        >
            <span class="flex items-center gap-3">
                <div class="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 transition-all duration-300 group-hover:bg-pink-500/20 group-hover:text-pink-300 {getNeonStyle('rgba(244,114,182,0.8)')}">
                     <Cake class="w-5 h-5" />
                </div>
                <span class="text-lg font-bold text-white">Anniversaires</span>
            </span>
            <div class="text-white/50 transition-transform duration-300 {isBirthdaysOpen ? 'rotate-180' : ''}">
                 <ChevronDown class="w-5 h-5" />
            </div>
        </button>

      {#if isBirthdaysOpen}
        <div class="p-5 pt-0 space-y-3" transition:slide>
          {#if loadingPlanning}
             <div class="text-center text-gray-400 animate-pulse py-4 text-sm">Chargement...</div>
          {:else if upcomingBirthdays.length === 0}
            <p class="text-sm text-gray-500 text-center py-4 bg-black/20 rounded-xl border border-white/5">Aucun anniversaire.</p>
          {:else}
            <ul class="space-y-2">
              {#each upcomingBirthdays as birthday}
                 <li class="flex items-center justify-between p-3 rounded-xl border transition-all
                            {birthday.isToday 
                                ? 'bg-pink-500/10 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.15)]' 
                                : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.07]'}">
                  <span class="font-medium text-gray-200 text-sm">{birthday.name}</span>
                  <span class="text-xs font-bold flex items-center gap-2 {birthday.isToday ? 'text-pink-300' : 'text-gray-500'}">
                    🎂 {birthday.displayDate}
                    {#if birthday.isToday}<span class="animate-pulse bg-pink-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">J-J</span>{/if}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>

  </div>

  <div class="space-y-8" in:fly={{ y: 20, duration: 800, delay: 300 }}>
    
    <div class="{glassCardBase} p-0">
        <button 
            on:click={() => toggleWidget('pmr')}
            class="w-full text-left p-5 flex items-center justify-between group cursor-pointer"
        >
            <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 transition-all duration-300 group-hover:bg-red-500/20 group-hover:text-red-300 {getNeonStyle('rgba(248,113,113,0.8)')}">
                <Activity class="w-6 h-6" />
            </div>
            <span class="text-xl font-bold text-white">Rampes PMR (HS/En attente)</span>
            </div>
            <div class="text-white/50 transition-transform duration-300 {isPmrOpen ? 'rotate-180' : ''}">
            <ChevronDown class="w-6 h-6" />
            </div>
        </button>
        
        {#if isPmrOpen}
            <div class="p-5 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" transition:slide>
            {#if loadingPmr}
                <div class="col-span-full py-8 text-center text-gray-400 animate-pulse text-sm">Recherche des données...</div>
            {:else if pmrIssues.length === 0}
                <div class="col-span-full flex flex-col items-center justify-center p-8 border border-dashed border-green-500/20 rounded-2xl bg-green-500/[0.02]">
                <CheckCircle2 class="w-10 h-10 text-green-500/50 mb-2" />
                <span class="text-green-200/50 font-medium text-sm">Aucun problème signalé. Tout est opérationnel.</span>
                </div>
            {:else}
                {#each pmrIssues as issue}
                <a href="/pmr?search={issue.rampe_id || issue.gare}" 
                    class="relative overflow-hidden block p-4 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40 transition-all hover:-translate-y-1 group/item">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]"></div>
                    <div class="flex justify-between items-start mb-2 pl-2">
                    <h4 class="font-bold text-lg text-white group-hover/item:text-red-300 transition-colors">{issue.gare}</h4>
                    <span class="flex h-2.5 w-2.5 relative mt-1.5">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                    </div>
                    <div class="pl-2 space-y-1">
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] font-mono text-red-200/80 bg-red-500/20 border border-red-500/20 px-2 py-0.5 rounded">{issue.etat_rampe}</span>
                            <span class="text-xs text-gray-400 flex items-center gap-1">
                                <MapPin class="w-3 h-3 text-red-400" /> Quai {issue.quai || '?'}
                            </span>
                        </div>
                    </div>
                </a>
                {/each}
            {/if}
            </div>
        {/if}
    </div>

    <div class="{glassCardBase} p-0">
        <button 
          on:click={() => toggleWidget('journal')}
          class="w-full text-left p-5 flex items-center justify-between group cursor-pointer"
        >
          <span class="flex items-center gap-3">
             <div class="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 transition-all duration-300 group-hover:bg-yellow-500/20 group-hover:text-yellow-300 {getNeonStyle('rgba(250,204,21,0.8)')}">
                <BookCopy class="w-6 h-6" />
            </div>
            <span class="text-xl font-bold text-white">Activité Récente</span>
          </span>
          <div class="text-white/50 transition-transform duration-300 {isJournalOpen ? 'rotate-180' : ''}">
            <ChevronDown class="w-6 h-6" />
          </div>
        </button>
    
        {#if isJournalOpen}
          <div class="p-5 pt-0 space-y-3" transition:slide>
            {#if loadingJournal}
               <div class="text-center text-gray-400 animate-pulse py-4 text-sm">Chargement...</div>
            {:else if journalEntries.length === 0}
               <p class="text-sm text-gray-500 text-center p-4 bg-black/20 rounded-xl">Le journal est vide.</p>
            {:else}
               {#each journalEntries as entry}
                 <div class="bg-white/[0.03] border border-white/5 rounded-xl flex gap-4 p-4 hover:bg-white/[0.07] transition-colors">
                    {#if entry.profiles?.avatar_url}
                        <img src={entry.profiles.avatar_url} alt="avatar" class="w-9 h-9 rounded-full object-cover border border-white/10 shadow-sm">
                    {:else}
                        <div class="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs text-white">?</div>
                    {/if}
                   <div class="flex-1 min-w-0">
                     <div class="flex justify-between items-center mb-1">
                        <span class="font-bold text-gray-200 text-sm truncate">{entry.profiles?.full_name || 'Inconnu'}</span>
                        <span class="text-[10px] text-gray-500 whitespace-nowrap bg-black/20 px-1.5 py-0.5 rounded">{formatLogDate(entry.created_at)}</span>
                     </div>
                     <p class="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{entry.message_content}</p>
                   </div>
                  </div>
               {/each}
            {/if}
            <a href="/journal" class="block text-xs font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 text-center pt-3 transition-colors">
              Voir tout le journal
            </a>
          </div>
        {/if}
    </div>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" in:fly={{ y: 20, duration: 800, delay: 400 }}>
     {#each [
        { href: '/operationnel', icon: Shield, label: 'Opérationnel', color: 'text-blue-400', glow: 'rgba(96,165,250,0.8)', desc: 'Procédures' },
        { href: '/pmr', icon: Accessibility, label: 'Rampes', color: 'text-red-400', glow: 'rgba(248,113,113,0.8)', desc: 'État' },
        { href: '/clients-pmr', icon: Users, label: 'Clients', color: 'text-purple-400', glow: 'rgba(192,132,252,0.8)', desc: 'Détails' },
        { href: '/bus', icon: Bus, label: 'Bus', color: 'text-yellow-400', glow: 'rgba(250,204,21,0.8)', desc: 'Substitute' },
        { href: '/taxi', icon: Car, label: 'Taxi', color: 'text-orange-400', glow: 'rgba(251,146,60,0.8)', desc: 'Commande' },
        { href: '/repertoire', icon: BookUser, label: 'Répertoire', color: 'text-green-400', glow: 'rgba(74,222,128,0.8)', desc: 'Contacts' },
        { href: '/lignes', icon: Train, label: 'Lignes', color: 'text-cyan-400', glow: 'rgba(34,211,238,0.8)', desc: 'Infos' },
        { href: '/documents', icon: Folder, label: 'Docs', color: 'text-gray-400', glow: 'rgba(156,163,175,0.8)', desc: 'Archives' },
        { href: '/ptcar', icon: Tag, label: 'PtCar', color: 'text-indigo-400', glow: 'rgba(129,140,248,0.8)', desc: 'Codes' }
     ] as item}
        <a href={item.href} class="{glassCardBase} p-4 flex flex-col items-center justify-center text-center gap-3 hover:-translate-y-1 group">
            <item.icon class="w-8 h-8 {item.color} transition-transform duration-300 group-hover:scale-110 {getNeonStyle(item.glow)}" />
            <div>
                <span class="block font-bold text-white text-sm group-hover:text-blue-100 transition-colors">{item.label}</span>
                {#if item.desc}
                    <span class="text-[10px] text-gray-500 uppercase tracking-wider group-hover:text-gray-400 transition-colors">{item.desc}</span>
                {/if}
            </div>
        </a>
     {/each}
  </div>

</div>