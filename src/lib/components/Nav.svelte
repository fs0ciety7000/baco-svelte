<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { currentThemeId } from '$lib/stores/theme';
  import { slide, fly } from 'svelte/transition';
import { zenMode } from '$lib/stores/zen';
  // Icônes
  import { 
    Shield, Accessibility, ChevronDown, Combine, Users, BookUser, 
    Bus, Car, Database, Train, Tag, Map, Folder, BookCopy, 
    ClipboardPaste, Search, CalendarDays, Bell, UserCog, 
    ShieldCheck, LogOut, Menu, X, ChevronLeft, ChevronRight, 
    Cake, FileClock, Maximize 
  } from 'lucide-svelte';

  export let user;
  
  // --- VARIABLES ---
  let isMobileMenuOpen = false;
  let activeDropdown = null;
  let userProfile = null;
  let isAdmin = false;
  let isModerator = false;
  let notificationsCount = 0;
  let notifications = [];
$: isChristmasTheme = $currentThemeId === 'christmas';




  // --- STYLES "GLASS & NÉON" ---
  const glassTileBase = "relative flex items-center justify-center rounded-xl border border-white/5 bg-white/5 backdrop-blur-md transition-all duration-300 group";

const activeTile = `
    bg-[rgba(var(--color-primary),0.1)] 
    border-[rgba(var(--color-primary),0.3)] 
    text-gray-100 
    shadow-[0_0_15px_rgba(var(--color-primary),0.25)]
    [&>svg]:text-[rgb(var(--color-primary))] 
    [&>svg]:drop-shadow-[0_0_8px_rgba(var(--color-primary),0.6)]
  `;

  const neonHover = `
    hover:bg-white/10 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_-5px_rgba(0,0,0,0.5)]
    [&>svg]:transition-all [&>svg]:duration-300 
    hover:[&>svg]:text-[rgb(var(--color-glow))] 
    hover:[&>svg]:drop-shadow-[0_0_8px_rgba(var(--color-primary),0.8)]
  `;

  const inactiveTile = "text-gray-400 hover:text-white";

  $: getLinkClass = (path) => {
    const isActive = $page.url.pathname.includes(path);
    return `${glassTileBase} px-4 py-2 gap-2 text-sm font-semibold ${isActive ? activeTile : `${inactiveTile} ${neonHover}`}`;
  };

  const iconBtnClass = `${glassTileBase} p-2.5 ${inactiveTile} ${neonHover}`;
  const dropdownBaseClass = "absolute top-full mt-2 bg-[#0f1115] border border-white/10 shadow-2xl rounded-xl overflow-hidden p-1.5 z-50 flex flex-col gap-1 ring-1 ring-black/50 min-w-[200px]";
  const dropdownLinkClass = "flex items-center gap-3 px-3 py-2 text-sm text-gray-400 rounded-lg hover:bg-blue-500/20 hover:text-white transition-all duration-200 [&>svg]:w-4 [&>svg]:h-4";


  // --- CALENDRIER LOGIC ---
  let currentDate = new Date();
  currentDate.setDate(1); 
  $: displayedMonth = currentDate.getMonth();
  $: displayedYear = currentDate.getFullYear();
  let days = [];
  $: days = generateCalendarDays(displayedYear, displayedMonth);

  // --- LOGIC ---
  $: if (user) loadUserProfile();

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
        const savedState = localStorage.getItem('bacoChristmasTheme');
        isChristmasTheme = savedState !== 'false'; 
    }
  });

  function toggleChristmasTheme() {
      if ($currentThemeId === 'christmas') currentThemeId.set('default');
      else currentThemeId.set('christmas');
  }

  async function loadUserProfile() {
    try {
      const { data } = await supabase.from('profiles').select('avatar_url, role, full_name').eq('id', user.id).single();
      if (data) {
        userProfile = data;
        isAdmin = data.role === 'admin';
        isModerator = data.role === 'moderator';
      }
      const { data: notifs } = await supabase.from('notifications').select('*').eq('user_id_target', user.id).order('is_read', { ascending: true }).order('created_at', { ascending: false }).limit(5);
      notifications = notifs || [];
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id_target', user.id).eq('is_read', false);
      notificationsCount = count || 0;
    } catch (err) { console.error(err); }
  }
