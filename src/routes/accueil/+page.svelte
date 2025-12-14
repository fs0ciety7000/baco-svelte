<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { 
    Search, BookCopy, Activity, ChevronUp, ChevronDown, 
    Shield, Accessibility, Users, Bus, Car, BookUser, 
    Train, Folder, Tag, MapPin, Hash, CheckCircle2 
  } from 'lucide-svelte';

  // --- ÉTATS (DATA) ---
  let userProfile = null;
  let pmrIssues = [];
  let journalEntries = [];
  
  // États de chargement
  let loadingPmr = true;
  let loadingJournal = true;

  // États d'ouverture des widgets (persistance via localStorage)
  let isPmrOpen = true;
  let isJournalOpen = true;

  // --- LOGIQUE D'INITIALISATION ---
  onMount(async () => {
    // 1. Charger l'utilisateur
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      userProfile = data;
    }

    // 2. Récupérer l'état des widgets depuis le localStorage
    if (typeof localStorage !== 'undefined') {
      isPmrOpen = localStorage.getItem('bacoPmrWidgetState') !== 'closed';
      isJournalOpen = localStorage.getItem('bacoJournalWidgetState') !== 'closed';
    }

    // 3. Charger les données
    loadPmrIssues();
    loadRecentJournal();
  });

  // --- FONCTIONS DE CHARGEMENT ---

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

  // --- UTILITAIRES ---

  function toggleWidget(widgetName) {
    if (widgetName === 'pmr') {
      isPmrOpen = !isPmrOpen;
      localStorage.setItem('bacoPmrWidgetState', isPmrOpen ? 'open' : 'closed');
    } else if (widgetName === 'journal') {
      isJournalOpen = !isJournalOpen;
      localStorage.setItem('bacoJournalWidgetState', isJournalOpen ? 'open' : 'closed');
    }
  }

  function formatLogDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }).replace('.', '');
  }

  // Fonction placeholder pour la recherche (à connecter plus tard au store global)
  function handleSearch() {
    console.log("Ouvrir recherche globale");
    // window.dispatchEvent(new CustomEvent('openGlobalSearch'));
  }
</script>

<svelte:head>
  <title>Accueil - Portail BACO</title>
</svelte:head>

