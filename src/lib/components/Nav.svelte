<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  // Icônes
  import { 
    Shield, Accessibility, ChevronDown, Combine, Users, BookUser, 
    Bus, Car, Database, Train, Tag, Map, Folder, BookCopy, 
    ClipboardPaste, Search, CalendarDays, Bell, UserCog, 
    ShieldCheck, BarChart2, History, LogOut, Menu, X 
  } from 'lucide-svelte';
  
  export let user; // Reçu depuis +layout.svelte

  let isMobileMenuOpen = false;
  let activeDropdown = null;
  let userProfile = null;
  let isAdmin = false;
  let isModerator = false;
  let notificationsCount = 0;
  
  // NOUVEAU: Données du calendrier
  let currentYear = new Date().getFullYear();
  let weeksInYear = [];

  // --- RÉACTIVITÉ CRUCIALE POUR L'AVATAR ---
  // Dès que 'user' change (ex: connexion terminée), on charge le profil
  $: if (user) loadUserProfile();
  
  // Dès que le composant est monté, on génère le calendrier
  onMount(() => {
    generateYearCalendar(currentYear);
  });
  
  async function loadUserProfile() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url, role, full_name')
        .eq('id', user.id)
        .single();
      if (data) {
        userProfile = data;
        isAdmin = data.role === 'admin';
        isModerator = data.role === 'moderator';
      }

      // Charger les notifs en même temps
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id_target', user.id)
        .eq('is_read', false);
      notificationsCount = count || 0;

    } catch (err) {
      console.error("Erreur chargement profil nav:", err);
    }
  }

  // Fonction pour calculer le numéro de semaine ISO 8601
  function getWeekNumber(d) {
    // Clone date object.
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number.
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // Get first day of year.
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday.
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }
  
  // NOUVEAU: Fonction pour générer le calendrier annuel
  function generateYearCalendar(year) {
    weeksInYear = [];
    let d = new Date(year, 0, 1);
    let currentWeek = -1;

    // Début de l'année précédente si le 1er janvier est après jeudi
    if (d.getDay() > 4) {
      d.setDate(d.getDate() + (1 - d.getDay()) + 7);
    }

    while (d.getFullYear() <= year) {
      let weekNo = getWeekNumber(d);

      if (weekNo !== currentWeek) {
        let month = d.getMonth() + 1; // Mois base 1
        weeksInYear.push({
          week: weekNo,
          month: month,
          // Formatage simple pour l'affichage du début de semaine
          start: new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
          isCurrent: weekNo === getWeekNumber(new Date()) && year === new Date().getFullYear()
        });
        currentWeek = weekNo;
      }

      // Avance d'une semaine (7 jours)
      d.setDate(d.getDate() + 7);
      
      // S'assurer de ne pas dépasser la fin de l'année suivante
      if (d.getFullYear() > year && getWeekNumber(d) === 1) {
          break; 
      }
    }
    
    // Correction pour la semaine 52/53 qui pourrait être ajoutée après le break
    if (weeksInYear[weeksInYear.length - 1]?.month === 1 && weeksInYear[weeksInYear.length - 1]?.week !== 1) {
        weeksInYear.pop();
    }
  }


  function closeDropdowns() {
    activeDropdown = null;
  }

  function toggleDropdown(name, event) {
    event.stopPropagation();
    activeDropdown = activeDropdown === name ? null : name;
  }

  $: isActive = (path) => $page.url.pathname.includes(path) ? 'bg-gray-700 font-bold' : '';
  
  async function handleLogout() {
    await supabase.auth.signOut();
    goto('/');
  }

  function handleGlobalSearch() {
    // Déclenche l'événement pour ouvrir le modal GlobalSearch
    window.dispatchEvent(new CustomEvent('openGlobalSearch'));
  }
</script>

<svelte:window on:click={closeDropdowns} />

