<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { 
    Shield, UserPlus, Search, User, UserX, UserCheck, 
    KeyRound, FileWarning, History, Loader2, X, Copy, 
    AlertOctagon, CheckCircle, ShieldAlert
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
      alert("Accès refusé. Réservé aux administrateurs.");
      goto('/');
    }
  }

  // --- CHARGEMENT UTILISATEURS ---

  async function loadUsers() {
    isLoading = true;
    try {
      const { data, error } = await supabase.rpc('get_all_users');
      if (error) throw error;
      users = data || [];
    } catch (e) {
      console.error("Erreur chargement users:", e);
      alert("Erreur chargement utilisateurs: " + e.message);
    } finally {
      isLoading = false;
    }
  }

  // --- CRÉATION UTILISATEUR ---

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

      alert(`Utilisateur ${newUser.email} créé avec succès !`);
      newUser = { email: "", password: "", role: "user" };
      loadUsers();

    } catch (e) {
      console.error(e);
      alert("Erreur création: " + e.message);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) location.reload();
    } finally {
      isCreating = false;
    }
  }

  // --- ACTIONS UTILISATEUR ---

  async function handleChangeRole(user, nextRole) {
    if (user.user_id === currentAdminId) return alert("Impossible de modifier votre propre rôle.");
    if (!confirm(`Passer cet utilisateur en ${nextRole.toUpperCase()} ?`)) return;

    try {
      const { error } = await supabase.rpc('admin_update_user_role', {
        p_user_id: user.user_id,
        p_new_role: nextRole
      });
      if (error) throw error;
      loadUsers();
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  }

  async function handleBanUser(user, shouldBan) {
    if (user.user_id === currentAdminId) return alert("Impossible de vous bannir.");
    if (!confirm(shouldBan ? "Bannir cet utilisateur ?" : "Débannir cet utilisateur ?")) return;

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

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.user_id);
      if (error) throw error;

      if (!shouldBan) {
        await supabase.from('infractions').update({ is_active: false }).eq('user_id', user.user_id);
      }

      loadUsers();
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  }

  // --- GESTION DES MODALES ---

  function openInfractionModal(user) {
    selectedUser = user;
    infractionData = { type: 'yellow', reason: '' };
    showInfractionModal = true;
  }

  async function submitInfraction() {
    if (!infractionData.reason) return alert("La raison est requise.");
    try {
      const { error } = await supabase.rpc('admin_add_infraction', {
        target_user_id: selectedUser.user_id,
        p_card_type: infractionData.type,
        p_reason: infractionData.reason
      });
      if (error) throw error;
      alert(`Carton ${infractionData.type === 'yellow' ? 'Jaune' : 'Rouge'} ajouté !`);
      showInfractionModal = false;
      loadUsers();
    } catch (e) {
      alert("Erreur: " + e.message);
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
    } catch (e) { console.error(e); } finally { historyData.loading = false; }
  }

  async function pardonInfraction(infractionId) {
    if (!confirm("Pardonner ce carton ?")) return;
    try {
      const { error } = await supabase.rpc('admin_pardon_infraction', { p_infraction_id: infractionId });
      if (error) throw error;
      await loadUsers();
      await openHistoryModal(selectedUser);
    } catch (e) { alert("Erreur: " + e.message); }
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
      resetData.status = "Succès ! Copiez le mot de passe.";
    } catch (e) {
      resetData.status = "Erreur: " + e.message;
    } finally {
      resetData.loading = false;
    }
  }

  function copyPassword() {
    navigator.clipboard.writeText(resetData.password);
    alert("Mot de passe copié !");
  }

  // --- UI HELPERS ---
  function getNextRole(current) {
    if (current === 'user') return { role: 'moderator', icon: Shield, label: 'Promouvoir Modérateur', color: 'text-purple-600' };
    if (current === 'moderator') return { role: 'admin', icon: ShieldAlert, label: 'Promouvoir Admin', color: 'text-blue-600' };
    return { role: 'user', icon: User, label: 'Rétrograder User', color: 'text-yellow-600' };
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Jamais';
    return new Date(dateStr).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' });
  }

  const inputClass = "block w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-blue-500 focus:border-blue-500 dark:text-white p-2.5";
  const labelClass = "block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300";

