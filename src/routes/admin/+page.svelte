<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast.js';
  import { page } from '$app/stores'; 
  import { openConfirmModal } from '$lib/stores/modal.js';
  import { fly, fade } from 'svelte/transition';

  import { 
    Shield, UserPlus, Search, User, UserX, UserCheck, 
    KeyRound, FileWarning, History, Loader2, X, Copy, 
    AlertOctagon, CheckCircle, ShieldAlert, ChevronLeft, Save, Edit2, UserCog 
  } from 'lucide-svelte';
  
  // --- ÉTAT ---
  let users = [];
  let isLoading = true;
  let isCreating = false;
  let currentAdminId = null;

  // Formulaire Création
  let newUser = { email: "", password: "", role: "user" };
  // Modales
  let showInfractionModal = false;
  let showHistoryModal = false;
  let showResetModal = false;
  // Données Modales
  let selectedUser = null;
  let infractionData = { type: 'yellow', reason: '' };
  let historyData = { list: [], loading: false };
  let resetData = { password: '', loading: false, status: '' };

  // --- ÉTAT POUR L'ÉDITION ---
  $: targetEmail = $page.url.searchParams.get('email'); 
  let targetUser = null;
  let isSaving = false;
  let form = {
      full_name: '',
      avatar_url: '',
      role: ''
  };

  $: if (targetUser) {
      form.full_name = targetUser.full_name;
      form.avatar_url = targetUser.avatar_url;
      form.role = targetUser.role;
  }
  
  onMount(async () => {
    await checkAdminAccess();
    await loadUsers(); 
  });

  // --- SÉCURITÉ ---

  async function checkAdminAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return goto('/');
    
    currentAdminId = user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      toast.error("Accès refusé.");
      goto('/');
    }
  }

  // --- CHARGEMENT ---

  async function loadUsers() {
    isLoading = true;
    try {
      const { data, error } = await supabase.rpc('get_all_users'); 
      if (error) throw error;
      users = data || [];
      
      if (targetEmail) {
          const foundUser = users.find(u => u.email === targetEmail);
          if (foundUser) {
              await loadTargetProfile(foundUser.user_id, foundUser.email, foundUser.last_sign_in_at);
          } else {
              goto('/admin');
          }
      }

    } catch (e) {
      toast.error("Erreur: " + e.message);
    } finally {
      isLoading = false;
    }
  }

  async function loadTargetProfile(id, email, last_sign_in_at) {
    if (!id) return;
    isLoading = true;
    try {
        const { data: profileData, error } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url, role, updated_at') 
            .eq('id', id)
            .single();

        if (error || !profileData) throw error || new Error("Profile data missing.");

        targetUser = {
            id: profileData.id,
            user_id: profileData.id, 
            email: email, 
            last_sign_in_at: last_sign_in_at,
            ...profileData
        };

    } catch(e) {
        targetUser = null;
        goto('/admin');
    } finally {
        isLoading = false;
    }
  }

  // --- ACTIONS ---
  async function saveProfile() {
      if (!targetUser || isSaving) return;
      isSaving = true;
      
      if (!['admin', 'moderator', 'user'].includes(form.role)) {
          toast.error("Rôle invalide.");
          isSaving = false;
          return;
      }

      try {
        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: form.full_name,
                avatar_url: form.avatar_url,
                role: form.role,
                updated_at: new Date().toISOString() 
            })
            .eq('id', targetUser.id); 

        if (error) throw error;
        toast.success("Profil mis à jour !");
        loadUsers();
        goto('/admin'); 

      } catch (e) {
          toast.error(`Erreur: ${e.message}`);
      } finally {
        isSaving = false;
      }
  }

  function goBackToList() {
      targetUser = null;
      goto('/admin');
  }

  function handleViewEdit(email) {
      goto(`/admin?email=${email}`);
  }

  async function handleCreateUser() {
    if (!newUser.email || !newUser.password) return;
    isCreating = true;

    try {
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (!adminSession) throw new Error("Session admin perdue.");

      const { error: signUpError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            role: newUser.role,
            full_name: newUser.email.split('@')[0],
            username: newUser.email.split('@')[0]
          }
        }
      });

      if (signUpError) throw signUpError;
      const { error: restoreError } = await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token
      });
      if (restoreError) throw restoreError;

      toast.success(`Utilisateur créé !`);
      newUser = { email: "", password: "", role: "user" };
      loadUsers();

    } catch (e) {
      toast.error("Erreur: " + e.message);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) location.reload();
    } finally {
      isCreating = false;
    }
  }