<nav class="bg-gray-900 text-white shadow-lg relative z-50">
  <div class="container mx-auto px-6 py-3">
    
    <div class="flex justify-between items-center">
      <a href="/accueil" class="block transition-opacity duration-300 hover:opacity-80">
        <img src="/logobaco.png" alt="Logo BACO" class="h-20 w-auto">
      </a>
      
      <button 
        on:click|stopPropagation={() => isMobileMenuOpen = !isMobileMenuOpen}
        class="md:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700"
      >
        {#if isMobileMenuOpen}<X class="w-6 h-6" />{:else}<Menu class="w-6 h-6" />{/if}
      </button>
    </div>

    <div class="{isMobileMenuOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row md:items-start md:justify-between w-full md:flex-nowrap mt-4 md:mt-0">
      
      <div class="flex flex-col md:flex-row md:space-x-4 flex-wrap gap-2 md:gap-0 items-center">
        
        <a href="/operationnel" class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('operationnel')}">
          <Shield class="w-4 h-4" /><span>Opérationnel</span>
        </a>
        
        <div class="relative">
          <button on:click={(e) => toggleDropdown('pmr', e)} class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('pmr') ? 'bg-gray-700' : ''}">
            <Accessibility class="w-4 h-4" /><span>PMR</span>
            <ChevronDown class="w-4 h-4 ml-1 transform transition-transform {activeDropdown === 'pmr' ? 'rotate-180' : ''}" />
          </button>
          {#if activeDropdown === 'pmr'}
            <div class="absolute top-full left-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
              <a href="/pmr" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Combine class="w-4 h-4"/> Rampes</a>
              <a href="/clients-pmr" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Users class="w-4 h-4"/> Clients</a>
            </div>
          {/if}
        </div>

        <div class="relative">
          <button on:click={(e) => toggleDropdown('repertoire', e)} class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('bus') || isActive('taxi') ? 'bg-gray-700' : ''}">
            <BookUser class="w-4 h-4" /><span>Répertoire</span>
            <ChevronDown class="w-4 h-4 ml-1 transform transition-transform {activeDropdown === 'repertoire' ? 'rotate-180' : ''}" />
          </button>
          {#if activeDropdown === 'repertoire'}
            <div class="absolute top-full left-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
              <a href="/bus" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Bus class="w-4 h-4"/> Bus</a>
              <a href="/taxi" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Car class="w-4 h-4"/> Taxi</a>
              <a href="/repertoire" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><BookUser class="w-4 h-4"/> Interne</a>
            </div>
          {/if}
        </div>

        <div class="relative">
            <button on:click={(e) => toggleDropdown('data', e)} class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
            <Database class="w-4 h-4" /><span>Data</span>
              <ChevronDown class="w-4 h-4 ml-1 transform transition-transform {activeDropdown === 'data' ? 'rotate-180' : ''}" />
            </button>
            {#if activeDropdown === 'data'}
              <div class="absolute top-full left-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                <a href="/lignes" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Train class="w-4 h-4"/> Lignes</a>
                <a href="/ptcar" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Tag class="w-4 h-4"/> PtCar</a>
                <a href="/ebp" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Database class="w-4 h-4"/> EBP</a>
                <a href="/carte-pn" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Map class="w-4 h-4"/> Carte</a>
              </div>
            {/if}
          </div>

        <a href="/documents" class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('documents')}">
            <Folder class="w-4 h-4" /><span>Documents</span>
        </a>

        <a href="/journal" class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('journal')}">
            <BookCopy class="w-4 h-4" /><span>Journal</span>
        </a>

        {#if isAdmin || isModerator}
           {/if}
      </div>

      <div class="flex flex-col md:flex-row items-start md:items-center gap-4 mt-4 md:mt-0 border-t border-gray-700 pt-4 md:border-none md:pt-0">
        
        <button on:click={handleGlobalSearch} class="px-3 py-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 hidden md:flex items-center gap-2">
            <Search class="w-5 h-5" />
            <span class="font-mono text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">Ctrl+K</span>
        </button>

        <ThemeToggle />

        <div class="relative">
            <button on:click={(e) => toggleDropdown('calendar', e)} 
                    class="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 relative">
                <CalendarDays class="w-5 h-5" />
            </button>
            
            {#if activeDropdown === 'calendar'}
                <div class="absolute top-full right-0 mt-2 w-[350px] max-h-[400px] overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-4 text-sm text-gray-400">
                    <h3 class="font-bold text-white text-lg mb-3 border-b border-gray-700 pb-2 flex justify-between items-center">
                        Calendrier {currentYear}
                    </h3>
                    
                    <div class="grid grid-cols-12 gap-y-1 gap-x-2 text-xs font-mono text-center">
                        <div class="col-span-3 text-gray-500 font-semibold">Mois</div>
                        <div class="col-span-3 text-gray-500 font-semibold">Semaine</div>
                        <div class="col-span-6 text-gray-500 font-semibold">Début de Semaine (Lun)</div>
                        
                        {#each weeksInYear as week}
                            {#if week.week === 1 || (week.month !== weeksInYear[weeksInYear.indexOf(week) - 1]?.month && weeksInYear.indexOf(week) !== 0)}
                                <div class="col-span-12 h-px bg-gray-700/50 my-1"></div>
                            {/if}

                            <div class="col-span-3 text-center text-gray-300">
                                {new Date(currentYear, week.month - 1).toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()}
                            </div>
                            <div class="col-span-3">
                                <span class="block px-1 py-0.5 rounded {week.isCurrent ? 'bg-blue-600 text-white font-bold' : 'bg-gray-700 text-gray-200'}">
                                    {week.week}
                                </span>
                            </div>
                            <div class="col-span-6 text-left text-gray-400 pl-4">
                                {week.start}
                            </div>
                        {/each}
                    </div>

                    <div class="text-center mt-4 pt-3 border-t border-gray-700">
                        <span class="text-gray-500">Affichage annuel ISO 8601.</span>
                    </div>
                </div>
            {/if}
        </div>
        <div class="relative">
            <button on:click={(e) => toggleDropdown('notifications', e)} class="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 relative">
                <Bell class="w-5 h-5" />
                {#if notificationsCount > 0}
                    <span class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{notificationsCount}</span>
                {/if}
            </button>
            {#if activeDropdown === 'notifications'}
                <div class="absolute top-full right-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-4 text-sm text-gray-400">
                    Aucune nouvelle notification.
                </div>
            {/if}
        </div>

        <div class="relative">
            <div class="relative rounded-full {isAdmin ? 'p-[2px] bg-gradient-to-r from-blue-500 to-pink-500' : ''}">
                <button on:click={(e) => toggleDropdown('profile', e)} class="block rounded-full focus:outline-none">
                    <img 
                      src={userProfile?.avatar_url} 
                      alt="Avatar" 
                      class="w-10 h-10 rounded-full object-cover border-2 border-gray-700"
                    >
                </button>
            </div>
            
            {#if activeDropdown === 'profile'}
                <div class="absolute top-full right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                    <div class="p-2">
                        <div class="px-3 py-2 text-sm text-gray-400 border-b border-gray-700 mb-1">
                          {userProfile?.full_name || 'Utilisateur'}
                        </div>
                        <a href="/profil" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><UserCog class="w-4 h-4"/> Profil</a>
                        {#if isAdmin}
                            <hr class="border-gray-700 my-2">
                            <a href="/admin" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-yellow-400 hover:bg-gray-700"><ShieldCheck class="w-4 h-4"/> Admin</a>
                            <a href="/audit" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-yellow-400 hover:bg-gray-700"><ShieldCheck class="w-4 h-4"/> Audit Log</a>
                            {/if}
                        <button on:click={handleLogout} class="flex items-center gap-3 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-900/30 rounded mt-1">
                            <LogOut class="w-4 h-4"/> Déconnexion
                        </button>
                    </div>
                </div>
            {/if}
        </div>

      </div>
    </div>
  </div>
</nav>