</script>

<div class="min-h-screen bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-10">
  
  <header class="sticky top-0 z-30 w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 rounded-b-3xl transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center gap-3">
      <div class="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
        <Shield size={24} />
      </div>
      <div>
        <h1 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Administration</h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:block">Gestion des utilisateurs et sanctions</p>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    
    <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <UserPlus size={20} class="text-blue-500"/> Créer un utilisateur
      </h2>
      
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div><label class={labelClass}>Email</label><input type="email" bind:value={newUser.email} class={inputClass} placeholder="user@baco.be"></div>
        <div><label class={labelClass}>Mot de passe</label><input type="text" bind:value={newUser.password} class={inputClass} placeholder="Secret123"></div>
        <div>
          <label class={labelClass}>Rôle</label>
          <select bind:value={newUser.role} class={inputClass}>
            <option value="user">Utilisateur</option>
            <option value="moderator">Modérateur</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        <button on:click={handleCreateUser} disabled={isCreating} class="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm transition-all disabled:opacity-50">
          {#if isCreating} <Loader2 class="animate-spin" size={18}/> {:else} <UserPlus size={18}/> Créer {/if}
        </button>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Utilisateur</th>
              <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Rôle</th>
              <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Statut</th>
              <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Cartons</th>
              <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Dernière Connexion</th>
              <th class="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
            {#if isLoading}
              <tr><td colspan="6" class="py-10 text-center"><Loader2 class="animate-spin mx-auto text-blue-500" /></td></tr>
            {:else}
              {#each users as user}
                {@const isBanned = user.banned_until && new Date(user.banned_until) > new Date()}
                {@const nextRoleData = getNextRole(user.role || 'user')}
                
                <tr class="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                  
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-4">
                      <img class="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-600 shadow-sm" src={user.avatar_url} alt="">
                      <div>
                        <div class="text-sm font-bold text-gray-900 dark:text-white">{user.full_name || user.email}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                      </div>
                    </div>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if user.role === 'admin'}
                      <span class="px-3 py-1 inline-flex text-xs font-bold rounded-full border bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-800 dark:border-blue-900">Admin</span>
                    {:else if user.role === 'moderator'}
                      <span class="px-3 py-1 inline-flex text-xs font-bold rounded-full border bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-800 dark:border-purple-900">Modérateur</span>
                    {:else}
                      <span class="px-3 py-1 inline-flex text-xs font-bold rounded-full border bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-950 dark:text-gray-600 dark:border-gray-800">Utilisateur</span>
                    {/if}
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if isBanned}
                      <span class="px-3 py-1 inline-flex text-xs font-bold rounded-full border bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-800 dark:border-red-900">Banni</span>
                    {:else}
                      <span class="px-3 py-1 inline-flex text-xs font-bold rounded-full border bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-800 dark:border-green-900">Actif</span>
                    {/if}
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                      {#if user.active_yellow_cards > 0}
                        <span class="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-bold text-sm"><FileWarning size={16}/> {user.active_yellow_cards}</span>
                      {/if}
                      {#if user.active_red_cards > 0}
                        <span class="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold text-sm"><AlertOctagon size={16}/> {user.active_red_cards}</span>
                      {/if}
                      {#if user.active_yellow_cards === 0 && user.active_red_cards === 0}
                        <span class="text-xs text-gray-400 opacity-60">Aucun</span>
                      {/if}
                    </div>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-700 dark:text-gray-300 font-mono">
                      {formatDate(user.last_sign_in_at)}
                    </span>
                  </td>

                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    {#if user.user_id !== currentAdminId}
                      <div class="flex justify-center gap-1">
                        <button on:click={() => openResetModal(user)} class="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Reset Password"><KeyRound size={16}/></button>
                        <button on:click={() => openInfractionModal(user)} class="p-2 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg" title="Infraction"><FileWarning size={16}/></button>
                        <button on:click={() => openHistoryModal(user)} class="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Historique"><History size={16}/></button>
                        <button on:click={() => handleChangeRole(user, nextRoleData.role)} class="p-2 {nextRoleData.color} hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg" title={nextRoleData.label}><svelte:component this={nextRoleData.icon} size={16} /></button>
                        {#if isBanned}
                          <button on:click={() => handleBanUser(user, false)} class="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title="Débannir"><UserCheck size={16}/></button>
                        {:else}
                          <button on:click={() => handleBanUser(user, true)} class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Bannir"><UserX size={16}/></button>
                        {/if}
                      </div>
                    {:else}
                      <span class="text-xs text-gray-400 italic">Vous</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>

  </main>

  {#if showInfractionModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-xl border border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Nouvelle Infraction</h3>
        <p class="text-sm text-gray-500 mb-4">Pour : <strong>{selectedUser.email}</strong></p>
        <div class="space-y-4">
          <div><label class={labelClass}>Type</label><select bind:value={infractionData.type} class={inputClass}><option value="yellow">Carton Jaune</option><option value="red">Carton Rouge</option></select></div>
          <div><label class={labelClass}>Raison</label><textarea bind:value={infractionData.reason} class="{inputClass} resize-none" rows="3"></textarea></div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button on:click={() => showInfractionModal = false} class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Annuler</button>
          <button on:click={submitInfraction} class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold">Confirmer</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showResetModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-xl border border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Réinitialiser le mot de passe</h3>
        <p class="text-sm text-gray-500 mb-4">Utilisateur : <strong>{selectedUser.email}</strong></p>
        <div class="mb-4">
          <label class={labelClass}>Nouveau mot de passe généré :</label>
          <div class="flex gap-2"><input type="text" readonly value={resetData.password} class="{inputClass} font-mono bg-gray-100 dark:bg-gray-900 text-center"><button on:click={copyPassword} class="p-2 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200"><Copy size={20}/></button></div>
        </div>
        {#if resetData.status}<p class="text-sm text-center mb-4 font-bold {resetData.status.includes('Succès') ? 'text-green-600' : 'text-blue-600'}">{resetData.status}</p>{/if}
        <div class="flex justify-end gap-3 mt-4">
          <button on:click={() => showResetModal = false} class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Fermer</button>
          <button on:click={confirmResetPassword} disabled={resetData.loading} class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50">{resetData.loading ? 'Envoi...' : 'Confirmer Reset'}</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showHistoryModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-xl border border-gray-200 dark:border-gray-700 max-h-[80vh] flex flex-col">
        <div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold text-gray-900 dark:text-white">Casier Judiciaire</h3><button on:click={() => showHistoryModal = false} class="text-gray-500 hover:text-gray-700"><X size={24}/></button></div>
        <div class="flex-grow overflow-y-auto space-y-3 pr-2">
          {#if historyData.loading}<div class="flex justify-center py-10"><Loader2 class="animate-spin text-blue-500"/></div>{:else if historyData.list.length === 0}<p class="text-center text-gray-500 py-4">Casier vierge.</p>{:else}
            {#each historyData.list as card}
              {@const isActive = card.is_active && (card.card_type === 'red' || new Date(card.expires_at) > new Date())}
              <div class="flex items-start gap-3 p-3 rounded-xl border {isActive ? 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600' : 'bg-gray-50 dark:bg-gray-900/50 border-transparent opacity-60'}">
                {#if card.card_type === 'yellow'}<FileWarning size={20} class="text-yellow-500 mt-1 flex-shrink-0"/>{:else}<AlertOctagon size={20} class="text-red-500 mt-1 flex-shrink-0"/>{/if}
                <div class="flex-grow"><p class="text-sm font-bold text-gray-900 dark:text-white">Carton {card.card_type === 'yellow' ? 'Jaune' : 'Rouge'}{#if !isActive} <span class="text-xs font-normal text-gray-500">(Inactif)</span> {/if}</p><p class="text-xs text-gray-600 dark:text-gray-300 italic">"{card.reason}"</p><p class="text-[10px] text-gray-400 mt-1">Par {card.admin?.full_name || 'Admin'} le {formatDate(card.created_at)}</p></div>
                {#if isActive}<button on:click={() => pardonInfraction(card.id)} class="text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 p-1 rounded" title="Pardonner"><CheckCircle size={18}/></button>{/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}

</div>