function executeHandleChangeRole(user, nextRole) {
    return async () => {
        try {
            const { error: rpcError } = await supabase.rpc('admin_update_user_role', {
                p_user_id: user.user_id,
                p_new_role: nextRole
            });
            if (rpcError) throw rpcError;
            loadUsers();
            toast.success(`Rôle mis à jour: ${nextRole.toUpperCase()}.`);
        } catch (e) {
            toast.error("Erreur: " + e.message);
        }
    };
}

async function handleChangeRole(user, nextRole) {
    if (user.user_id === currentAdminId) return toast.error("Impossible de modifier votre propre rôle.");
    openConfirmModal(
        `Changer le rôle en ${nextRole.toUpperCase()} ?`,
        executeHandleChangeRole(user, nextRole)
    );
}

function executeHandleBanUser(user, shouldBan) {
    return async () => {
        try {
            let banDate = null;
            if (shouldBan) {
                const d = new Date();
                d.setFullYear(d.getFullYear() + 100);
                banDate = d.toISOString();
            }

            const updates = {
                banned_until: banDate,
                banned_until_status: shouldBan ? 'banned' : null
            };

            const { error: updateError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.user_id);
            if (updateError) throw updateError;

            if (!shouldBan) {
                await supabase
                    .from('infractions')
                    .update({ is_active: false })
                    .eq('user_id', user.user_id);
            }

            loadUsers();
            toast.success(shouldBan ? "Utilisateur banni." : "Utilisateur débanni.");

        } catch (e) {
            toast.error("Erreur: " + e.message);
        }
    };
}

