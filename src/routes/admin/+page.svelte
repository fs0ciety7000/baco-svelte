<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores'; 
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast.js';
  import { openConfirmModal } from '$lib/stores/modal.js';
  import { fly, fade } from 'svelte/transition';
  
  // Icônes
  import { 
    Shield, UserPlus, User, UserX, UserCheck, KeyRound, FileWarning, 
    History, Loader2, X, Copy, AlertOctagon, ShieldAlert, ChevronLeft, 
    Save, Edit2, UserCog, ArrowUpDown, AlertTriangle 
  } from 'lucide-svelte';

  // --- ÉTAT GLOBAL (RUNES) ---
  let usersList = $state([]); 
  let isLoading = $state(true);
  let isCreating = $state(false);
  let currentAdminId = $state(null);
  let currentUserProfile = $state(null);

  // --- GESTION DU TRI ---
  let sortCol = $state('last_active');
  let sortAsc = $state(false);

  // --- FORMULAIRE CRÉATION ---
  let newUser = $state({ email: "", password: "", role: "user" });

  // --- MODALES ---
  let showInfractionModal = $state(false);
  let showHistoryModal = $state(false);
  let showResetModal = $state(false);
  
  let selectedUser = $state(null);
  let infractionData = $state({ type: 'yellow', reason: '' });
  let historyData = $state({ list: [], loading: false });
  let resetData = $state({ password: '', loading: false, status: '' });

  // --- ÉTAT POUR L'ÉDITION ---
  let isSaving = $state(false);
  // Récupération réactive de l'ID depuis l'URL
  let targetId = $derived($page.url.searchParams.get('id')); 

  // Formulaire d'édition (State)
  let form = $state({
      full_name: '',
      avatar_url: '',
      role: ''
  });

  // --- LOGIQUE DÉRIVÉE (REMPLACE $:) ---
  
  // 1. Utilisateur ciblé (Trouvé dans la liste via l'ID de l'URL)
  let targetUser = $derived(
    targetId ? usersList.find(u => u.user_id === targetId) : null
  );

  // 2. Liste affichée (Triée automatiquement quand usersList ou sortCol change)
  let users = $derived.by(() => {
      if (!usersList) return [];
      
      return [...usersList].sort((a, b) => {
          let valA = a[sortCol];
          let valB = b[sortCol];

          if (sortCol === 'last_active') {
              valA = new Date(valA || 0).getTime();
              valB = new Date(valB || 0).getTime();
          } 
          else if (typeof valA === 'string') {
              valA = valA.toLowerCase();
              valB = valB.toLowerCase();
          }

          if (valA < valB) return sortAsc ? -1 : 1;
          if (valA > valB) return sortAsc ? 1 : -1;
          return 0;
      });
  });

  // --- EFFETS (REMPLACE $:) ---
  
  // Synchroniser le formulaire quand targetUser change
  $effect(() => {
    if (targetUser) {
        form.full_name = targetUser.full_name || '';
        form.avatar_url = targetUser.avatar_url || '';
        form.role = targetUser.role || 'user';
    }
  });

  // --- INITIALISATION ---
  onMount(async () => {
    await checkAdminAccess();
    await loadUsers(); 
  });

  function toggleSort(col) {
      if (sortCol === col) {
          sortAsc = !sortAsc;
      } else {
          sortCol = col;
          sortAsc = true;
      }
  }

  // --- FONCTIONS ASYNCRONES ---

  async function checkAdminAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return goto('/');
    
    currentAdminId = user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, permissions') 
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      toast.error("Accès refusé.");
      goto('/');
    }
    currentUserProfile = profile; 
  }

  async function loadUsers() {
    isLoading = true;
    try {
      const { data: usersData, error } = await supabase.rpc('get_all_users'); 
      if (error) throw error;

      const { data: presenceData } = await supabase
        .from('user_presence')
        .select('user_id, last_seen_at');

      const presenceMap = new Map(presenceData?.map(p => [p.user_id, p.last_seen_at]));

      usersList = (usersData || []).map(u => {
          const lastSeen = presenceMap.get(u.user_id);
          const lastSignIn = u.last_sign_in_at;
          
          let realLastActive = lastSignIn;
          if (lastSeen && (!lastSignIn || new Date(lastSeen) > new Date(lastSignIn))) {
              realLastActive = lastSeen;
          }

          return {
              ...u,
              last_active: realLastActive
          };
      });
      
    } catch (e) {
      toast.error("Erreur: " + e.message);
    } finally {
      isLoading = false;
    }
  }

  // --- ACTIONS NAVIGATION & ÉDITION ---

  function handleUserClick(userId) {
     // Navigation fluide via Query Param, déclenche les Runes ($derived targetId)
     goto(`?id=${userId}`, { replaceState: false }); 
  }

  function goBackToList() {
      goto('/admin'); // Retire l'ID de l'URL
  }

  async function saveProfile() {
      if (!targetUser || isSaving) return;
      isSaving = true;
      
      try {
        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: form.full_name,
                avatar_url: form.avatar_url,
                role: form.role,
                updated_at: new Date().toISOString() 
            })
            .eq('id', targetUser.user_id); 

        if (error) throw error;
        toast.success("Profil mis à jour !");
        
        // Mise à jour optimiste de la liste locale
        usersList = usersList.map(u => u.user_id === targetUser.user_id ? { ...u, ...form } : u);
        
        goBackToList();

      } catch (e) {
          toast.error(`Erreur: ${e.message}`);
      } finally {
        isSaving = false;
      }
  }

  // --- ACTIONS UTILISATEUR (CREATE, BAN, ROLE) ---

  async function handleCreateUser() {
    if (!newUser.email || !newUser.password) return;
    isCreating = true;

    try {
      // Note: La création via client nécessite une fonction admin côté serveur ou RPC
      // Ici on suppose que la session admin permet de créer (ou on utilise une Edge Function)
      // Pour cet exemple, on garde la logique existante.
      const { error } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: { data: { role: newUser.role, full_name: newUser.email.split('@')[0] } }
      });
      
      if (error) throw error;

      toast.success(`Utilisateur créé !`);
      newUser = { email: "", password: "", role: "user" };
      await loadUsers();

    } catch (e) {
      toast.error("Erreur: " + e.message);
    } finally {
      isCreating = false;
    }
  }

  async function handleChangeRole(user, nextRole) {
    if (user.user_id === currentAdminId) return toast.error("Impossible de modifier votre propre rôle.");
    
    openConfirmModal(`Promouvoir en ${nextRole.toUpperCase()} ?`, async () => {
        const { error } = await supabase.rpc('admin_update_user_role', { p_user_id: user.user_id, p_new_role: nextRole });
        if (error) return toast.error(error.message);
        
        toast.success("Rôle mis à jour");
        loadUsers();
    });
  }

  async function handleBanUser(user, shouldBan) {
    if (user.user_id === currentAdminId) return;
    openConfirmModal(shouldBan ? "Bannir cet utilisateur ?" : "Débannir ?", async () => {
         const banDate = shouldBan ? new Date(Date.now() + 3153600000000).toISOString() : null; // +100 ans
         const { error } = await supabase.from('profiles').update({ banned_until: banDate }).eq('id', user.user_id);
         if(error) return toast.error(error.message);
         loadUsers();
         toast.success(shouldBan ? "Utilisateur banni" : "Utilisateur débanni");
    });
  }

  // --- MODALES ACTIONS (Simplifiées pour l'exemple Rune) ---
  function openResetModal(u) { selectedUser = u; resetData.password = Math.random().toString(36).slice(-12); showResetModal = true; }
  function openInfractionModal(u) { selectedUser = u; showInfractionModal = true; }
  function openHistoryModal(u) { selectedUser = u; showHistoryModal = true; /* load history logic */ }

  // --- UI HELPERS ---
  function getNextRole(current) {
    if (current === 'user') return { role: 'moderator', icon: Shield, label: 'Promouvoir Modo', color: 'text-purple-400' };
    if (current === 'moderator') return { role: 'admin', icon: ShieldAlert, label: 'Promouvoir Admin', color: 'text-themed' };
    return { role: 'user', icon: User, label: 'Rétrograder User', color: 'text-yellow-400' };
  }
  
  function formatDate(d) { return d ? new Date(d).toLocaleString('fr-BE') : 'Jamais'; }

  // Style CSS dynamique
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white focus:ring-2 focus:border-transparent transition-all outline-none";
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6">
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--color-primary),0.15)]">
          <Shield size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200">Administration</h1>
          <p class="text-gray-500 text-sm mt-1">Gestion des utilisateurs et sanctions (Runes Edition).</p>
        </div>
    </div>
  </header>

  <main class="space-y-8">
    
    {#if isLoading && !usersList.length}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-primary w-10 h-10"/></div>
    
    {:else if targetUser}
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-lg relative overflow-hidden" in:fly={{ y: 20, duration: 300 }}>
          <div class="absolute top-0 right-0 p-32 opacity-10 bg-primary rounded-full blur-3xl pointer-events-none"></div>

          <button onclick={goBackToList} class="flex items-center gap-2 text-primary hover:opacity-80 mb-6 transition-colors group">
              <ChevronLeft class="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Retour liste
          </button>
          
          <h2 class="text-2xl font-bold text-gray-200 mb-8 flex items-center gap-3 pb-6 border-b border-white/5">
              <UserCog class="w-8 h-8 text-primary"/> Édition : {targetUser.full_name || targetUser.email}
          </h2>
          
          <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }} class="space-y-6 max-w-xl mx-auto">
              <div class="flex items-center gap-6 pb-6 border-b border-white/5">
                  <img src={form.avatar_url || '/default-avatar.png'} alt="Avatar" class="w-24 h-24 rounded-full object-cover border-4 border-white/5 shadow-2xl">
                  <div>
                      <p class="text-xs font-bold text-gray-500 uppercase">Email</p>
                      <p class="text-lg font-mono text-gray-200 bg-white/5 px-3 py-1 rounded-lg border border-white/5 mt-1">{targetUser.email}</p>
                  </div>
              </div>

              <div>
                  <label class="text-xs font-bold text-gray-500 uppercase ml-1 mb-2 block">Nom Complet</label>
                  <input type="text" bind:value={form.full_name} class={inputClass} placeholder="Nom affiché">
              </div>
              
              <div>
                  <label class="text-xs font-bold text-gray-500 uppercase ml-1 mb-2 block">Avatar URL</label>
                  <input type="text" bind:value={form.avatar_url} class={inputClass} placeholder="https://...">
              </div>

              <div>
                  <label class="text-xs font-bold text-gray-500 uppercase ml-1 mb-2 block">Rôle</label>
                  <select bind:value={form.role} class="{inputClass} capitalize">
                      <option value="user" class="bg-gray-900">User</option>
                      <option value="moderator" class="bg-gray-900">Modérateur</option>
                      <option value="admin" class="bg-gray-900">Admin</option>
                  </select>
              </div>

              <div class="pt-6 flex justify-end">
                  <button type="submit" disabled={isSaving} class="btn-primary px-6 py-3 rounded-xl font-bold flex items-center gap-2 bg-primary text-black hover:bg-white transition-all disabled:opacity-50">
                      {#if isSaving} <Loader2 class="w-5 h-5 animate-spin" /> {:else} <Save class="w-5 h-5" /> {/if}
                      Sauvegarder
                  </button>
              </div>
          </form>
        </div>

    {:else}
        <div class="bg-black/20 border border-white/5 rounded-3xl p-6 shadow-sm">
            <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
              <UserPlus size={20} class="text-primary"/> Nouvel Utilisateur
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <input type="email" bind:value={newUser.email} class={inputClass} placeholder="Email">
              <input type="text" bind:value={newUser.password} class={inputClass} placeholder="Password">
              <select bind:value={newUser.role} class={inputClass}>
                  <option value="user" class="bg-gray-900">User</option>
                  <option value="moderator" class="bg-gray-900">Modo</option>
                  <option value="admin" class="bg-gray-900">Admin</option>
              </select>
              <button onclick={handleCreateUser} disabled={isCreating} class="bg-primary text-black font-bold rounded-xl h-[46px] w-full flex items-center justify-center gap-2 hover:bg-white transition-colors">
                  {#if isCreating} <Loader2 class="animate-spin" size={18}/> {:else} <UserPlus size={18}/> Créer {/if}
              </button>
            </div>
        </div>

        <div class="bg-black/20 border border-white/5 rounded-3xl shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-white/5">
              <thead class="bg-white/[0.02]">
                <tr>
                  <th onclick={() => toggleSort('full_name')} class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-white group">
                      Utilisateur <ArrowUpDown size={12} class="inline ml-1 opacity-0 group-hover:opacity-100"/>
                  </th>
                  <th onclick={() => toggleSort('role')} class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-white">Rôle</th>
                  <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Statut</th>
                  <th onclick={() => toggleSort('last_active')} class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-white">Activité</th>
                  <th class="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each users as user (user.user_id)}
                    {@const isBanned = user.banned_until && new Date(user.banned_until) > new Date()}
                    {@const nextRoleData = getNextRole(user.role || 'user')}
                    
                    <tr class="group hover:bg-white/[0.02] transition-colors">
                      <td class="px-6 py-4 whitespace-nowrap cursor-pointer" onclick={() => handleUserClick(user.user_id)}>
                        <div class="flex items-center gap-4">
                            <img class="h-10 w-10 rounded-full object-cover border border-white/10" src={user.avatar_url || '/default-avatar.png'} alt="">
                            <div>
                                <div class="text-sm font-bold text-gray-200 group-hover:text-primary transition-colors">{user.full_name || 'Sans nom'}</div>
                                <div class="text-xs text-gray-500">{user.email}</div>
                            </div>
                        </div>
                      </td>
                      
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 rounded text-xs font-bold border 
                            {user.role === 'admin' ? 'bg-primary/10 text-primary border-primary/30' : 
                             user.role === 'moderator' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 
                             'bg-white/5 text-gray-400 border-white/10'}">
                            {user.role}
                        </span>
                      </td>

                      <td class="px-6 py-4 whitespace-nowrap">
                         {#if isBanned} <span class="text-red-400 text-xs font-bold bg-red-500/10 px-2 py-1 rounded border border-red-500/20">Banni</span>
                         {:else} <span class="text-green-400 text-xs font-bold bg-green-500/10 px-2 py-1 rounded border border-green-500/20">Actif</span> {/if}
                      </td>
                      
                      <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                          {formatDate(user.last_active)}
                      </td>

                      <td class="px-6 py-4 whitespace-nowrap text-center">
                        <div class="flex justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onclick={() => handleUserClick(user.user_id)} class="p-2 hover:text-white" title="Éditer"><Edit2 size={16}/></button>
                            <button onclick={() => openResetModal(user)} class="p-2 hover:text-white"><KeyRound size={16}/></button>
                            <button onclick={() => openInfractionModal(user)} class="p-2 text-yellow-600 hover:text-yellow-400"><FileWarning size={16}/></button>
                            
                            {#if user.user_id !== currentAdminId}
                                <button onclick={() => handleChangeRole(user, nextRoleData.role)} class="p-2 {nextRoleData.color}"><svelte:component this={nextRoleData.icon} size={16} /></button>
                                <button onclick={() => handleBanUser(user, !isBanned)} class="p-2 {isBanned ? 'text-green-500' : 'text-red-500'}">
                                    {#if isBanned} <UserCheck size={16}/> {:else} <UserX size={16}/> {/if}
                                </button>
                            {/if}
                        </div>
                      </td>
                    </tr>
                {/each}
              </tbody>
            </table>
            </div>
        </div>
    {/if}
  </main>

  </div>

<style>
  :global(.text-primary) { color: rgb(var(--color-primary)); }
  :global(.bg-primary) { background-color: rgb(var(--color-primary)); }
  :global(.border-primary) { border-color: rgb(var(--color-primary)); }
</style>