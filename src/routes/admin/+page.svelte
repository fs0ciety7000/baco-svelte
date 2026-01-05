<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast.js';
  import { page } from '$app/stores'; 
  import { hasPermission, ACTIONS } from '$lib/permissions';
  import { openConfirmModal } from '$lib/stores/modal.js';
  import { fly, fade } from 'svelte/transition';

  import { 
    Shield, UserPlus, Search, User, UserX, UserCheck, 
    KeyRound, FileWarning, History, Loader2, X, Copy, 
    AlertOctagon, CheckCircle, ShieldAlert, ChevronLeft, Save, Edit2, UserCog 
  } from 'lucide-svelte';
  
  let currentUserProfile = null; // C'est cette variable qui doit contenir le rôle
  let usersList = []; // Votre liste d'utilisateurs à afficher

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

    // 1. On sélectionne 'role' ET 'permissions' (nécessaire pour hasPermission)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, permissions') 
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      toast.error("Accès refusé.");
      goto('/');
    }

    // 2. IMPORTANT : On remplit la variable globale pour que le HTML la voie
    currentUserProfile = profile; 
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

 // --- UI HELPERS THÉMÉS ---
  function getNextRole(current) {
    if (current === 'user') return { role: 'moderator', icon: Shield, label: 'Promouvoir Modérateur', color: 'text-purple-400' };
    if (current === 'moderator') return { role: 'admin', icon: ShieldAlert, label: 'Promouvoir Admin', color: 'text-themed' }; // Changé blue par themed
    return { role: 'user', icon: User, label: 'Rétrograder User', color: 'text-yellow-400' };
  }

  // Styles CSS Thémés
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:ring-2 focus:border-transparent transition-all outline-none disabled:opacity-50";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 ml-1";

  // --- STYLE DYNAMIQUE DE BORDURE D'AVATAR ---
  $: borderClass = targetUser?.role === 'admin' 
      ? 'bg-gradient-to-br from-yellow-300/80 via-amber-400/50 to-yellow-500/80 shadow-[0_0_35px_rgba(245,158,11,0.6)] ring-1 ring-yellow-400/50' 
      : targetUser?.role === 'moderator'
      ? 'bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-[0_0_30px_rgba(168,85,247,0.6)] animate-pulse' 
      : 'bg-gradient-to-br from-[rgba(var(--color-primary),0.5)] to-purple-500/50 shadow-[0_0_30px_rgba(var(--color-primary),0.2)]';

  function formatDate(dateStr) {
    if (!dateStr) return 'Jamais';
    return new Date(dateStr).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' });
  }