async function handleBanUser(user, shouldBan) {
    if (user.user_id === currentAdminId) return toast.error("Impossible.");
    openConfirmModal(
        shouldBan ? "Bannir cet utilisateur définitivement ?" : "Débannir cet utilisateur ?",
        executeHandleBanUser(user, shouldBan)
    );
}

  // --- MODALES ---

  function openInfractionModal(user) {
    selectedUser = user;
    infractionData = { type: 'yellow', reason: '' };
    showInfractionModal = true;
  }

  async function submitInfraction() {
    if (!infractionData.reason) return toast.error("Raison requise.");
    try {
      const { error } = await supabase.rpc('admin_add_infraction', {
        target_user_id: selectedUser.user_id,
        p_card_type: infractionData.type,
        p_reason: infractionData.reason
      });
      if (error) throw error;
      toast.success("Infraction ajoutée !");
      showInfractionModal = false;
      loadUsers();
    } catch (e) {
      toast.error("Erreur: " + e.message);
    }
  }

  async function openHistoryModal(user) {
    selectedUser = user;
    showHistoryModal = true;
    historyData.loading = true;
    historyData.list = [];
    try {
      const { data, error } = await supabase
        .from('infractions')
        .select('*, admin:admin_id ( full_name )')
        .eq('user_id', user.user_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      historyData.list = data || [];
    } catch (e) { console.error(e); } finally { historyData.loading = false;
    }
  }

function executePardonInfraction(infractionId) {
    return async () => {
        try {
            const { error } = await supabase.rpc('admin_pardon_infraction', { p_infraction_id: infractionId });
            if (error) throw error;
            await loadUsers();
            await openHistoryModal(selectedUser);
            toast.success("Infraction pardonnée !");
        } catch (e) { 
            toast.error("Erreur: " + e.message);
        }
    };
}

async function pardonInfraction(infractionId) {
    openConfirmModal("Pardonner cette infraction ?", executePardonInfraction(infractionId));
}

  function openResetModal(user) {
    selectedUser = user;
    resetData = { password: generatePassword(), loading: false, status: '' };
    showResetModal = true;
  }

  function generatePassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    return Array(12).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function confirmResetPassword() {
    resetData.loading = true;
    resetData.status = "Envoi...";
    try {
      const { error } = await supabase.rpc('admin_reset_user_password', {
        user_id_to_reset: selectedUser.user_id,
        new_password: resetData.password
      });
      if (error) throw error;
      resetData.status = "Succès !";
    } catch (e) {
      resetData.status = "Erreur: " + e.message;
    } finally {
      resetData.loading = false;
    }
  }

  function copyPassword() {
    navigator.clipboard.writeText(resetData.password);
    toast.info("Copié !");
  }

  // --- UI HELPERS ---
  function getNextRole(current) {
    if (current === 'user') return { role: 'moderator', icon: Shield, label: 'Promouvoir Modérateur', color: 'text-purple-400' };
    if (current === 'moderator') return { role: 'admin', icon: ShieldAlert, label: 'Promouvoir Admin', color: 'text-blue-400' };
    return { role: 'user', icon: User, label: 'Rétrograder User', color: 'text-yellow-400' };
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Jamais';
    return new Date(dateStr).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' });
  }

  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 ml-1";

</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Shield size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Administration</h1>
          <p class="text-gray-500 text-sm mt-1">Gestion des utilisateurs et sanctions.</p>
        </div>
    </div>
  </header>

  <main class="space-y-8">
    
    {#if isLoading && !targetUser}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-blue-500/50 w-10 h-10"/></div>
    
    {:else if targetUser}
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-lg relative overflow-hidden" in:fly={{ y: 20, duration: 400 }}>
          <div class="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <button on:click={goBackToList} class="flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 transition-colors group">
              <ChevronLeft class="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Retour liste
          </button>
          
          <h2 class="text-2xl font-bold text-gray-200 mb-8 flex items-center gap-3 pb-6 border-b border-white/5">
              <UserCog class="w-8 h-8 text-yellow-500"/> Édition : {targetUser.full_name || targetUser.email}
          </h2>
          
          <form on:submit|preventDefault={saveProfile} class="space-y-6 max-w-xl mx-auto">
              <div class="flex items-center gap-6 pb-6 border-b border-white/5">
                  <img src={form.avatar_url || '/default-avatar.png'} alt="Avatar" class="w-24 h-24 rounded-full object-cover border-4 border-white/5 shadow-2xl">
                  <div>
                      <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">Email</p>
                      <p class="text-lg font-mono text-gray-200 bg-white/5 px-3 py-1 rounded-lg border border-white/5 mt-1">{targetUser.email}</p>
                      <p class="text-xs text-gray-600 mt-2 font-mono">ID: {targetUser.id}</p>
                  </div>
              </div>

              <div>
                  <label for="full_name" class={labelClass}>Nom Complet</label>
                  <input type="text" id="full_name" bind:value={form.full_name} class={inputClass} />
              </div>

              <div>
                  <label for="avatar_url" class={labelClass}>URL Avatar</label>
                  <input type="url" id="avatar_url" bind:value={form.avatar_url} class={inputClass} />
              </div>
              
              <div>
                  <label for="role" class={labelClass}>Rôle</label>
                  <select id="role" bind:value={form.role} class="{inputClass} capitalize bg-black/40">
                      <option value="user" class="bg-gray-900">User</option>
                      <option value="moderator" class="bg-gray-900">Modérateur</option>
                      <option value="admin" class="bg-gray-900">Admin</option>
                  </select>
              </div>

              <div class="pt-6 flex justify-end">
                  <button type="submit" disabled={isSaving}
                          class="flex items-center gap-2 px-6 py-3 bg-blue-600/80 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-500/30 backdrop-blur-md transition-all disabled:opacity-50"
                  >
                      {#if isSaving} <Loader2 class="w-5 h-5 animate-spin" /> {:else} <Save class="w-5 h-5" /> {/if}
                      Sauvegarder
                  </button>
              </div>
          </form>
        </div>

    {:else}
        <div class="bg-black/20 border border-white/5 rounded-3xl p-6 shadow-sm" in:fly={{ y: 20, duration: 400 }}>
          <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
            <UserPlus size={20} class="text-blue-400"/> Nouvel Utilisateur
          </h2>
          
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div><label class={labelClass}>Email</label><input type="email" bind:value={newUser.email} class={inputClass} placeholder="user@baco.be"></div>
            <div><label class={labelClass}>Mot de passe</label><input type="text" bind:value={newUser.password} class={inputClass} placeholder="Secret..."></div>
            <div>
              <label class={labelClass}>Rôle</label>
              <select bind:value={newUser.role} class="{inputClass} appearance-none">
                <option value="user" class="bg-gray-900">Utilisateur</option>
                <option value="moderator" class="bg-gray-900">Modérateur</option>
                <option value="admin" class="bg-gray-900">Admin</option>
            </select>
            </div>
            <button on:click={handleCreateUser} disabled={isCreating} class="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-600/80 hover:bg-green-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(34,197,94,0.3)] border border-green-500/30 transition-all disabled:opacity-50 h-[46px]">
              {#if isCreating} <Loader2 class="animate-spin" size={18}/> {:else} <UserPlus size={18}/> Créer {/if}
            </button>
          </div>
        </div>

        <div class="bg-black/20 border border-white/5 rounded-3xl shadow-sm overflow-hidden" in:fly={{ y: 20, duration: 400, delay: 100 }}>
          <div class="overflow-x-auto">
           
          <table class="min-w-full divide-y divide-white/5">
            <thead class="bg-white/[0.02]">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Utilisateur</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Rôle</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Sanctions</th>
                <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Dernière Connexion</th>
                <th class="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
            {#if isLoading}
                <tr><td colspan="6" class="py-10 text-center"><Loader2 class="animate-spin mx-auto text-blue-500/50" /></td></tr>
            {:else}
              {#each users as user}
                {@const isBanned = user.banned_until && new Date(user.banned_until) > new Date()}
                {@const nextRoleData = getNextRole(user.role || 'user')}
                
                <tr class="group hover:bg-white/[0.02] transition-colors">
                  
                 <td class="px-6 py-4 whitespace-nowrap">
                    <a 
                        href="/admin/utilisateur/{user.user_id}"
                        class="flex items-center gap-4 w-full text-left block
                               {user.user_id !== currentAdminId ? 'cursor-pointer group-hover:text-blue-400' : 'cursor-default opacity-60 pointer-events-none'}
                               focus:outline-none transition-colors"
                    >
                      <img class="h-10 w-10 rounded-full object-cover border border-white/10 shadow-sm flex-shrink-0" src={user.avatar_url} alt="">
                      <div>
                        <div class="text-sm font-bold text-gray-200">{user.full_name || user.email}</div>
                        <div class="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </a>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if user.role === 'admin'}
                      <span class="px-2.5 py-1 inline-flex text-xs font-bold rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/20">Admin</span>
                    {:else if user.role === 'moderator'}
                      <span class="px-2.5 py-1 inline-flex text-xs font-bold rounded-lg border bg-purple-500/10 text-purple-400 border-purple-500/20">Modérateur</span>
                    {:else}
                      <span class="px-2.5 py-1 inline-flex text-xs font-bold rounded-lg border bg-white/5 text-gray-400 border-white/10">Utilisateur</span>
                    {/if}
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if isBanned}
                      <span class="px-2.5 py-1 inline-flex text-xs font-bold rounded-lg border bg-red-500/10 text-red-400 border-red-500/20 animate-pulse">Banni</span>
                    {:else}
                      <span class="px-2.5 py-1 inline-flex text-xs font-bold rounded-lg border bg-green-500/10 text-green-400 border-green-500/20">Actif</span>
                    {/if}
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                      {#if user.active_yellow_cards > 0}
                        <span class="flex items-center gap-1 text-yellow-500 font-bold text-sm bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20"><FileWarning size={14}/> {user.active_yellow_cards}</span>
                      {/if}
                      {#if user.active_red_cards > 0}
                        <span class="flex items-center gap-1 text-red-500 font-bold text-sm bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20"><AlertOctagon size={14}/> {user.active_red_cards}</span>
                      {/if}
                      {#if user.active_yellow_cards === 0 && user.active_red_cards === 0}
                        <span class="text-xs text-gray-600">—</span>
                      {/if}
                    </div>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-xs text-gray-400 font-mono bg-black/20 px-2 py-1 rounded">
                      {formatDate(user.last_sign_in_at)}
                    </span>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    {#if user.user_id !== currentAdminId}
                      <div class="flex justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button on:click={() => openResetModal(user)} class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Reset Password"><KeyRound size={16}/></button>
                        <button on:click={() => openInfractionModal(user)} class="p-2 text-yellow-600 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-colors" title="Infraction"><FileWarning size={16}/></button>
                        <button on:click={() => openHistoryModal(user)} class="p-2 text-blue-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors" title="Historique"><History size={16}/></button>
                        <button on:click={() => handleChangeRole(user, nextRoleData.role)} class="p-2 {nextRoleData.color} hover:bg-white/10 rounded-lg transition-colors" title={nextRoleData.label}><svelte:component this={nextRoleData.icon} size={16} /></button>
                        {#if isBanned}
                          <button on:click={() => handleBanUser(user, false)} class="p-2 text-green-600 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors" title="Débannir"><UserCheck size={16}/></button>
                        {:else}
                          <button on:click={() => handleBanUser(user, true)} class="p-2 text-red-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Bannir"><UserX size={16}/></button>
                        {/if}
                      </div>
                    {:else}
                      <span class="text-xs text-gray-500 italic">Vous</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
    
    </main>
  
  {#if showInfractionModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
      <div class="bg-[#0f1115] w-full max-w-md rounded-2xl p-6 shadow-2xl border border-white/10 ring-1 ring-white/5" transition:fly={{ y: 20 }}>
        <h3 class="text-lg font-bold text-gray-200 mb-2">Nouvelle Infraction</h3>
        <p class="text-sm text-gray-500 mb-6 font-mono bg-black/30 p-2 rounded border border-white/5">{selectedUser.email}</p>
        <div class="space-y-4">
          <div>
              <label class={labelClass}>Type</label>
              <select bind:value={infractionData.type} class="{inputClass} bg-black/40">
                  <option value="yellow" class="bg-gray-900">Carton Jaune</option>
                  <option value="red" class="bg-gray-900">Carton Rouge</option>
              </select>
          </div>
          <div>
              <label class={labelClass}>Raison</label>
              <textarea bind:value={infractionData.reason} class="{inputClass} resize-none" rows="3" placeholder="Motif..."></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
          <button on:click={() => showInfractionModal = false} class="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">Annuler</button>
          <button on:click={submitInfraction} class="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all">Confirmer</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showResetModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
      <div class="bg-[#0f1115] w-full max-w-md p-6 rounded-2xl shadow-2xl border border-white/10" transition:fly={{ y: 20 }}>
        <h3 class="text-lg font-bold text-gray-200 mb-4">Reset Password</h3>
        <p class="text-sm text-gray-500 mb-6">Pour : <strong class="text-gray-300">{selectedUser.email}</strong></p>
        <div class="mb-6">
          <label class={labelClass}>Nouveau mot de passe :</label>
          <div class="flex gap-2">
              <input type="text" readonly value={resetData.password} class="{inputClass} font-mono text-center text-blue-300 bg-blue-500/10 border-blue-500/20">
              <button on:click={copyPassword} class="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-gray-300 transition-colors"><Copy size={20}/></button>
          </div>
        </div>
        {#if resetData.status}
            <div class="text-sm text-center mb-4 font-bold py-2 rounded-lg bg-white/5 border border-white/10 {resetData.status.includes('Succès') ? 'text-green-400' : 'text-blue-400'}">
                {resetData.status}
            </div>
        {/if}
        <div class="flex justify-end gap-3 pt-4 border-t border-white/10">
          <button on:click={() => showResetModal = false} class="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">Fermer</button>
          <button on:click={confirmResetPassword} disabled={resetData.loading} class="px-4 py-2 bg-blue-600/80 hover:bg-blue-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all disabled:opacity-50">{resetData.loading ? 'Envoi...' : 'Confirmer'}</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showHistoryModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
      <div class="bg-[#0f1115] w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 max-h-[80vh] flex flex-col" transition:fly={{ y: 20 }}>
        <div class="flex justify-between items-center p-6 border-b border-white/10 bg-white/[0.02]">
            <h3 class="text-lg font-bold text-gray-200">Casier Judiciaire</h3>
            <button on:click={() => showHistoryModal = false} class="text-gray-500 hover:text-white"><X size={24}/></button>
        </div>
        <div class="flex-grow overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {#if historyData.loading}<div class="flex justify-center py-10"><Loader2 class="animate-spin text-blue-500/50"/></div>
          {:else if historyData.list.length === 0}<div class="text-center text-gray-500 py-8 border border-dashed border-white/10 rounded-xl">Casier vierge.</div>
          {:else}
            {#each historyData.list as card}
              {@const isActive = card.is_active && (card.card_type === 'red' || new Date(card.expires_at) > new Date())}
              <div class="flex items-start gap-3 p-4 rounded-xl border transition-colors {isActive ? 'bg-black/40 border-white/10' : 'bg-black/20 border-transparent opacity-50'}">
                {#if card.card_type === 'yellow'}
                    <div class="p-2 bg-yellow-500/10 rounded border border-yellow-500/20 text-yellow-500"><FileWarning size={18}/></div>
                {:else}
                    <div class="p-2 bg-red-500/10 rounded border border-red-500/20 text-red-500"><AlertOctagon size={18}/></div>
                {/if}
                <div class="flex-grow">
                    <p class="text-sm font-bold text-gray-200">Carton {card.card_type === 'yellow' ? 'Jaune' : 'Rouge'}{#if !isActive} <span class="text-[10px] font-normal text-gray-500 bg-white/5 px-1.5 py-0.5 rounded ml-2">Inactif</span> {/if}</p>
                    <p class="text-xs text-gray-400 italic mt-1">"{card.reason}"</p>
                    <p class="text-[10px] text-gray-600 mt-2 font-mono">Par {card.admin?.full_name || 'Admin'} le {formatDate(card.created_at)}</p>
                </div>
                {#if isActive}
                    <button on:click={() => pardonInfraction(card.id)} class="text-green-500 hover:text-green-300 hover:bg-green-500/10 p-1.5 rounded transition-colors" title="Pardonner"><CheckCircle size={18}/></button>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>