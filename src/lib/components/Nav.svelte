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
    ShieldCheck, BarChart2, History, LogOut, Menu, X, ChevronLeft, ChevronRight, 
    Cake // <-- AJOUTER CAKE POUR LE THÈME DE NOËL
  } from 'lucide-svelte';
  export let user; // Reçu depuis +layout.svelte

  let isMobileMenuOpen = false;
  let activeDropdown = null;
  let userProfile = null;
  let isAdmin = false;
  let isModerator = false;
  let notificationsCount = 0;
  let notifications = [];
  
  // --- THÈME DE NOËL & PERSISTENCE (MODIFIÉ) ---
  let isChristmasTheme = false;
  // --- FIN THÈME DE NOËL ---

  // Nouvelle variable d'état pour la liste des notifications
  // --- NOUVEAUX ÉTATS POUR LE CALENDRIER ---
  // Date actuellement affichée dans le widget (initialisée au 1er du mois actuel)
  let currentDate = new Date();
  currentDate.setDate(1); 
  $: displayedMonth = currentDate.getMonth();
  $: displayedYear = currentDate.getFullYear();

  // Les jours du mois à afficher (générés dynamiquement)
  let days = [];
  // Mise à jour des jours si le mois change
  $: {
    days = generateCalendarDays(displayedYear, displayedMonth);
  }
  // ------------------------------------------

  // --- RÉACTIVITÉ CRUCIALE POUR L'AVATAR ---
  $: if (user) loadUserProfile();
  
  // MODIFIÉ: Charger le thème de Noël depuis localStorage
  onMount(() => {
    if (typeof localStorage !== 'undefined') {
        const savedState = localStorage.getItem('bacoChristmasTheme');
        // Initialiser à true si non défini, ou si 'true'
        isChristmasTheme = savedState !== 'false'; 
    }
    // Le calendrier se génère automatiquement via le bloc réactif ci-dessus
  });
  
  // NOUVEAU: Fonction pour basculer le thème de Noël
  function toggleChristmasTheme() {
    activeDropdown = null; // Fermer tout autre dropdown
    isChristmasTheme = !isChristmasTheme;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bacoChristmasTheme', isChristmasTheme.toString());
    }
  }

  async function loadUserProfile() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url, role, full_name, fonction')
        .eq('id', user.id)
        .single();
    if (data) {
        userProfile = data;
        isAdmin = data.role === 'admin';
        isModerator = data.role === 'moderator';
      }

      // 1. Récupérer les 5 dernières notifications (non lues en premier)
      const { data: notifs } = await supabase
        .from('notifications')
        .select('id, title, message, type, created_at, is_read') // Ajout de 'message' et 'type'
        .eq('user_id_target', user.id)
        .order('is_read', { ascending: true }) // Non lues en priorité
        .order('created_at', { ascending: false })
 
        .limit(5);

      notifications = notifs || [];
    // 2. Récupérer le compte des notifications non lues
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

  // --- FONCTIONS CALENDRIER (inchangées) ---
  
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
  
  function generateCalendarDays(year, month) {
    const calendarDays = [];
    const date = new Date(year, month);
    const today = new Date();
    
    // ISO standard: Monday=1, Sunday=7.
    // JS: Sunday=0, Monday=1...
    const getISOWeekday = (d) => (d.getDay() === 0 ? 7 : d.getDay());
    // Déterminer le jour de la semaine du premier jour du mois (Lundi = 1)
    let startDayOfWeek = getISOWeekday(date);
    // Reculer jusqu'au lundi de la première semaine affichée
    let day = new Date(date);
    day.setDate(day.getDate() - (startDayOfWeek - 1));

    // Boucle pour générer 5 à 6 semaines complètes
    let loops = 0;
    while (loops < 42 && (day.getMonth() !== month || loops < 7)) { // Toujours 6 lignes pour l'esthétique
      const dayData = {
        date: new Date(day),
        dayOfMonth: day.getDate(),
        isCurrentMonth: day.getMonth() === month,
        isToday: day.toDateString() === today.toDateString(),
        weekNumber: getWeekNumber(day),
        isStartOfWeek: getISOWeekday(day) === 1 // Lundi
      };
      calendarDays.push(dayData);
      
      day.setDate(day.getDate() + 1);
      loops++;
    }
    
    // S'assurer qu'on affiche 6 semaines complètes (42 jours) pour une grille uniforme
    while (calendarDays.length < 42) {
      const lastDate = calendarDays[calendarDays.length - 1].date;
      lastDate.setDate(lastDate.getDate() + 1);
      calendarDays.push({
        date: new Date(lastDate),
        dayOfMonth: lastDate.getDate(),
        isCurrentMonth: false,
        isToday: lastDate.toDateString() === today.toDateString(),
        weekNumber: getWeekNumber(lastDate),
        isStartOfWeek: getISOWeekday(lastDate) === 1
      });
    }

    return calendarDays;
  }
  
  function goToPreviousMonth() {
    currentDate = new Date(displayedYear, displayedMonth - 1, 1);
  }

  function goToNextMonth() {
    currentDate = new Date(displayedYear, displayedMonth + 1, 1);
  }

  function goToToday() {
    currentDate = new Date();
    currentDate.setDate(1);
  }
  
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  // ------------------------------------------
  
  // Fonction pour marquer les notifications affichées comme lues
  async function markNotificationsAsRead() {
    if (!user || notifications.length === 0 || notificationsCount === 0) return;
    // Récupérer les IDs des notifications non lues actuellement affichées
    const unreadIds = notifications
      .filter(n => !n.is_read)
      .map(n => n.id);
    if (unreadIds.length > 0) {
      try {
        // Mettre à jour la DB
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .in('id', unreadIds);
        // Mettre à jour l'état local
        notificationsCount = 0;
        notifications = notifications.map(n => ({ ...n, is_read: true }));
        
      } catch (err) {
        console.error("Erreur mise à jour notifications:", err);
      }
    }
  }

  function closeDropdowns() {
    activeDropdown = null;
  }

  function toggleDropdown(name, event) {
    event.stopPropagation();
    const isOpening = activeDropdown !== name;
    activeDropdown = activeDropdown === name ? null : name;

    if (name === 'notifications' && isOpening) {
      // Marquer les notifications comme lues peu après l'ouverture du panneau
      setTimeout(markNotificationsAsRead, 300);
    }
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

<nav class="bg-gray-900 text-white shadow-lg relative z-50 {isChristmasTheme ? 'christmas-nav' : ''}">
  
  {#if isChristmasTheme}
    <div class="garland">
      <div class="garland-lights"></div>
    </div>
    <div class="sleigh-reindeer"></div>
  {/if}
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
          <Shield class="w-4 
h-4" /><span>Opérationnel</span>
        </a>
        
        <div class="relative">
          <button on:click={(e) => toggleDropdown('pmr', e)} class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('pmr') ?
'bg-gray-700' : ''}">
            <Accessibility class="w-4 h-4" /><span>PMR</span>
            <ChevronDown class="w-4 h-4 ml-1 transform transition-transform {activeDropdown === 'pmr' ?
'rotate-180' : ''}" />
          </button>
          {#if activeDropdown === 'pmr'}
            <div class="absolute top-full left-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
              <a href="/pmr" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Combine class="w-4 h-4"/> Rampes</a>
              <a href="/clients-pmr" class="flex items-center gap-3 w-full px-3 py-2 text-sm 
text-gray-300 hover:bg-gray-700 hover:text-white"><Users class="w-4 h-4"/> Clients</a>
            </div>
          {/if}
        </div>

        <div class="relative">
          <button on:click={(e) => toggleDropdown('repertoire', e)} class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('bus') ||
isActive('taxi') ? 'bg-gray-700' : ''}">
            <BookUser class="w-4 h-4" /><span>Répertoire</span>
            <ChevronDown class="w-4 h-4 ml-1 transform transition-transform {activeDropdown === 'repertoire' ?