</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }} style="--primary-rgb: var(--color-primary);">
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl border transition-all duration-500"
             style="background-color: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-color: rgba(var(--primary-rgb), 0.2); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);">
          <Shield size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Administration</h1>
          <p class="text-gray-500 text-sm mt-1">Gestion des utilisateurs et sanctions.</p>
        </div>
    </div>
  </header>

  <main class="space-y-8" style="--primary-rgb: var(--color-primary);">
    
    {#if isLoading && !targetUser}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin themed-spinner w-10 h-10" style="color: rgba(var(--color-primary), 0.5);"/></div>
    
    {:else if targetUser}
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-lg relative overflow-hidden" in:fly={{ y: 20, duration: 400 }}>
          <div class="absolute top-0 right-0 p-32 opacity-10 rounded-full blur-3xl pointer-events-none" style="background-color: rgb(var(--color-primary));"></div>

          <button on:click={goBackToList} class="flex items-center gap-2 hover:opacity-80 mb-6 transition-colors group" style="color: rgb(var(--primary-rgb));">
              <ChevronLeft class="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Retour liste
          </button>
          
          <h2 class="text-2xl font-bold text-gray-200 mb-8 flex items-center gap-3 pb-6 border-b border-white/5">
              <UserCog class="w-8 h-8" style="color: rgb(var(--primary-rgb));"/> Édition : {targetUser.full_name || targetUser.email}
          </h2>
          
          <form on:submit|preventDefault={saveProfile} class="space-y-6 max-w-xl mx-auto">
              <div class="flex items-center gap-6 pb-6 border-b border-white/5">
                  <img src={form.avatar_url || '/default-avatar.png'} alt="Avatar" class="w-24 h-24 rounded-full object-cover border-4 border-white/5 shadow-2xl">
                  <div>
                      <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">Email</p>
                      <p class="text-lg font-mono text-gray-200 bg-white/5 px-3 py-1 rounded-lg border border-white/5 mt-1">{targetUser.email}</p>
                  </div>
              </div>

              <div>
                  <label for="full_name" class={labelClass}>Nom Complet</label>
                  <input type="text" bind:value={form.full_name} class={inputClass} style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
              </div>

              <div>
                  <label for="role" class={labelClass}>Rôle</label>
                  <select bind:value={form.role} class="{inputClass} capitalize bg-black/40" style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
                      <option value="user" class="bg-gray-900 text-white">User</option>
                      <option value="moderator" class="bg-gray-900 text-white">Modérateur</option>
                      <option value="admin" class="bg-gray-900 text-white">Admin</option>
                  </select>
              </div>

              <div class="pt-6 flex justify-end">
                  <button type="submit" disabled={isSaving} class="btn-primary-glow px-6 py-3 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2">
                      {#if isSaving} <Loader2 class="w-5 h-5 animate-spin" /> {:else} <Save class="w-5 h-5" /> {/if}
                      Sauvegarder
                  </button>
              </div>
          </form>
        </div>

    {:else}
        <div class="bg-black/20 border border-white/5 rounded-3xl p-6 shadow-sm" in:fly={{ y: 20, duration: 400 }}>
          <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
            <UserPlus size={20} style="color: rgb(var(--primary-rgb));"/> Nouvel Utilisateur
          </h2>
          
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div><label class={labelClass}>Email</label><input type="email" bind:value={newUser.email} class={inputClass} placeholder="user@baco.be" style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);"></div>
            <div><label class={labelClass}>Mot de passe</label><input type="text" bind:value={newUser.password} class={inputClass} placeholder="Secret..." style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);"></div>
            <div>
              <label class={labelClass}>Rôle</label>
              <select bind:value={newUser.role} class="{inputClass} appearance-none" style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
                <option value="user" class="bg-gray-900 text-white">Utilisateur</option>
                <option value="moderator" class="bg-gray-900 text-white">Modérateur</option>
                <option value="admin" class="bg-gray-900 text-white">Admin</option>
            </select>
            </div>
            <button on:click={handleCreateUser} disabled={isCreating} class="btn-primary-glow flex items-center justify-center gap-2 w-full px-4 py-3 text-white rounded-xl font-bold transition-all disabled:opacity-50 h-[46px]">
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
              {#each users as user}
                {@const isBanned = user.banned_until && new Date(user.banned_until) > new Date()}
                {@const nextRoleData = getNextRole(user.role || 'user')}
                
                <tr class="group hover:bg-white/[0.02] transition-colors">
                 <td class="px-6 py-4 whitespace-nowrap">
                    <a href="/admin/utilisateur/{user.user_id}" class="flex items-center gap-4 w-full text-left group-hover:opacity-80 transition-opacity">
                      <img class="h-10 w-10 rounded-full object-cover border border-white/10" src={user.avatar_url || '/default-avatar.png'}>
                      <div>
                        <div class="text-sm font-bold text-gray-200" style="color: {user.email === targetEmail ? 'rgb(var(--primary-rgb))' : ''}">{user.full_name || user.email}</div>
                        <div class="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </a>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if user.role === 'admin'}
                      <span class="role-badge role-admin">Admin</span>
                    {:else if user.role === 'moderator'}
                      <span class="role-badge role-modo">Modérateur</span>
                    {:else}
                      <span class="role-badge role-user">Utilisateur</span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if isBanned}
                      <span class="px-2.5 py-1 text-xs font-bold rounded-lg border bg-red-500/10 text-red-400 border-red-500/20 animate-pulse">Banni</span>
                    {:else}
                      <span class="px-2.5 py-1 text-xs font-bold rounded-lg border bg-green-500/10 text-green-400 border-green-500/20">Actif</span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex gap-2">
                        {#if user.active_yellow_cards > 0} <span class="text-yellow-500 text-xs font-bold bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">⚠ {user.active_yellow_cards}</span> {/if}
                        {#if user.active_red_cards > 0} <span class="text-red-500 text-xs font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">🚷 {user.active_red_cards}</span> {/if}
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                    {formatDate(user.last_sign_in_at)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    {#if user.user_id !== currentAdminId}
                      <div class="flex justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button on:click={() => openResetModal(user)} class="action-icon-btn hover:text-white" title="Password"><KeyRound size={16}/></button>
                        <button on:click={() => openInfractionModal(user)} class="action-icon-btn text-yellow-600 hover:text-yellow-400" title="Sanction"><FileWarning size={16}/></button>
                        <button on:click={() => openHistoryModal(user)} class="action-icon-btn hover:text-themed" style="color: rgba(var(--primary-rgb), 0.6);" title="History"><History size={16}/></button>
                        <button on:click={() => handleChangeRole(user, nextRoleData.role)} class="action-icon-btn {nextRoleData.color} hover:bg-white/5" title={nextRoleData.label}><svelte:component this={nextRoleData.icon} size={16} /></button>
              
              {#if hasPermission(currentUserProfile, ACTIONS.USERS_BAN)}
                        {#if isBanned}
                          <button on:click={() => handleBanUser(user, false)} class="action-icon-btn text-green-600 hover:text-green-400" title="Débannir"><UserCheck size={16}/></button>
                        {:else}

                          <button on:click={() => handleBanUser(user, true)} class="action-icon-btn text-red-600 hover:text-red-400" title="Bannir"><UserX size={16}/></button>
                        {/if}
                    {/if}  
                      </div>
                    {:else}
                      <span class="text-xs text-gray-500 italic">Vous</span>
                    {/if}

                    
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
  .themed-spinner { color: rgb(var(--primary-rgb)); }
  .text-themed { color: rgb(var(--primary-rgb)); }
  .hover-text-themed:hover { color: rgb(var(--primary-rgb)); }

  .btn-primary-glow {
    background-color: rgba(var(--primary-rgb), 0.8);
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);
    border: 1px solid rgba(var(--primary-rgb), 0.3);
  }

  .btn-primary-glow:hover:not(:disabled) {
    background-color: rgb(var(--primary-rgb));
    box-shadow: 0 0 25px rgba(var(--primary-rgb), 0.5);
    transform: translateY(-1px);
  }

  .action-icon-btn {
    padding: 0.5rem;
    border-radius: 0.5rem;
    transition: all 0.2s;
  }
  .action-icon-btn:hover {
    background-color: rgba(255, 255, 255, 0.05);
    transform: scale(1.1);
  }

  .role-badge {
    padding: 0.25rem 0.625rem;
    display: inline-flex;
    font-size: 0.75rem;
    font-weight: 800;
    border-radius: 0.5rem;
    border-width: 1px;
  }
  .role-admin {
    background-color: rgba(var(--primary-rgb), 0.1);
    color: rgb(var(--primary-rgb));
    border-color: rgba(var(--primary-rgb), 0.3);
  }
  .role-modo {
    background-color: rgba(168, 85, 247, 0.1);
    color: rgb(168, 85, 247);
    border-color: rgba(168, 85, 247, 0.3);
  }
  .role-user {
    background-color: rgba(255, 255, 255, 0.05);
    color: #9ca3af;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>