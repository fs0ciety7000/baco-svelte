<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { currentThemeId } from '$lib/stores/theme';
  import { slide, fly } from 'svelte/transition';
  import { isCommandOpen } from '$lib/stores/command';
  import { zenMode } from '$lib/stores/zen';

  // Icônes
  import { 
    Shield, Accessibility, ChevronDown, Combine, Users, BookUser, 
    Bus, Car, Database, Train, Tag, Map, Folder, BookCopy, 
    ClipboardPaste, Search, CalendarDays, Bell, UserCog, 
    ShieldCheck, LogOut, Menu, X, ChevronLeft, ChevronRight, 
    Cake, FileClock, Maximize,  
  } from 'lucide-svelte';

  export let user;
  
  // --- ÉTATS (Svelte 5 / Legacy reactive) ---
  let isMobileMenuOpen = false;
  let activeDropdown = null;
  let userProfile = null;
  let isAdmin = false;
  let isModerator = false;
  let notificationsCount = 0;
  let notifications = [];

  $: isChristmasTheme = $currentThemeId === 'christmas';

  // --- STYLES DYNAMIQUES ---
  const glassTileBase = "relative flex items-center justify-center rounded-xl border border-white/5 bg-white/5 backdrop-blur-md transition-all duration-300 group";

  $: activeTile = `
    bg-[rgba(var(--color-primary),0.1)] 
    border-[rgba(var(--color-primary),0.3)] 
    text-gray-100 
    shadow-[0_0_15px_rgba(var(--color-primary),0.25)]
    [&>svg]:text-[rgb(var(--color-primary))] 
    [&>svg]:drop-shadow-[0_0_8px_rgba(var(--color-primary),0.6)]
  `;

  $: neonHover = `
    hover:bg-white/10 hover:border-white/20 hover:-translate-y-0.5
    [&>svg]:transition-all [&>svg]:duration-300 
    hover:[&>svg]:text-[rgb(var(--color-primary))] 
    hover:[&>svg]:drop-shadow-[0_0_8px_rgba(var(--color-primary),0.8)]
  `;

  const inactiveTile = "text-gray-400 hover:text-white";

  $: getLinkClass = (path) => {
    const isActive = $page.url.pathname.includes(path);
    return `${glassTileBase} px-4 py-2 gap-2 text-sm font-semibold ${isActive ? activeTile : `${inactiveTile} ${neonHover}`}`;
  };

  $: iconBtnClass = `${glassTileBase} p-2.5 ${inactiveTile} ${neonHover}`;
  const dropdownBaseClass = "absolute top-full mt-2 bg-[#0f1115]/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl overflow-hidden p-1.5 z-50 flex flex-col gap-1 ring-1 ring-black/50 min-w-[200px]";

  $: dropdownLinkClass = `
    flex items-center gap-3 px-3 py-2 text-sm text-gray-400 rounded-lg 
    hover:bg-[rgba(var(--color-primary),0.15)] 
    hover:text-white 
    transition-all duration-200 
    [&>svg]:w-4 [&>svg]:h-4 
    hover:[&>svg]:text-[rgb(var(--color-primary))]
  `;

  // --- LOGIQUE CALENDRIER ---
  let currentDate = new Date();
  currentDate.setDate(1); 
  $: displayedMonth = currentDate.getMonth();
  $: displayedYear = currentDate.getFullYear();
  let days = [];
  $: days = generateCalendarDays(displayedYear, displayedMonth);

  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
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
        weekNum: getWeekNumber(day)
      });
      day.setDate(day.getDate() + 1);
    }
    return calendarDays;
  }
  
  const goToPreviousMonth = () => currentDate = new Date(displayedYear, displayedMonth - 1, 1);
  const goToNextMonth = () => currentDate = new Date(displayedYear, displayedMonth + 1, 1);
  const goToToday = () => { currentDate = new Date(); currentDate.setDate(1); };
  
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  // --- SUPABASE & NOTIFS ---
  $: if (user) loadUserProfile();

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

  async function markNotificationsAsRead() {
    if (!user || notificationsCount === 0) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
      notificationsCount = 0;
      notifications = notifications.map(n => ({ ...n, is_read: true }));
    }
  }

  const toggleDropdown = (name, e) => {
    e?.stopPropagation();
    const isOpening = activeDropdown !== name;
    activeDropdown = isOpening ? name : null;
    if (name === 'notifications' && isOpening) setTimeout(markNotificationsAsRead, 1000);
  };

  const closeDropdowns = () => activeDropdown = null;
  const toggleChristmasTheme = () => currentThemeId.set($currentThemeId === 'christmas' ? 'default' : 'christmas');
  const handleLogout = async () => { await supabase.auth.signOut(); goto('/'); };
  const handleGlobalSearch = () => window.dispatchEvent(new CustomEvent('openGlobalSearch'));
