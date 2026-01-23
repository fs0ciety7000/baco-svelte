<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { currentThemeId } from '$lib/stores/theme';
  import { slide, fly } from 'svelte/transition';
  import { isCommandOpen } from '$lib/stores/command';
  import { zenMode } from '$lib/stores/zen';
  import { presenceState } from '$lib/stores/presence.svelte.js';
  
  // Icônes
  import { 
    Shield, Accessibility, ChevronDown, Combine, Users, BookUser, 
    Bus, Car, Database, Train, Tag, Map, Folder, BookCopy, 
    ClipboardList, Search, CalendarDays, Bell, UserCog, 
    ShieldCheck, LogOut, Menu, X, ChevronLeft, ChevronRight, 
    Maximize, BarChart3 
  } from 'lucide-svelte';

  export let user;
  
  // --- ÉTATS ---
  let isMobileMenuOpen = false;
  let activeDropdown = null;
  let userProfile = null;
  let isAdmin = false;
  let notificationsCount = 0;
  let notifications = [];

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

  // --- LOGIQUE CALENDRIER (Simplifiée pour l'affichage) ---
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  let currentDate = new Date();
  $: displayedMonth = currentDate.getMonth();
  $: displayedYear = currentDate.getFullYear();
  
  // --- SUPABASE & NOTIFS ---
  $: if (user) loadUserProfile();

  async function loadUserProfile() {
    try {
      const { data } = await supabase.from('profiles').select('avatar_url, role, full_name').eq('id', user.id).single();
      if (data) {
        userProfile = data;
        isAdmin = data.role === 'admin';
      }
      // Chargement simplifié des notifs
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id_target', user.id).eq('is_read', false);
      notificationsCount = count || 0;
    } catch (err) { console.error(err); }
  }

  const toggleDropdown = (name, e) => {
    e?.stopPropagation();
    activeDropdown = activeDropdown === name ? null : name;
  };

  const closeDropdowns = () => activeDropdown = null;
  const handleLogout = async () => { await supabase.auth.signOut(); goto('/'); };
  const handleGlobalSearch = () => window.dispatchEvent(new CustomEvent('openGlobalSearch'));
</script>

<svelte:window on:click={closeDropdowns} />