'rotate-180' : ''}" />
          </button>
          {#if activeDropdown === 'repertoire'}
            <div class="absolute top-full left-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
              <a href="/bus" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><Bus class="w-4 h-4"/> Bus</a>
              <a href="/taxi" class="flex items-center gap-3 w-full px-3 py-2 text-sm 
text-gray-300 hover:bg-gray-700 hover:text-white"><Car class="w-4 h-4"/> Taxi</a>
              <a href="/repertoire" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><BookUser class="w-4 h-4"/> Interne</a>
            </div>
          {/if}
        </div>

        <div class="relative">
            <button on:click={(e) => toggleDropdown('data', e)} class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
   
          <Database class="w-4 h-4" /><span>Data</span>
              <ChevronDown class="w-4 h-4 ml-1 transform transition-transform {activeDropdown === 'data' ?
'rotate-180' : ''}" />
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
        <a href="/planning" class="flex 
items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 {isActive('planning')}">
            <CalendarDays class="w-4 h-4" /><span>Planning/Congés</span> 
        </a>
     
    {#if isAdmin || isModerator}
           {/if}
      </div>

      <div class="flex flex-col md:flex-row items-start md:items-center gap-4 mt-4 md:mt-0 border-t border-gray-700 pt-4 md:border-none md:pt-0">
        
        <button on:click={handleGlobalSearch} class="px-3 py-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 hidden md:flex items-center gap-2">
            <Search class="w-5 h-5" />
            <span class="font-mono text-xs text-gray-400 
bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">Ctrl+K</span>
 
        </button>

        <ThemeToggle />
        
        <button 
            on:click={toggleChristmasTheme} 
            class="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 relative"
            title={isChristmasTheme ? 'Désactiver le thème de Noël' : 'Activer le thème de Noël'}
        >
            <Cake class="w-5 h-5 {isChristmasTheme ? 'text-red-500 fill-current' : 'text-gray-400'}" />
        </button>
        <div class="relative">
            <button on:click={(e) => toggleDropdown('calendar', e)} 
                    class="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 relative">
                <CalendarDays class="w-5 h-5" />
        
      
 </button>
            
            {#if activeDropdown === 'calendar'}
                <div class="absolute top-full right-0 mt-2 w-[340px] bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-3 text-sm text-gray-400">
                    
                   
  <div class="flex 
justify-between items-center mb-3">
                        <button on:click|stopPropagation={goToPreviousMonth} class="p-1 rounded-full hover:bg-gray-700 text-white">
                            <ChevronLeft class="w-5 h-5" />
                        </button>
           
   
            <span class="text-white font-bold text-lg cursor-pointer hover:text-blue-400" on:click={goToToday}>
                            {monthNames[displayedMonth]} {displayedYear}
                        </span>
                        <button on:click|stopPropagation={goToNextMonth} class="p-1 rounded-full 
hover:bg-gray-700 text-white">
 
                            <ChevronRight class="w-5 h-5" />
                        </button>
                    </div>

                    <div class="grid grid-cols-8 gap-1 
text-center">
  
                       <div class="text-xs font-semibold text-gray-500">S</div> 
                        
                        {#each dayNames as day}
                     
  
           <div class="text-xs font-semibold text-gray-500">{day}</div>
                        {/each}

                        {#each days as day}
                            {#if day.isStartOfWeek}
       
    
                          <div class="text-xs text-gray-500 pt-1 border-r border-gray-700/50">
                                    {day.weekNumber}
                              
   </div>
     
                         {/if}

                            <button
                                on:click|stopPropagation
        
          
                class="w-full h-7 rounded text-xs font-medium 
                                {day.isCurrentMonth ?
'' : 'text-gray-600 dark:text-gray-600'}
                                {day.isToday ?
'bg-red-200 text-red-600 font-bold ring-2 ring-red-400' : 'hover:bg-gray-700'}
                                {day.isCurrentMonth && !day.isToday ?
'text-gray-200' : ''}
                                "
                                title={day.date.toLocaleDateString('fr-FR')}
                            >
      
                            {day.dayOfMonth}
                            </button>
                        {/each}
                    
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

        <div class="absolute top-full right-0 mt-2 
w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-2 text-sm text-gray-400">
            {#if notifications.length === 0}
                <div class="px-2 py-4 text-center">
             
    Aucune notification.
                </div>
            {:else}
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    {#each notifications as notif (notif.id)}
    
                    <a 
                        href={notif.link_to || '/journal'} 
                        on:click={closeDropdowns} 
                        class="flex items-start gap-3 p-2 rounded-lg transition-colors duration-200 cursor-pointer
                                {notif.is_read ? 'hover:bg-gray-700' : 'bg-gray-700/50 hover:bg-gray-700 text-gray-200'}">
                       
          
                            {#if notif.type === 'procedure'}
                                <ClipboardPaste class="w-4 h-4 mt-1 flex-shrink-0 text-blue-400" />
      
                       {:else if notif.type === 'system'}
                                <ShieldCheck class="w-4 h-4 mt-1 flex-shrink-0 text-yellow-400" />
                    
                 {:else}
                                <Bell class="w-4 h-4 mt-1 flex-shrink-0" />
                            {/if}

   
                          <div class="flex-grow min-w-0">
                                <p class="font-semibold truncate" title={notif.title}>{notif.title ||
'Notification'}</p>
                                <p class="text-xs text-gray-400 line-clamp-2" title={notif.message}>{notif.message ||
'Détails non disponibles.'}</p>
                                <p class="text-xs mt-1 text-gray-500">
                                    {new Date(notif.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}

                                </p>
                            </div>
                    
 </a>
                    {/each}
                </div>
                <a href="/notifications" class="block text-center w-full px-3 py-2 text-xs font-medium text-blue-400 hover:bg-gray-700 rounded-lg mt-2 border-t border-gray-700/50 pt-2">
 
                Voir toutes les notifications
                </a>
            {/if}
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
                          {userProfile?.full_name ||
'Utilisateur'}
                        </div>
                        <a href="/profil" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"><UserCog class="w-4 h-4"/> Profil</a>
                        {#if isAdmin}
             
                          <hr class="border-gray-700 my-2">
                            <a href="/admin" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-yellow-400 hover:bg-gray-700"><ShieldCheck class="w-4 h-4"/> Admin</a>
                            <a href="/audit" class="flex 
items-center gap-3 w-full px-3 py-2 text-sm text-yellow-400 hover:bg-gray-700"><ShieldCheck class="w-4 h-4"/> Audit 
Log</a>
                            <a href="/darts" class="flex items-center gap-3 w-full px-3 py-2 text-sm text-yellow-400 hover:bg-gray-700"><ShieldCheck class="w-4 h-4"/> Fléchettes</a>

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