<div class="container mx-auto p-8">
  
  <header class="mb-10 text-center">
    <div class="flex justify-center items-center gap-4 mb-4" style="min-height: 3rem;">
      {#if userProfile?.avatar_url}
        <img 
          src={userProfile.avatar_url} 
          alt="Avatar" 
          class="w-12 h-12 rounded-full object-cover shadow-md border-2 border-white dark:border-gray-700"
        >
      {/if}
      
      <h2 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-400 dark:from-blue-400 dark:to-cyan-300 bg-clip-text text-transparent bg-[size:200%_auto] animate-gradient-pan">
        Bonjour, {userProfile?.full_name || 'utilisateur'}
      </h2>
    </div>
    
    <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">Bienvenue sur BACO</h1>
  </header>

  <div class="mb-10">
    <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Accès Rapide</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <button 
        on:click={handleSearch}
        class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all text-left">
        <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          <Search class="w-5 h-5 text-blue-600" />
          <span>Rechercher</span>
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Ouvrir la recherche globale (<kbd class="font-sans">Ctrl+K</kbd>).</p>
      </button>
      
      <a href="/journal" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
        <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          <BookCopy class="w-5 h-5 text-blue-600" />
          <span>Nouvelle Entrée</span>
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Ouvrir le journal pour poster une entrée.</p>
      </a>

    </div>
  </div>

  <div class="mb-10">
    <button 
      on:click={() => toggleWidget('pmr')}
      class="w-full text-left text-2xl font-semibold text-gray-800 dark:text-gray-100 flex items-center justify-between gap-2 p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
      title="Afficher/Masquer les problèmes en cours"
    >
      <span class="flex items-center gap-2">
        <Activity class="w-6 h-6 text-red-500" />
        <span>Problèmes en cours (Rampes PMR)</span>
      </span>
      {#if isPmrOpen}
        <ChevronUp class="w-6 h-6 text-gray-500 dark:text-gray-400" />
      {:else}
        <ChevronDown class="w-6 h-6 text-gray-500 dark:text-gray-400" />
      {/if}
    </button>
    
    {#if isPmrOpen}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 transition-all duration-300">
        {#if loadingPmr}
           <div class="col-span-full text-center text-gray-500">Chargement...</div>
        {:else if pmrIssues.length === 0}
          <div class="col-span-full flex items-center justify-center p-6 bg-white dark:bg-gray-900 border border-green-200 dark:border-green-700 rounded-lg">
            <CheckCircle2 class="w-6 h-6 text-green-500" />
            <span class="ml-3 text-gray-700 dark:text-gray-200">Aucun problème signalé sur les rampes.</span>
          </div>
        {:else}
          {#each pmrIssues as issue}
            <a href="/pmr?search={issue.rampe_id || issue.gare}" 
               class="block p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md transition-all">
              <div class="flex justify-between items-center mb-2">
                <h4 class="font-bold text-lg text-blue-700 dark:text-blue-400">{issue.gare}</h4>
                <span class="px-2.5 py-0.5 text-xs font-bold rounded-full {issue.etat_rampe === 'HS' ? 'text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-900' : 'text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-700'}">
                  {issue.etat_rampe}
                </span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <MapPin class="w-3 h-3" /> Quai: <strong>{issue.quai || 'N/A'}</strong>
              </p>
              <p class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Hash class="w-3 h-3" /> ID: <strong>{issue.rampe_id || 'N/A'}</strong>
              </p>
            </a>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="mb-10">
    <button 
      on:click={() => toggleWidget('journal')}
      class="w-full text-left text-2xl font-semibold text-gray-800 dark:text-gray-100 flex items-center justify-between gap-2 p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
    >
      <span class="flex items-center gap-2">
        <BookCopy class="w-6 h-6 text-yellow-600" />
        <span>Activité Récente du Journal</span>
      </span>
      {#if isJournalOpen}
        <ChevronUp class="w-6 h-6 text-gray-500 dark:text-gray-400" />
      {:else}
        <ChevronDown class="w-6 h-6 text-gray-500 dark:text-gray-400" />
      {/if}
    </button>

    {#if isJournalOpen}
      <div class="space-y-4 mt-4">
        {#if loadingJournal}
           <div class="text-center text-gray-500">Chargement...</div>
        {:else if journalEntries.length === 0}
           <p class="text-sm text-gray-500 dark:text-gray-400 text-center p-4">Le journal est vide.</p>
        {:else}
           {#each journalEntries as entry}
             <div class="bg-white dark:bg-gray-900 shadow border border-gray-200 dark:border-gray-700 rounded-lg flex gap-4 p-4 mx-4">
               <img src={entry.profiles?.avatar_url} alt="avatar" class="w-10 h-10 rounded-full object-cover hidden sm:block">
               <div class="flex-1">
                 <div class="flex justify-between items-center mb-2">
                   <div class="flex items-center gap-2">
                     <img src={entry.profiles?.avatar_url} alt="avatar" class="w-8 h-8 rounded-full object-cover sm:hidden">
                     <span class="font-semibold text-gray-900 dark:text-gray-100">{entry.profiles?.full_name || 'Utilisateur inconnu'}</span>
                     <span class="text-xs text-gray-500 dark:text-gray-400">{formatLogDate(entry.created_at)}</span>
                   </div>
                 </div>
                 <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry.message_content}</p>
               </div>
             </div>
           {/each}
        {/if}
        
        <a href="/journal" class="block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline text-center pt-2">
          Voir tout le journal
        </a>
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    
    <a href="/operationnel" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Shield class="w-5 h-5 text-blue-600" /> <span>Opérationnel</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Informations sur les sites et numéros d'urgence.</p>
    </a>

    <a href="/pmr" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Accessibility class="w-5 h-5 text-blue-600" /> <span>Rampes PMR</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Données relatives aux Personnes à Mobilité Réduite.</p>
    </a>

    <a href="/clients_pmr" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Users class="w-5 h-5 text-blue-600" /> <span>Clients PMR</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Répertoire des clients à mobilité réduite.</p>
    </a>

    <a href="/bus" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Bus class="w-5 h-5 text-blue-600" /> <span>Bus</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Filtrage des chauffeurs par société et par ligne.</p>
    </a>

    <a href="/taxi" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Car class="w-5 h-5 text-blue-600" /> <span>Taxi</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Filtrage des sociétés de taxi par lieu d'intervention.</p>
    </a>

    <a href="/repertoire" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <BookUser class="w-5 h-5 text-blue-600" /> <span>Répertoire</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Répertoire téléphonique interne (MIA, RCC, OCC).</p>
    </a>

    <a href="/lignes" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Train class="w-5 h-5 text-blue-600" /> <span>Lignes</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Détails des lignes, adresses PN et zones SPI.</p>
    </a>

    <a href="/documents" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Folder class="w-5 h-5 text-blue-600" /> <span>Documents</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Procédures d'urgence, schémas, etc.</p>
    </a>

    <a href="/ptcar" class="block h-full p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <h3 class="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        <Tag class="w-5 h-5 text-blue-600" /> <span>PtCar</span>
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 pl-8">Répertoire des abréviations PtCar.</p>
    </a>

  </div>
</div>