<div class="sticky top-4 mx-4 z-50">
  <nav class="relative rounded-2xl transition-all duration-300 glass-panel z-20" style="border: 1px solid rgba(255,255,255,0.1)"> 
    <div class="px-4 md:px-6 py-2">
      <div class="flex justify-between items-center">
        
        <a href="/accueil" class="block transition-transform hover:scale-105 shrink-0">
          <img src="/logobaco.png" alt="Logo" class="h-10 md:h-12 w-auto object-contain">
        </a>
        
        <button on:click|stopPropagation={() => isMobileMenuOpen = !isMobileMenuOpen} class="lg:hidden {iconBtnClass}">
          {#if isMobileMenuOpen}<X class="w-6 h-6" />{:else}<Menu class="w-6 h-6" />{/if}
        </button>

        <div class="hidden lg:flex flex-row items-center gap-1 w-full justify-end xl:justify-between ml-6">
          
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
                        <a href="/carte-pn" class={dropdownLinkClass}><Map /> Carte</a>
                    </div>
                {/if}
            </div>

            <a href="/journal" class={getLinkClass('journal')}><BookCopy class="w-4 h-4" /><span>Journal</span></a>
            <a href="/planning" class={getLinkClass('planning')}><CalendarDays class="w-4 h-4" /><span>Planning</span></a>
            
            <div class="relative">
                <button on:click={(e) => toggleDropdown('commandes', e)} class="{glassTileBase} px-4 py-2 gap-2 text-sm font-semibold {activeDropdown === 'commandes' || ['/otto', '/generateTaxi', '/stats'].some(p => $page.url.pathname.includes(p)) ? activeTile : `${inactiveTile} ${neonHover}`}">
                    <ClipboardList class="w-4 h-4" /><span>Cmds</span><ChevronDown class="w-3 h-3 transition-transform {activeDropdown === 'commandes' ? 'rotate-180' : ''}" />
                </button>
                {#if activeDropdown === 'commandes'}
                    <div transition:fly={{ y: 10, duration: 200 }} class={dropdownBaseClass}>
                        <a href="/otto" class={dropdownLinkClass}><Bus /> C3 (Otto)</a>
                        <a href="/stats" class={dropdownLinkClass}><BarChart3 /> Statistiques</a>
                        <a href="/deplacements" class={dropdownLinkClass}><Car /> Déplacements PMR</a>
                    </div>
                {/if}
            </div>
          </div>

          <div class="flex items-center gap-2">
             
             <div class="relative">
                <button on:click={(e) => toggleDropdown('users', e)} class="{iconBtnClass} relative group">
                    <Users class="w-5 h-5" />
                    {#if presenceState.count > 0}
                        <span class="absolute top-2 right-2 flex h-2 w-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                    {/if}
                </button>
                </div>

            <button on:click={() => zenMode.set(true)} class={iconBtnClass}><Maximize class="w-5 h-5" /></button>
            <button on:click={handleGlobalSearch} class={iconBtnClass}><Search class="w-5 h-5" /></button>
            
            <div class="relative">
                <button on:click={(e) => toggleDropdown('notifications', e)} class="{iconBtnClass} relative">
                    <Bell class="w-5 h-5" />
                    {#if notificationsCount > 0}
                        <span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border border-[#0f1115]"></span>
                    {/if}
                </button>
                </div>

            <div class="relative pl-2 border-l border-white/10">
                <button on:click={(e) => toggleDropdown('profile', e)} class="w-9 h-9 rounded-full overflow-hidden border border-white/10">
                    {#if userProfile?.avatar_url}<img src={userProfile.avatar_url} alt="Avatar" class="w-full h-full object-cover">
                    {:else}<div class="w-full h-full bg-white/5 flex items-center justify-center text-xs">{userProfile?.full_name?.charAt(0) || '?'}</div>{/if}
                </button>
                {#if activeDropdown === 'profile'}
                    <div transition:fly={{ y: 10, duration: 200 }} class="{dropdownBaseClass} right-0 w-56">
                        <div class="p-3 border-b border-white/5">
                            <p class="text-xs font-bold text-white truncate">{userProfile?.full_name}</p>
                        </div>
                        <a href="/profil" class={dropdownLinkClass}><UserCog /> Profil</a>
                        <button on:click={handleLogout} class="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg"><LogOut class="w-4 h-4"/> Déconnexion</button>
                    </div>
                {/if}
            </div>
          </div>
        </div>
      </div>

      {#if isMobileMenuOpen}
          <div transition:slide class="lg:hidden absolute top-full left-0 w-full mt-2 bg-[#1a1d24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
             <div class="flex flex-col p-2 max-h-[80vh] overflow-y-auto">
               <a href="/operationnel" class="flex items-center gap-3 p-3 text-gray-300 hover:bg-white/5 rounded-lg"><Shield class="w-5 h-5"/> Opérationnel</a>
               <a href="/pmr" class="flex items-center gap-3 p-3 text-gray-300 hover:bg-white/5 rounded-lg"><Accessibility class="w-5 h-5"/> PMR</a>
               <a href="/journal" class="flex items-center gap-3 p-3 text-gray-300 hover:bg-white/5 rounded-lg"><BookCopy class="w-5 h-5"/> Journal</a>
               <a href="/planning" class="flex items-center gap-3 p-3 text-gray-300 hover:bg-white/5 rounded-lg"><CalendarDays class="w-5 h-5"/> Planning</a>
               <div class="h-px bg-white/10 my-2"></div>
               <a href="/repertoire" class="flex items-center gap-3 p-3 text-gray-300 hover:bg-white/5 rounded-lg"><BookUser class="w-5 h-5"/> Répertoire</a>
               <a href="/otto" class="flex items-center gap-3 p-3 text-gray-300 hover:bg-white/5 rounded-lg"><Bus class="w-5 h-5"/> C3 (Otto)</a>
               <div class="h-px bg-white/10 my-2"></div>
               <button on:click={handleLogout} class="flex items-center gap-3 p-3 text-red-400 hover:bg-red-500/10 rounded-lg"><LogOut class="w-5 h-5"/> Déconnexion</button>
             </div>
          </div>
      {/if}
    </div> 
  </nav>
</div>