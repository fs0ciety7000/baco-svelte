<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores'; 
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';
  import { 
    User, Mail, Shield, Camera, Lock, Save, 
    FileWarning, AlertOctagon, Loader2, CheckCircle,
    Tag, Cake, ChevronLeft, Copy, KeyRound, UserX, UserCheck,
    Plus, X, History
  } from 'lucide-svelte';
  
  // IMPORT TOAST
  import { toast } from '$lib/stores/toast.js';

  // --- ÉTAT ---
  let isLoading = true;
  let isSaving = false;
  let isUploading = false;
  let targetUserId = $page.params.id;

  // Données Profil
  let profileData = {
    username: "",
    full_name: "",
    email: "", 
    role: "user",
    fonction: "", 
    birthday: null, 
    avatar_url: null,
    banned_until: null
  };

  // Infractions (Trust Meter)
  let infractions = [];
  let trustScore = 100;
  let trustColor = "bg-green-500";
  let trustLabel = "Chargement...";

  // Gestion Infractions (Modal)
  let showInfractionModal = false;
  let infractionData = { type: 'yellow', reason: '' };
  let infractionLoading = false;

  // Reset Password Admin
  let generatedPassword = "";
  let resetLoading = false;

  onMount(async () => {
    await checkAdminAccess();
    await loadProfileData();
  });

  async function checkAdminAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return goto('/');
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return goto('/');
  }

  // --- CHARGEMENT DES DONNÉES ---
  async function loadProfileData() {
    isLoading = true;
    try {
        // 1. Charger le profil
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', targetUserId)
            .single();
        
        if (error) throw error;
        profileData = { ...profileData, ...data };

        // 2. Charger l'email (via RPC car table auth protégée)
        const { data: email } = await supabase.rpc('admin_get_user_email', { p_user_id: targetUserId });
        profileData.email = email || "Non accessible";

        // 3. Charger les infractions
        await loadInfractions();

    } catch (e) {
        console.error("Erreur chargement:", e);
        toast.error("Impossible de charger ce profil.");
    } finally {
        isLoading = false;
    }
  }

  // --- SAUVEGARDE GLOBALE (Profil) ---
  async function handleUpdateProfile() {
    isSaving = true;
    try {
      const updates = {
        username: profileData.username,
        full_name: profileData.full_name,
        birthday: profileData.birthday, 
        fonction: profileData.fonction, 
        role: profileData.role, 
        updated_at: new Date()
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', targetUserId);

      if (error) throw error;
      toast.success("Profil mis à jour avec succès !");
    } catch (e) {
      toast.error("Erreur: " + e.message);
    } finally {
      isSaving = false;
    }
  }

  // --- GESTION AVATAR ---
  async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    isUploading = true;
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${targetUserId}/${Math.random()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicURL = urlData.publicUrl;

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicURL, updated_at: new Date() })
        .eq('id', targetUserId);
      if (dbError) throw dbError;

      profileData.avatar_url = publicURL;
      toast.success("Avatar mis à jour !");
    } catch (err) {
      console.error(err);
      toast.error("Échec de l'upload.");
    } finally {
      isUploading = false;
    }
  }

  // --- GESTION DES SANCTIONS (NOUVEAU) ---
  
  // 1. Ouvrir la modale
  function openAddInfraction() {
      infractionData = { type: 'yellow', reason: '' };
      showInfractionModal = true;
  }

  // 2. Soumettre une nouvelle sanction
  async function submitInfraction() {
      if (!infractionData.reason) return toast.warning("Le motif est obligatoire.");
      infractionLoading = true;
      
      try {
          const { error } = await supabase.rpc('admin_add_infraction', {
              target_user_id: targetUserId,
              p_card_type: infractionData.type,
              p_reason: infractionData.reason
          });

          if (error) throw error;

          toast.success("Sanction appliquée !");
          showInfractionModal = false;
          await loadInfractions(); // Recharger pour voir l'impact sur le score
      } catch (e) {
          toast.error("Erreur: " + e.message);
      } finally {
          infractionLoading = false;
      }
  }

  // 3. Pardonner une sanction
  async function pardonInfraction(infractionId) {
      if (!confirm("Voulez-vous pardonner cette sanction ? Elle ne comptera plus dans le score.")) return;

      try {
          const { error } = await supabase.rpc('admin_pardon_infraction', { p_infraction_id: infractionId });
          if (error) throw error;
          
          toast.success("Sanction pardonnée.");
          await loadInfractions(); // Recalculer le score
      } catch (e) {
          toast.error("Erreur: " + e.message);
      }
  }

  // --- ACTIONS ADMIN (RESET & BAN) ---
  async function handleResetPassword() {
    if (!confirm("Voulez-vous générer un nouveau mot de passe pour cet utilisateur ?")) return;
    
    resetLoading = true;
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    const newPass = Array(12).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');

    try {
        const { error } = await supabase.rpc('admin_reset_user_password', {
            user_id_to_reset: targetUserId,
            new_password: newPass
        });
        if (error) throw error;
        generatedPassword = newPass;
        toast.success("Nouveau mot de passe généré !");
    } catch (e) {
        toast.error("Erreur reset: " + e.message);
    } finally {
        resetLoading = false;
    }
  }

  async function toggleBan() {
    const isBanned = !!profileData.banned_until;
    const action = isBanned ? "Débannir" : "Bannir";
    
    if (!confirm(`${action} cet utilisateur ?`)) return;

    try {
        const updates = {
            banned_until: isBanned ? null : new Date(new Date().setFullYear(new Date().getFullYear() + 100)).toISOString(),
            banned_until_status: isBanned ? null : 'banned'
        };

        const { error } = await supabase.from('profiles').update(updates).eq('id', targetUserId);
        if (error) throw error;
        
        profileData.banned_until = updates.banned_until;
        toast.success(`Utilisateur ${isBanned ? 'débanni' : 'banni'} !`);
        // On recharge aussi les infractions car un ban peut impacter l'état global
        loadInfractions(); 
    } catch(e) {
        toast.error("Erreur: " + e.message);
    }
  }

  function copyPassword() {
    navigator.clipboard.writeText(generatedPassword);
    toast.success("Mot de passe copié !");
  }

  // --- LOGIQUE TRUST METER ---
  async function loadInfractions() {
    // On charge TOUTES les infractions (actives et inactives) pour l'historique
    const { data } = await supabase
      .from('infractions')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });
    
    infractions = data || [];
    calculateTrustScore();
  }

  function calculateTrustScore() {
    // On ne compte que les actives pour le score
    const activeInfractions = infractions.filter(i => {
        if (!i.is_active) return false;
        if (i.card_type === 'red') return true;
        // Carton jaune expire après X temps (dépend de votre logique DB, ici on suppose que is_active suffit ou on vérifie expires_at)
        return new Date(i.expires_at) > new Date();
    });

    if (activeInfractions.length === 0) {
      trustScore = 100;
      trustColor = "bg-gradient-to-r from-green-400 to-green-600 shadow-[0_0_15px_rgba(34,197,94,0.4)]";
      trustLabel = "Dossier impeccable !";
      return;
    }

    let yellow = 0, red = 0;
    const MAX_POINTS = 6;
    activeInfractions.forEach(i => {
      if (i.card_type === 'yellow') yellow++;
      if (i.card_type === 'red') red++;
    });
    
    const totalPoints = (red * MAX_POINTS) + yellow;
    let percentage = 100 - ((totalPoints / MAX_POINTS) * 100);
    if (percentage < 0) percentage = 0;
    trustScore = Math.round(percentage);

    if (totalPoints < 3) {
      trustColor = "bg-gradient-to-r from-yellow-300 to-yellow-500";
      trustLabel = "Attention (Moyen)";
    } else if (totalPoints < 6) {
      trustColor = "bg-gradient-to-r from-orange-500 to-orange-600";
      trustLabel = "Niveau Bas";
    } else {
      trustColor = "bg-gradient-to-r from-red-600 to-red-700";
      trustLabel = "Critique";
    }
  }

  // Styles CSS
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none disabled:opacity-50";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 ml-1";


  // --- STYLE DYNAMIQUE ---
  $: borderClass = profileData.role === 'admin' 
      ? 'bg-gradient-to-br from-yellow-300/80 via-amber-400/50 to-yellow-500/80 shadow-[0_0_35px_rgba(245,158,11,0.6)] ring-1 ring-yellow-400/50' 
      : profileData.role === 'moderator'
      ? 'bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-[0_0_30px_rgba(168,85,247,0.6)] animate-pulse' 
      : 'bg-gradient-to-br from-blue-500/50 to-purple-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]';