</script>

<svelte:window on:click={closeDropdowns} />

<div class="sticky top-4 mx-4 z-50">
  
  {#if isChristmasTheme}
    <div class="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        {#each Array(50) as _, i}
          <div class="snowflake" style="--delay: {Math.random() * 5}s; --left: {Math.random() * 100}%; --duration: {5 + Math.random() * 5}s; --size: {Math.random() * 5 + 2}px;"></div>
        {/each}
    </div>

    <div class="absolute top-0 left-0 w-full h-10 overflow-visible pointer-events-none z-0">
        <div class="glass-elf" style="left: 15%; --delay: 0s; --color-tint: rgba(50, 205, 50, 0.2);">
            <div class="elf-pompon"></div><div class="elf-hat"></div>
            <div class="elf-head"><div class="elf-eyes"></div></div>
        </div>
        <div class="glass-elf" style="right: 15%; --delay: 2.5s; --color-tint: rgba(220, 20, 60, 0.2);">
            <div class="elf-pompon"></div><div class="elf-hat"></div>
            <div class="elf-head"><div class="elf-eyes"></div></div>
        </div>
    </div>

    <div class="absolute top-[calc(100%-5px)] left-0 w-full flex justify-around px-10 pointer-events-none z-0">
        {#each [1, 2, 3, 4, 5, 6] as i}
          <div class="hanging-ornament" style="--delay: {i * 0.5}s; --height: {20 + (i * 5 % 30)}px">
              <div class="thread"></div><div class="glass-ball"><div class="shine"></div></div>
          </div>
        {/each}
    </div>
  {/if}

  <nav class="relative rounded-2xl transition-all duration-300 glass-panel {isChristmasTheme ? 'christmas-nav' : 'bg-[#0f1115]/80 backdrop-blur-xl'} z-20" style="border: 1px solid rgba(255,255,255,0.1)">
     <div class="px-6 py-2">
      <div class="flex justify-between items-center">
        
        <a href="/accueil" class="block transition-transform hover:scale-105">
          <img src="/logobaco.png" alt="Logo" class="h-12 w-auto object-contain">
        </a>
        
        <button on:click|stopPropagation={() => isMobileMenuOpen = !isMobileMenuOpen} class="md:hidden {iconBtnClass}">
          {#if isMobileMenuOpen}<X class="w-6 h-6" />{:else}<Menu class="w-6 h-6" />{/if}
        </button>

        <div class="hidden md:flex flex-row items-center gap-1 w-full justify-between ml-6">
          <div class="flex flex-row items-center gap-2"> 
              <a href="/operationnel" class={getLinkClass('operationnel')}><Shield class="w-4 h-4" /><span>Opérationnel</span></a>
              
              <div class="relative">
                  <button on:click={(e) => toggleDropdown('pmr', e)} class="{glassTileBase} px-4 py-2 gap-2 text-sm font-semibold {activeDropdown === 'pmr' || $page.url.pathname.includes('pmr') ? activeTile : `${inactiveTile} ${neonHover}`}">
                      <Accessibility class="w-4 h-4" /><span>PMR</span><ChevronDown class="w-3 h-3 transition-transform {activeDropdown === 'pmr' ? 'rotate-180' : ''}" />
                  </button>
                  {#if activeDropdown === 'pmr'}
                      <div transition:fly={{ y: 10, duration: 200 }} class={dropdownBaseClass}>
                          <a href="/pmr" class={dropdownLinkClass}><Combine /> Rampes</a>
                          <a href="/clients-pmr" class={dropdownLinkClass}><Users /> Clients</a>
                      </div>
                  {/if}
              </div>

              <div class="relative">
                  <button on:click={(e) => toggleDropdown('repertoire', e)} class="{glassTileBase} px-4 py-2 gap-2 text-sm font-semibold {activeDropdown === 'repertoire' || $page.url.pathname.includes('repertoire') ? activeTile : `${inactiveTile} ${neonHover}`}">
                      <BookUser class="w-4 h-4" /><span>Répertoire</span><ChevronDown class="w-3 h-3 transition-transform {activeDropdown === 'repertoire' ? 'rotate-180' : ''}" />
                  </button>
                  {#if activeDropdown === 'repertoire'}
                      <div transition:fly={{ y: 10, duration: 200 }} class={dropdownBaseClass}>
                          <a href="/bus" class={dropdownLinkClass}><Bus /> Bus</a>
                          <a href="/taxi" class={dropdownLinkClass}><Car /> Taxi</a>
                          <a href="/repertoire" class={dropdownLinkClass}><BookUser /> Interne</a>
                      </div>
                  {/if}
              </div>

              <div class="relative">
                  <button on:click={(e) => toggleDropdown('data', e)} class="{glassTileBase} px-4 py-2 gap-2 text-sm font-semibold {activeDropdown === 'data' || $page.url.pathname.includes('data') ? activeTile : `${inactiveTile} ${neonHover}`}">
                      <Database class="w-4 h-4" /><span>Data</span><ChevronDown class="w-3 h-3 transition-transform {activeDropdown === 'data' ? 'rotate-180' : ''}" />
                  </button>
                  {#if activeDropdown === 'data'}
                      <div transition:fly={{ y: 10, duration: 200 }} class={dropdownBaseClass}>
                          <a href="/lignes" class={dropdownLinkClass}><Train /> Lignes</a>
                          <a href="/ptcar" class={dropdownLinkClass}><Tag /> PtCar</a>
                          <a href="/ebp" class={dropdownLinkClass}><Database /> EBP</a>
                          <a href="/carte-pn" class={dropdownLinkClass}><Map /> Carte</a>
                      </div>
                  {/if}
              </div>

              <a href="/documents" class={getLinkClass('documents')}><Folder class="w-4 h-4" /><span>Docs</span></a>
              <a href="/journal" class={getLinkClass('journal')}><BookCopy class="w-4 h-4" /><span>Journal</span></a>
              <a href="/planning" class={getLinkClass('planning')}><CalendarDays class="w-4 h-4" /><span>Planning</span></a>
              <a href="/otto" class={getLinkClass('otto')}><Bus class="w-4 h-4" /><span>C3</span></a>
          </div>

          <div class="flex items-center gap-2">
              <button on:click={() => zenMode.set(true)} class={iconBtnClass} title="Zen"><Maximize class="w-5 h-5" /></button>
              <button on:click={handleGlobalSearch} class={iconBtnClass} title="Rechercher"><Search class="w-5 h-5" /></button>
              <button on:click={toggleChristmasTheme} class="{iconBtnClass} {isChristmasTheme ? 'text-red-400' : ''}"><Cake class="w-5 h-5" /></button>

              <div class="relative">
                  <button on:click={(e) => toggleDropdown('calendar', e)} class={iconBtnClass}><CalendarDays class="w-5 h-5" /></button>
                  {#if activeDropdown === 'calendar'}
                      <div transition:fly={{ y: 10, duration: 200 }} class="{dropdownBaseClass} right-0 w-[300px] p-4">
                          <div class="flex justify-between items-center mb-4">
                              <button on:click|stopPropagation={goToPreviousMonth}><ChevronLeft class="w-4 h-4"/></button>
                              <span class="text-sm font-bold text-white" on:click={goToToday}>{monthNames[displayedMonth]} {displayedYear}</span>
                              <button on:click|stopPropagation={goToNextMonth}><ChevronRight class="w-4 h-4"/></button>
                          </div>
                          <div class="grid grid-cols-8 gap-1 text-[10px] text-center">
                              <div class="text-blue-400 font-bold">Sem</div>
                              {#each dayNames as d} <div class="text-gray-500">{d}</div> {/each}
                              {#each days as day, i}
                                  {#if i % 7 === 0}<div class="text-blue-400/50">{day.weekNum}</div>{/if}
                                  <div class="p-1 rounded {day.isToday ? 'bg-blue-600 text-white' : day.isCurrentMonth ? 'text-gray-300' : 'text-gray-600'}">
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
                          <span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border border-[#0f1115]"></span>
                      {/if}
                  </button>
                  {#if activeDropdown === 'notifications'}
                      <div transition:fly={{ y: 10, duration: 200 }} class="{dropdownBaseClass} right-0 w-80 p-0">
                          <div class="p-3 border-b border-white/5 font-bold text-xs text-white">Notifications</div>
                          <div class="max-h-60 overflow-y-auto">
                              {#each notifications as n}
                                  <div class="p-3 border-b border-white/5 text-[11px] {n.is_read ? 'opacity-50' : 'bg-blue-500/5'}">
                                      <p class="font-bold text-gray-200">{n.title}</p>
                                      <p class="text-gray-400">{n.message}</p>
                                  </div>
                              {/each}
                          </div>
                          <a href="/notifications" class="block p-2 text-center text-[10px] text-blue-400 font-bold hover:bg-white/5">Tout voir</a>
                      </div>
                  {/if}
              </div>

              <div class="relative pl-2 border-l border-white/10">
                  <button on:click={(e) => toggleDropdown('profile', e)} class="w-9 h-9 rounded-full overflow-hidden border border-white/10 hover:border-[rgb(var(--color-primary))] transition-colors" style={activeDropdown === 'profile' ? `border-color: rgb(var(--color-primary)); box-shadow: 0 0 10px rgba(var(--color-primary), 0.5)` : ''}>
                      {#if userProfile?.avatar_url}<img src={userProfile.avatar_url} alt="Avatar" class="w-full h-full object-cover">
                      {:else}<div class="w-full h-full bg-white/5 flex items-center justify-center text-xs">{userProfile?.full_name?.charAt(0) || '?'}</div>{/if}
                  </button>
                  {#if activeDropdown === 'profile'}
                      <div transition:fly={{ y: 10, duration: 200 }} class="{dropdownBaseClass} right-0 w-56">
                          <div class="p-3 border-b border-white/5">
                              <p class="text-xs font-bold text-white truncate">{userProfile?.full_name}</p>
                              <span class="text-[9px] uppercase tracking-widest text-blue-400 font-bold">{userProfile?.role}</span>
                          </div>
                          <a href="/profil" class={dropdownLinkClass}><UserCog /> Mon Profil</a>
                          {#if isAdmin}
                              <a href="/admin" class={dropdownLinkClass}><ShieldCheck /> Admin</a>
                              <a href="/audit" class={dropdownLinkClass}><FileClock /> Logs</a>
                          {/if}
                          <button on:click={handleLogout} class="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><LogOut class="w-4 h-4"/> Déconnexion</button>
                      </div>
                  {/if}
              </div>

          </div>
        </div>
      </div>

      {#if isMobileMenuOpen}
          <div transition:slide class="md:hidden mt-4 flex flex-col gap-2 border-t border-white/5 pt-4 pb-2">
               <a href="/operationnel" class="flex items-center gap-3 p-3 text-gray-400"><Shield class="w-4 h-4"/> Opérationnel</a>
               <a href="/pmr" class="flex items-center gap-3 p-3 text-gray-400"><Accessibility class="w-4 h-4"/> PMR</a>
               <a href="/journal" class="flex items-center gap-3 p-3 text-gray-400"><BookCopy class="w-4 h-4"/> Journal</a>
               <button on:click={handleLogout} class="flex items-center gap-3 p-3 text-red-400"><LogOut class="w-4 h-4"/> Déconnexion</button>
          </div>
      {/if}
    </div>
  </nav>
</div>

<style>
    /* SNOW */
    :global(.snowflake) { position: absolute; top: -10px; background: white; border-radius: 50%; opacity: 0.5; animation: fall linear infinite; }
    @keyframes fall { 
        0% { transform: translateY(-10vh) translateX(0); opacity: 0; } 
        20% { opacity: 0.8; }
        100% { transform: translateY(110vh) translateX(20px); opacity: 0; } 
    }

    /* ELVES */
    .glass-elf { position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; z-index: -1; animation: peek 8s ease-in-out infinite; animation-delay: var(--delay); opacity: 0; }
    @keyframes peek {
        0%, 100% { transform: translateY(10px); opacity: 0; }
        10%, 25% { transform: translateY(-35px); opacity: 1; }
        35% { transform: translateY(10px); opacity: 0; }
    }
    .elf-hat { width: 30px; height: 25px; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); background: var(--color-tint); backdrop-filter: blur(4px); }
    .elf-head { width: 24px; height: 24px; background: rgba(255,255,255,0.1); border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); }
    .elf-eyes { display: flex; gap: 4px; margin-top: 8px; justify-content: center; }
    .elf-eyes::before, .elf-eyes::after { content: ''; width: 3px; height: 3px; background: white; border-radius: 50%; }

    /* ORNEMENTS */
    .hanging-ornament { position: relative; display: flex; flex-direction: column; align-items: center; animation: swing 4s ease-in-out infinite alternate; transform-origin: top; }
    .thread { width: 1px; height: var(--height); background: rgba(255,255,255,0.2); }
    .glass-ball { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); backdrop-filter: blur(2px); }
    @keyframes swing { from { transform: rotate(-6deg); } to { transform: rotate(6deg); } }

    .christmas-nav { border-color: rgba(220, 38, 38, 0.3) !important; box-shadow: 0 0 20px rgba(220, 38, 38, 0.1); }
</style>