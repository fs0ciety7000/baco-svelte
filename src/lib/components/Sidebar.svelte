<script>
    import { page } from '$app/stores';
    import { 
        Home, Bus, Car, Users, Calendar, Map, FileText, 
        Settings, LogOut, Menu, X, Shield, BookOpen, BarChart3, Radio
    } from 'lucide-svelte';
    import { slide } from 'svelte/transition';
    import { supabase } from '$lib/supabase';

    // State
    let isOpen = $state(false); // Mobile toggle
    let userRole = $state('user');

    // Récupération du rôle pour afficher/masquer le lien Admin
    $effect(() => {
        async function getRole() {
            const { data: { user } } = await supabase.auth.getUser();
            if(user) {
                const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                userRole = data?.role || 'user';
            }
        }
        getRole();
    });

    const menuItems = [
        { href: '/accueil', label: 'Accueil', icon: Home },
        { title: 'Transport' },
        { href: '/otto', label: 'Otto (Bus)', icon: Bus },
        { href: '/taxi', label: 'Taxis', icon: Car },
        { href: '/clients-pmr', label: 'Clients PMR', icon: Users },
        { title: 'Infrastructure' },
        { href: '/carte-pn', label: 'Carte PN', icon: Map },
        { href: '/lignes', label: 'Répertoire Lignes', icon: Radio },
        { href: '/pmr', label: 'Matériel PMR', icon: BookOpen },
        { title: 'Organisation' },
        { href: '/planning', label: 'Planning', icon: Calendar },
        { href: '/repertoire', label: 'Contacts', icon: BookOpen },
        { href: '/documents', label: 'Documents', icon: FileText },
        { href: '/stats', label: 'Statistiques', icon: BarChart3 },
    ];

    function isActive(path) {
        return $page.url.pathname.startsWith(path);
    }

    async function logout() {
        await supabase.auth.signOut();
        window.location.href = '/';
    }
</script>

<button 
    onclick={() => isOpen = !isOpen}
    class="md:hidden fixed top-4 right-4 z-50 p-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg text-white"
>
    {#if isOpen}<X />{:else}<Menu />{/if}
</button>

<aside class="
    fixed inset-y-0 left-0 z-40 w-64 bg-[#0a0c10]/95 backdrop-blur-xl border-r border-white/5 
    transform transition-transform duration-300 ease-in-out md:translate-x-0 md:relative
    flex flex-col
    {isOpen ? 'translate-x-0' : '-translate-x-full'}
">
    
    <div class="h-20 flex items-center px-6 border-b border-white/5">
        <div class="font-bold text-2xl tracking-tighter bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            BACO
        </div>
        <span class="ml-2 text-[10px] text-gray-500 font-mono border border-white/10 px-1.5 py-0.5 rounded">v2.0</span>
    </div>

    <nav class="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
        {#each menuItems as item}
            {#if item.title}
                <div class="px-3 mt-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                    {item.title}
                </div>
            {:else}
                <a 
                    href={item.href}
                    onclick={() => isOpen = false}
                    class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                    {isActive(item.href) 
                        ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'}"
                >
                    <svelte:component 
                        this={item.icon} 
                        size={18} 
                        class={isActive(item.href) ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'} 
                    />
                    {item.label}
                </a>
            {/if}
        {/each}

        {#if userRole === 'admin'}
            <div class="px-3 mt-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-red-500/50">Système</div>
            <a href="/admin" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20">
                <Shield size={18} /> Administration
            </a>
        {/if}
    </nav>

    <div class="p-4 border-t border-white/5">
        <a href="/profil" class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors mb-2">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
                ME
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-gray-200 truncate">Mon Profil</p>
                <p class="text-[10px] text-gray-500 truncate">Gérer mon compte</p>
            </div>
            <Settings size={16} class="text-gray-500" />
        </a>
        <button onclick={logout} class="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-500 hover:text-red-400 transition-colors">
            <LogOut size={14} /> Déconnexion
        </button>
    </div>
</aside>