</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
<header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <button on:click={() => goto('/admin')} class="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 transition-colors mr-2">
            <ChevronLeft size={24} />
        </button>
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Shield size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight flex items-center gap-3">
            Édition du profil de <span class="text-blue-400">{profileData.full_name || 'Utilisateur'}</span>
            
            {#if profileData.role === 'admin'}
              <span class="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-bold rounded-full uppercase border border-blue-500/30">Admin</span>
            {/if}
          </h1>
          <p class="text-gray-500 text-sm mt-1">Gestion complète du profil et des sanctions.</p>
        </div>
    </div>
  </header>

  {#if isLoading}
    <div class="flex justify-center py-20"><Loader2 class="animate-spin w-10 h-10 text-blue-500/50" /></div>
  {:else}

    <main class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      <div class="space-y-8" in:fly={{ x: -20, duration: 600, delay: 100 }}>
        
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 relative overflow-hidden">
          <div class="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none"></div>

         <div class="relative flex flex-col items-center mb-8">
    <div class="relative group">
        <div class="w-36 h-36 rounded-full p-1 transition-all duration-500 {borderClass}">
            <img 
            src={profileData.avatar_url || 'https://via.placeholder.com/150'} 
            alt="Avatar" 
            class="w-full h-full rounded-full object-cover border-4 border-[#0f1115]"
            >
        </div>
        <label class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white backdrop-blur-sm m-1">
            {#if isUploading} <Loader2 class="animate-spin w-8 h-8"/> {:else} <Camera size={32} /> {/if}
            <input type="file" class="hidden" accept="image/*" on:change={handleAvatarUpload} disabled={isUploading}>
        </label>
    </div>
            
            <h2 class="text-2xl font-bold text-white mt-4">{profileData.full_name || 'Sans Nom'}</h2>
            <div class="flex items-center gap-2 mt-1">
                <p class="text-gray-400 text-sm">@{profileData.username || 'username'}</p>
                <p class="text-gray-600 text-xs bg-black/40 px-2 py-0.5 rounded font-mono select-all">{targetUserId}</p>
            </div>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 gap-5">
              <div>
                <label class={labelClass}>Username</label>
                <div class="relative">
                    <User size={16} class="absolute left-3 top-3.5 text-gray-500" />
                    <input type="text" bind:value={profileData.username} class="{inputClass} pl-10">
                </div>
              </div>
              <div>
                <label class={labelClass}>Nom Complet</label>
                <div class="relative">
                    <Tag size={16} class="absolute left-3 top-3.5 text-gray-500" />
                    <input type="text" bind:value={profileData.full_name} class="{inputClass} pl-10">
                </div>
              </div>
              <div>
                <label class={labelClass}>Date de Naissance</label>
                <div class="relative">
                  <Cake size={16} class="absolute left-3 top-3.5 text-gray-500" />
                  <input type="date" bind:value={profileData.birthday} class="{inputClass} pl-10 dark:[color-scheme:dark]">
                </div>
              </div>
              <div>
                <label class={labelClass}>Email (Compte)</label>
                <div class="relative">
                  <Mail size={16} class="absolute left-3 top-3.5 text-gray-500" />
                  <input type="text" value={profileData.email} class="{inputClass} pl-10 cursor-not-allowed opacity-70" disabled>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class={labelClass}>Fonction</label>
                    <div class="relative">
                      <Tag size={16} class="absolute left-3 top-3.5 text-gray-500" />
                      <select bind:value={profileData.fonction} class="{inputClass} pl-10 appearance-none">
                          <option value={null} class="bg-gray-900 text-gray-400">-- Non spécifié --</option>
                          <option value="PACO" class="bg-gray-900">PACO</option>
                          <option value="RCCA" class="bg-gray-900">RCCA</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label class={labelClass}>Rôle</label>
                    <div class="relative">
                      <Shield size={16} class="absolute left-3 top-3.5 text-gray-500" />
                      <select bind:value={profileData.role} class="{inputClass} pl-10 appearance-none capitalize">
                          <option value="user" class="bg-gray-900">User</option>
                          <option value="moderator" class="bg-gray-900">Modérateur</option>
                          <option value="admin" class="bg-gray-900">Admin</option>
                      </select>
                    </div>
                  </div>
              </div>
            </div>

            <div class="pt-4 flex justify-end border-t border-white/5">
                <button 
                  on:click={handleUpdateProfile} 
                  disabled={isSaving}
                  class="px-6 py-2.5 bg-blue-600/80 hover:bg-blue-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all flex items-center gap-2 disabled:opacity-50 border border-blue-500/30"
                >
                  {#if isSaving} <Loader2 class="animate-spin w-4 h-4"/> {:else} <Save size={16}/> {/if}
                  Enregistrer
                </button>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-8" in:fly={{ x: 20, duration: 600, delay: 200 }}>
        
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-sm relative overflow-hidden">
          <div class="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div class="flex justify-between items-center mb-6">
              <h2 class="text-lg font-bold text-gray-200 flex items-center gap-2">
                <CheckCircle size={20} class="text-blue-400" /> Niveau de Confiance
              </h2>
              <button 
                on:click={openAddInfraction}
                class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold rounded-lg text-gray-300 hover:text-white transition-colors flex items-center gap-2"
              >
                  <Plus size={14}/> Ajouter sanction
              </button>
          </div>
          
          <div class="mb-8">
            <div class="w-full bg-black/40 rounded-full h-4 overflow-hidden border border-white/5 shadow-inner">
              <div class="h-4 rounded-full transition-all duration-1000 ease-out {trustColor} relative" style="width: {trustScore}%"></div>
            </div>
            <div class="flex justify-between items-center mt-3 text-xs font-bold uppercase tracking-wide">
              <span class="text-gray-400">{trustLabel}</span>
              <span class="text-white bg-white/10 px-2 py-1 rounded border border-white/10">{trustScore}%</span>
            </div>
          </div>

          <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><History size={12}/> Historique</h3>
          
          <div class="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {#if infractions.length === 0}
               <div class="text-center py-6 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                  <p class="text-xs text-gray-500">Aucune infraction enregistrée.</p>
              </div>
            {:else}
              {#each infractions as inf}
                {@const isActive = inf.is_active && (inf.card_type === 'red' || new Date(inf.expires_at) > new Date())}
                
                <div class="flex items-start gap-3 p-3 rounded-xl border transition-colors {isActive ? 'bg-black/30 border-white/10' : 'bg-black/10 border-transparent opacity-60'}">
                  {#if inf.card_type === 'yellow'}
                    <div class="p-1.5 bg-yellow-500/10 rounded border border-yellow-500/20 text-yellow-500 flex-shrink-0"><FileWarning size={16}/></div>
                  {:else}
                    <div class="p-1.5 bg-red-500/10 rounded border border-red-500/20 text-red-500 flex-shrink-0"><AlertOctagon size={16}/></div>
                  {/if}
                  
                  <div class="flex-grow min-w-0">
                    <p class="text-sm font-bold text-gray-300 flex items-center gap-2">
                        {inf.card_type === 'yellow' ? 'Carton Jaune' : 'Carton Rouge'}
                        {#if !isActive}
                            <span class="px-1.5 py-0.5 bg-white/5 text-[10px] text-gray-500 rounded border border-white/5">Inactif</span>
                        {/if}
                    </p>
                    <p class="text-xs text-gray-500 italic truncate">"{inf.reason}"</p>
                    <p class="text-[10px] text-gray-600 mt-1">{new Date(inf.created_at).toLocaleDateString()}</p>
                  </div>

                  {#if isActive}
                    <button 
                        on:click={() => pardonInfraction(inf.id)}
                        class="p-2 text-green-600 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors" 
                        title="Pardonner / Désactiver"
                    >
                        <CheckCircle size={16} />
                    </button>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="bg-black/20 border border-red-500/10 rounded-3xl p-8 shadow-sm relative">
            <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
              <Lock size={20} class="text-red-400" /> Zone Admin
            </h2>

            <div class="space-y-6">
                <div>
                    <label class={labelClass}>Réinitialisation Mot de passe</label>
                    {#if generatedPassword}
                        <div class="flex gap-2 mt-2 animate-in fade-in slide-in-from-top-2">
                            <input type="text" readonly value={generatedPassword} class="{inputClass} font-mono text-center text-green-400 bg-green-500/10 border-green-500/20">
                            <button on:click={copyPassword} class="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-gray-300 transition-colors" title="Copier">
                                <Copy size={20}/>
                            </button>
                        </div>
                        <p class="text-[10px] text-green-500/70 mt-2 text-center">Mot de passe changé ! Copiez-le avant de quitter.</p>
                    {:else}
                        <button 
                            on:click={handleResetPassword}
                            disabled={resetLoading}
                            class="w-full mt-2 py-3 bg-white/5 border border-white/10 text-gray-300 rounded-xl font-bold hover:bg-white/10 hover:text-white transition-all shadow-sm flex justify-center gap-2"
                        >
                            {#if resetLoading} <Loader2 class="animate-spin w-5 h-5"/> {:else} <KeyRound size={20}/> {/if}
                            Générer un nouveau mot de passe
                        </button>
                    {/if}
                </div>

                <div class="h-px bg-white/5"></div>

                <div>
                    <label class={labelClass}>Accès Compte</label>
                    <button 
                        on:click={toggleBan}
                        class="w-full mt-2 py-3 rounded-xl font-bold transition-all shadow-sm flex justify-center gap-2 border {profileData.banned_until ? 'bg-green-600/20 text-green-400 border-green-500/30 hover:bg-green-600/30' : 'bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600/30'}"
                    >
                        {#if profileData.banned_until}
                            <UserCheck size={20}/> Débannir l'utilisateur
                        {:else}
                            <UserX size={20}/> Bannir l'utilisateur
                        {/if}
                    </button>
                </div>
            </div>
        </div>

      </div>
    </main>

  {/if}

  {#if showInfractionModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
      <div class="bg-[#0f1115] w-full max-w-md rounded-2xl p-6 shadow-2xl border border-white/10 ring-1 ring-white/5" transition:fly={{ y: 20 }}>
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-lg font-bold text-gray-200">Ajouter une sanction</h3>
            <button on:click={() => showInfractionModal = false} class="text-gray-500 hover:text-white transition-colors"><X size={20}/></button>
        </div>

        <div class="space-y-4">
          <div>
              <label class={labelClass}>Type de carton</label>
              <div class="grid grid-cols-2 gap-3">
                  <button 
                    on:click={() => infractionData.type = 'yellow'}
                    class="p-3 rounded-xl border flex flex-col items-center gap-2 transition-all {infractionData.type === 'yellow' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-black/40 border-white/10 text-gray-500 hover:bg-white/5'}"
                  >
                      <FileWarning size={24}/>
                      <span class="text-sm font-bold">Jaune</span>
                  </button>
                  <button 
                    on:click={() => infractionData.type = 'red'}
                    class="p-3 rounded-xl border flex flex-col items-center gap-2 transition-all {infractionData.type === 'red' ? 'bg-red-600/20 border-red-600 text-red-400' : 'bg-black/40 border-white/10 text-gray-500 hover:bg-white/5'}"
                  >
                      <AlertOctagon size={24}/>
                      <span class="text-sm font-bold">Rouge</span>
                  </button>
              </div>
          </div>
          
          <div>
              <label class={labelClass}>Raison / Motif</label>
              <textarea 
                bind:value={infractionData.reason} 
                class="{inputClass} resize-none min-h-[100px]" 
                placeholder="Ex: Absence injustifiée, comportement inapproprié..."
              ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
          <button on:click={() => showInfractionModal = false} class="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">Annuler</button>
          <button 
            on:click={submitInfraction} 
            disabled={infractionLoading}
            class="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {#if infractionLoading} <Loader2 class="animate-spin w-4 h-4"/> {/if}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  {/if}

</div>