function getWeekNumber(date) {
    // On copie la date pour ne pas modifier l'originale
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // On ajuste au jeudi le plus proche
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // On récupère le 1er janvier de cette année
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calcul du numéro de semaine
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
  
  function generateCalendarDays(year, month) {
    const calendarDays = [];
    const date = new Date(year, month, 1);
    const today = new Date();
    const getISOWeekday = (d) => (d.getDay() === 0 ? 7 : d.getDay());
    let startDayOfWeek = getISOWeekday(date);
    let day = new Date(date);
    day.setDate(day.getDate() - (startDayOfWeek - 1));
    for (let i = 0; i < 42; i++) {
      calendarDays.push({
        date: new Date(day),
        dayOfMonth: day.getDate(),
        isCurrentMonth: day.getMonth() === month,
        isToday: day.toDateString() === today.toDateString(),
        weekNum: getWeekNumber(day),
        isStartOfWeek: getISOWeekday(day) === 1
      });
      day.setDate(day.getDate() + 1);
    }
    return calendarDays;
  }
  
  function goToPreviousMonth() { currentDate = new Date(displayedYear, displayedMonth - 1, 1); }
  function goToNextMonth() { currentDate = new Date(displayedYear, displayedMonth + 1, 1); }
  function goToToday() { currentDate = new Date(); currentDate.setDate(1); }
  
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  async function markNotificationsAsRead() {
    if (!user || notifications.length === 0 || notificationsCount === 0) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
      notificationsCount = 0;
      notifications = notifications.map(n => ({ ...n, is_read: true }));
    }
  }

  function closeDropdowns() { activeDropdown = null; }

  function toggleDropdown(name, event) {
    event.stopPropagation();
    const isOpening = activeDropdown !== name;
    activeDropdown = activeDropdown === name ? null : name;
    if (name === 'notifications' && isOpening) {
      setTimeout(markNotificationsAsRead, 1000);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    goto('/');
  }

  function handleGlobalSearch() { window.dispatchEvent(new CustomEvent('openGlobalSearch')); }
</script>

<svelte:window on:click={closeDropdowns} />

<div class="sticky top-4 mx-4 z-50">

  {#if isChristmasTheme}
    <div class="fixed inset-0 pointer-events-none z-[-1] overflow-hidden h-screen w-screen left-0 top-0">
        {#each Array(50) as _, i}
        <div class="snowflake" style="--delay: {Math.random() * 5}s; --left: {Math.random() * 100}%; --duration: {5 + Math.random() * 5}s; --size: {Math.random() * 5 + 2}px;"></div>
        {/each}
    </div>

    <div class="absolute top-0 left-0 w-full h-10 overflow-visible pointer-events-none z-0">
        <div class="glass-elf" style="left: 15%; --delay: 0s; --color-tint: rgba(50, 205, 50, 0.2);">
            <div class="elf-pompon"></div>
            <div class="elf-hat"></div>
            <div class="elf-head">
                <div class="elf-eyes"></div>
            </div>
        </div>

        <div class="glass-elf" style="right: 15%; --delay: 2.5s; --color-tint: rgba(220, 20, 60, 0.2);">
            <div class="elf-pompon"></div>
            <div class="elf-hat"></div>
            <div class="elf-head">
                <div class="elf-eyes"></div>
            </div>
        </div>
    </div>

    <div class="glass-gift pointer-events-none" style="left: 50px;">
        <div class="gift-box">
            <div class="gift-ribbon-v"></div>
            <div class="gift-ribbon-h"></div>
        </div>
    </div>

    <div class="garland pointer-events-none"><div class="garland-lights"></div></div>
    
    <div class="absolute top-[calc(100%-5px)] left-0 w-full flex justify-around items-start px-10 pointer-events-none z-0">
        {#each [1, 2, 3, 4, 5, 6] as i}
        <div class="hanging-ornament" style="--delay: {i * 0.5}s; --height: {20 + (i * 5 % 30)}px">
            <div class="thread"></div>
            <div class="glass-ball">
                <div class="shine"></div>
            </div>
        </div>
        {/each}
    </div>
  {/if}

<nav class="relative rounded-2xl transition-all duration-300 glass-panel 
     {isChristmasTheme ? 'christmas-nav' : 'bg-[#0f1115]/80 backdrop-blur-xl'} z-20"
     style="border-color: var(--glass-border)">
     
     <div class="px-6 py-2">
      
      <div class="flex justify-between items-center">
        
        <a href="/accueil" class="block transition-transform duration-300 hover:scale-105 drop-shadow-md hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
          <img src="/logobaco.png" alt="Logo BACO" class="h-14 w-auto object-contain">
        </a>
        
        <button 
          on:click|stopPropagation={() => isMobileMenuOpen = !isMobileMenuOpen}
          class="md:hidden {iconBtnClass}"
        >
          {#if isMobileMenuOpen}<X class="w-6 h-6" />{:else}<Menu class="w-6 h-6" />{/if}
        </button>

        <div class="hidden md:flex flex-row items-center gap-1 w-full justify-between ml-6">
          <div class="flex flex-row items-center gap-2"> 
              <a href="/operationnel" class={getLinkClass('operationnel')}>
                  <Shield class="w-4 h-4" /><span>Opérationnel</span>
              </a>
              
              <div class="relative">
                  <button on:click={(e) => toggleDropdown('pmr', e)} class="{glassTileBase} px-4 py-2 gap-2 text-sm font-semibold {activeDropdown === 'pmr' || $page.url.pathname.includes('pmr') ? activeTile : `${inactiveTile} ${neonHover}`}">
                      <Accessibility class="w-4 h-4" /><span>PMR</span>
                      <ChevronDown class="w-3 h-3 ml-1 transition-transform {activeDropdown === 'pmr' ? 'rotate-180' : ''}" />
                  </button>
                  {#if activeDropdown === 'pmr'}
                      <div transition:fly={{ y: 10, duration: 200 }} class={dropdownBaseClass}>
                          <a href="/pmr" class={dropdownLinkClass}><Combine class="w-4 h-4 text-[rgb(var(--color-primary))]"/> Rampes</a>
                          <a href="/clients-pmr" class={dropdownLinkClass}><Users class="w-4 h-4 text-pink-400"/> Clients</a>
                      </div>
                  {/if}
              </div>

              <div class="relative">
                  <button on:click={(e) => toggleDropdown('repertoire', e)} class="{glassTileBase} px-4 py-2 gap-2 text-sm font-semibold {activeDropdown === 'repertoire' || $page.url.pathname.includes('repertoire') ? activeTile : `${inactiveTile} ${neonHover}`}">
                      <BookUser class="w-4 h-4" /><span>Répertoire</span>
                      <ChevronDown class="w-3 h-3 ml-1 transition-transform {activeDropdown === 'repertoire' ? 'rotate-180' : ''}" />
                  </button>
                  {#if activeDropdown === 'repertoire'}
                      <div transition:fly={{ y: 10, duration: 200 }} class={dropdownBaseClass}>
                          <a href="/bus" class={dropdownLinkClass}><Bus class="w-4 h-4 text-yellow-400"/> Bus</a>
                          <a href="/taxi" class={dropdownLinkClass}><Car class="w-4 h-4 text-orange-400"/> Taxi</a>
                          <a href="/repertoire" class={dropdownLinkClass}><BookUser class="w-4 h-4 text-green-400"/> Interne</a>
                      </div>
                  {/if}
              </div>

              <div class="relative">
                  <button on:click={(e) => toggleDropdown('data', e)} class="{glassTileBase} px-4 py-2 gap-2 text-sm font-semibold {activeDropdown === 'data' || $page.url.pathname.includes('data') ? activeTile : `${inactiveTile} ${neonHover}`}">
                      <Database class="w-4 h-4" /><span>Data</span>
                      <ChevronDown class="w-3 h-3 ml-1 transition-transform {activeDropdown === 'data' ? 'rotate-180' : ''}" />
                  </button>
                  {#if activeDropdown === 'data'}
                      <div transition:fly={{ y: 10, duration: 200 }} class={dropdownBaseClass}>
                          <a href="/lignes" class={dropdownLinkClass}><Train class="w-4 h-4 text-cyan-400"/> Lignes</a>
                          <a href="/ptcar" class={dropdownLinkClass}><Tag class="w-4 h-4 text-purple-400"/> PtCar</a>
                          <a href="/ebp" class={dropdownLinkClass}><Database class="w-4 h-4 text-gray-400"/> EBP</a>
                          <a href="/carte-pn" class={dropdownLinkClass}><Map class="w-4 h-4 text-green-400"/> Carte</a>
                      </div>
                  {/if}
              </div>

              <a href="/documents" class={getLinkClass('documents')}>
                  <Folder class="w-4 h-4" /><span>Docs</span>
              </a>

              <a href="/journal" class={getLinkClass('journal')}>
                  <BookCopy class="w-4 h-4" /><span>Journal</span>
              </a>
              
              <a href="/planning" class={getLinkClass('planning')}>
                  <CalendarDays class="w-4 h-4" /><span>Planning</span> 
              </a>
          </div>

          <div class="flex items-center gap-2">
            <button 
        on:click={() => zenMode.set(true)} 
        class="{iconBtnClass} text-gray-400 hover:text-blue-400" 
        title="Mode Zen (Plein écran)"
    >
        <Maximize class="w-5 h-5" />
    </button>
              <button on:click={handleGlobalSearch} class="{iconBtnClass} flex items-center gap-2 group" title="Rechercher">
                  <Search class="w-5 h-5" />
              </button>

              <button on:click={toggleChristmasTheme} class="{iconBtnClass} {isChristmasTheme ? 'text-red-400 hover:text-red-300 !border-red-500/20 !bg-red-500/10' : ''}">
                  <Cake class="w-5 h-5 {isChristmasTheme ? 'drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]' : ''}" />
              </button>

              <div class="relative">
                  <button on:click={(e) => toggleDropdown('calendar', e)} class={iconBtnClass}>
                       <CalendarDays class="w-5 h-5" />
                  </button>
                  {#if activeDropdown === 'calendar'}
                      <div transition:fly={{ y: 10, duration: 200 }} class="{dropdownBaseClass} right-0 w-[280px] p-4">
                          <div class="flex justify-between items-center mb-4">
                              <button on:click|stopPropagation={goToPreviousMonth} class="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"><ChevronLeft class="w-4 h-4" /></button>
                              <span class="text-white font-bold text-sm cursor-pointer hover:text-blue-400 transition-colors" on:click={goToToday}>{monthNames[displayedMonth]} {displayedYear}</span>
                              <button on:click|stopPropagation={goToNextMonth} class="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"><ChevronRight class="w-4 h-4" /></button>
                          </div>
                          <div class="grid grid-cols-7 gap-1 text-center mb-2">
                              {#each dayNames as day}<div class="text-[10px] font-bold text-gray-500 uppercase">{day}</div>{/each}
                          </div>
                         <div class="grid grid-cols-7 gap-1 text-center">
    {#each days as day}
        <div class="w-full aspect-square rounded-md flex items-center justify-center text-xs font-medium relative
            {day.isCurrentMonth ? 'text-gray-300' : 'text-gray-600'} 
            {day.isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-white/10 cursor-pointer'}">

            {#if day.isStartOfWeek}
                <span class="absolute top-0.5 left-0.5 text-[8px] font-mono opacity-50 {day.isToday ? 'text-white' : 'text-blue-400'}">
                    S{day.weekNum}
                </span>
            {/if}

            {day.dayOfMonth}
        </div>
    {/each}
</div>
                      </div>
                  {/if}
              </div>

              <div class="relative">
                  <button on:click={(e) => toggleDropdown('notifications', e)} class="{iconBtnClass} relative">
                      <Bell class="w-5 h-5" />
                      {#if notificationsCount > 0}
                          <span class="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-[#0f1115]"></span>
                          </span>
                      {/if}
                  </button>
                  {#if activeDropdown === 'notifications'}
                      <div transition:fly={{ y: 10, duration: 200 }} class="{dropdownBaseClass} right-0 w-80 p-0">
                          <div class="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                              <h3 class="text-sm font-bold text-white">Notifications</h3>
                          </div>
                          {#if notifications.length === 0}
                              <div class="p-6 text-center text-sm text-gray-500">Aucune nouvelle notification.</div>
                          {:else}
                              <div class="max-h-64 overflow-y-auto custom-scrollbar">
                                  {#each notifications as notif (notif.id)}
                                  <a href={notif.link_to || '/journal'} on:click={closeDropdowns} class="block p-4 border-b border-white/5 transition-colors {notif.is_read ? 'text-gray-400 hover:bg-white/[0.02]' : 'bg-blue-500/5 hover:bg-blue-500/10'}">
                                      <div class="flex gap-3">
                                          {#if notif.type === 'procedure'}<ClipboardPaste class="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                                          {:else if notif.type === 'system'}<ShieldCheck class="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                                          {:else}<Bell class="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />{/if}
                                          <div class="min-w-0">
                                              <p class="font-bold text-xs text-gray-200 truncate">{notif.title || 'Notification'}</p>
                                              <p class="text-xs text-gray-400 line-clamp-2 mt-0.5">{notif.message}</p>
                                              <p class="text-[10px] text-gray-600 mt-1">{new Date(notif.created_at).toLocaleDateString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}</p>
                                          </div>
                                      </div>
                                  </a>
                                  {/each}
                              </div>
                              <a href="/notifications" class="block text-center py-2.5 text-xs font-bold text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors">Voir tout l'historique</a>
                          {/if}
                      </div>
                  {/if}
              </div>

              <div class="relative pl-2 ml-2 border-l border-white/10">
                  <button on:click={(e) => toggleDropdown('profile', e)} class="block rounded-full focus:outline-none ring-2 ring-transparent hover:ring-blue-500/50 transition-all">
                      {#if userProfile?.avatar_url}
                          <img src={userProfile.avatar_url} alt="Avatar" class="w-9 h-9 rounded-full object-cover border border-white/10 shadow-sm hover:shadow-md transition-shadow">
                      {:else}
                          <div class="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white text-xs font-bold">?</div>
                      {/if}
                  </button>
                  {#if activeDropdown === 'profile'}
                      <div transition:fly={{ y: 10, duration: 200 }} class="{dropdownBaseClass} right-0 w-60">
                          <div class="px-4 py-3 border-b border-white/5 bg-white/[0.02] mb-1">
                              <p class="text-sm font-bold text-white truncate">{userProfile?.full_name || 'Utilisateur'}</p>
                             <div class="mt-1.5 flex">
                                  <span class="
                                      relative inline-flex items-center justify-center px-2.5 py-0.5 rounded-full
                                      text-[10px] font-bold tracking-widest uppercase
                                      bg-gradient-to-br from-yellow-500/10 to-amber-600/20 
                                      border border-yellow-500/30 
                                      text-yellow-100 
                                      shadow-[0_0_10px_rgba(234,179,8,0.15)] 
                                      backdrop-blur-md
                                  ">
                                      {userProfile?.role || 'Membre'}
                                  </span>
                              </div>
                          </div>
                          
                          <a href="/profil" class={dropdownLinkClass}><UserCog class="w-4 h-4 text-blue-400"/> Mon Profil</a>
                          
                          {#if isAdmin}
                              <div class="my-1 border-t border-white/5 mx-2"></div>
                              <p class="px-3 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Administration</p>
                              <a href="/admin" class={dropdownLinkClass}><ShieldCheck class="w-4 h-4 text-yellow-400"/> Gestion Users</a>
                              <a href="/audit" class={dropdownLinkClass}><FileClock class="w-4 h-4 text-purple-400"/> Audit Logs</a> 
                          {/if}
                          
                          <div class="my-1 border-t border-white/5 mx-2"></div>
                          <button on:click={handleLogout} class="flex items-center gap-3 w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg transition-colors">
                              <LogOut class="w-4 h-4"/> Déconnexion
                          </button>
                      </div>
                  {/if}
              </div>

          </div>
        </div>

      </div>

      {#if isMobileMenuOpen}
          <div transition:slide class="md:hidden mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
               <a href="/operationnel" class="flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:bg-blue-500/20 hover:text-white transition-colors"><Shield class="w-4 h-4"/> Opérationnel</a>
               <a href="/pmr" class="flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:bg-blue-500/20 hover:text-white transition-colors"><Accessibility class="w-4 h-4"/> PMR</a>
               <a href="/journal" class="flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:bg-blue-500/20 hover:text-white transition-colors"><BookCopy class="w-4 h-4"/> Journal</a>
               <a href="/planning" class="flex items-center gap-3 p-3 rounded-lg text-gray-400 hover:bg-blue-500/20 hover:text-white transition-colors"><CalendarDays class="w-4 h-4"/> Planning</a>
               <button on:click={handleLogout} class="flex items-center gap-3 p-3 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"><LogOut class="w-4 h-4"/> Déconnexion</button>
          </div>
      {/if}

    </div>
  </nav>
</div> <style>
    /* --- NEIGE (SNOW) --- */
    :global(.snowflake) {
        position: absolute;
        top: -10px;
        left: var(--left);
        width: var(--size);
        height: var(--size);
        background: rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        filter: blur(1px);
        animation: fall var(--duration) linear infinite;
        animation-delay: var(--delay);
    }

    @keyframes fall {
        0% { transform: translateY(-10vh) translateX(0px); opacity: 0; }
        20% { opacity: 0.8; }
        100% { transform: translateY(110vh) translateX(20px); opacity: 0; }
    }

    /* --- ORNEMENTS SUSPENDUS --- */
    .hanging-ornament {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform-origin: top center;
        animation: swing 4s ease-in-out infinite alternate;
        animation-delay: var(--delay);
        margin-top: -1px; 
    }

    .thread {
        width: 1px;
        height: var(--height);
        background: linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.4));
    }

    .glass-ball {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        box-shadow: 
            0 4px 10px rgba(0, 0, 0, 0.2), 
            inset 0 0 8px rgba(255, 255, 255, 0.1);
        position: relative;
    }

    .glass-ball .shine {
        position: absolute;
        top: 6px;
        left: 8px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%);
    }

    @keyframes swing {
        from { transform: rotate(-5deg); }
        to { transform: rotate(5deg); }
    }

    
   /* --- LUTINS DE VERRE (GLASS ELVES) - CORRIGÉ --- */
    .glass-elf {
        position: absolute;
        /* CORRECTION : On part du bord haut exact de la barre */
        top: 0; 
        display: flex;
        flex-direction: column;
        align-items: center;
        /* Z-index négatif pour être DERRIÈRE la barre */
        z-index: -1; 
        animation: peek 8s ease-in-out infinite;
        animation-delay: var(--delay);
        filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
    }

    /* ... gardez .elf-hat, .elf-pompon, etc ... */

    @keyframes peek {
        /* Étape 1 : Caché derrière la barre (décalé vers le bas) */
        0%, 100% { transform: translateY(10px) rotate(0deg); opacity: 0; }
        
        /* Étape 2 : Sort sa tête (décalé vers le haut, mais pas trop pour rester dans l'écran) */
        /* -35px suffit pour montrer la tête sans sortir de l'écran */
        10% { transform: translateY(-35px) rotate(-5deg); opacity: 1; }    
        
        /* Étape 3 : Regarde autour */
        20% { transform: translateY(-35px) rotate(5deg); opacity: 1; }     
        
        /* Étape 4 : Rentre */
        30% { transform: translateY(10px); opacity: 0; }                   
    }

    .elf-hat {
        width: 40px;
        height: 35px;
        clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        background: linear-gradient(180deg, var(--color-tint), rgba(255,255,255,0.05));
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        position: relative;
        z-index: 2;
    }

    .elf-pompon {
        width: 8px;
        height: 8px;
        background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.5) 100%);
        border-radius: 50%;
        margin-bottom: -2px; 
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
        z-index: 3;
        animation: bounce 2s infinite ease-in-out;
    }

    .elf-head {
        width: 30px;
        height: 30px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 50%;
        margin-top: -5px; 
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 4px;
    }

    .elf-eyes::before, .elf-eyes::after {
        content: '';
        display: inline-block;
        width: 4px;
        height: 4px;
        background-color: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
        margin: 0 2px;
    }

 

    @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
    }

    /* --- CADEAU FLOTTANT --- */
    .glass-gift {
        position: absolute;
        top: 100%; /* Juste en dessous de la barre */
        width: 24px;
        height: 24px;
        animation: float 6s ease-in-out infinite;
        margin-top: 10px;
        z-index: 10;
    }

    .gift-box {
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(4px);
        border-radius: 4px;
        position: relative;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        transform: rotate(15deg);
    }

    .gift-ribbon-v, .gift-ribbon-h {
        position: absolute;
        background: rgba(59, 130, 246, 0.5);
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
    }

    .gift-ribbon-v { width: 4px; height: 100%; left: 50%; transform: translateX(-50%); }
    .gift-ribbon-h { height: 4px; width: 100%; top: 50%; transform: translateY(-50%); }

    @keyframes float {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(10px) rotate(5deg); }
    }
</style>