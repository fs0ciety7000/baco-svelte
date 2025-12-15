<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { 
    User, Mail, Shield, Camera, Lock, Save, 
    FileWarning, AlertOctagon, Loader2, CheckCircle,
    // --- AJOUT DE TAG ICI ---
    Tag 
  } from 'lucide-svelte';
// --- ÉTAT ---
  let isLoading = true;
  let isSaving = false;
  let isUploading = false;
// Utilisateurs
  let currentUser = null; // Moi (session)
  let targetUserId = null;
// Le profil qu'on regarde
  let isMyProfile = false;
  let isAdmin = false;
// Données Formulaire
  let profileData = {
    username: "",
    full_name: "",
    email: "", // Traitement spécial
    role: "user",
    fonction: "", // <-- AJOUT DE LA FONCTION
    avatar_url: null
  };
// Mot de passe
  let passwordData = { new: "", confirm: "" };
// Infractions (Trust Meter)
  let infractions = [];
  let trustScore = 100;
  let trustColor = "bg-green-500";
  let trustLabel = "Chargement...";

  onMount(async () => {
    await initProfile();
  });
// --- INITIALISATION ---

  async function initProfile() {
    try {
      // 1. Qui suis-je ?
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
// Redirection login gérée ailleurs normalement
      currentUser = user;
// Vérifier mon rôle (Admin ?)
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      isAdmin = myProfile?.role === 'admin';

      // 2. Qui regarde-t-on ?
// Récupérer l'ID depuis l'URL (?id=...) ou utiliser le mien
      const urlParams = new URLSearchParams(window.location.search);
      const paramId = urlParams.get('id');
      
      if (paramId && paramId !== user.id) {
        targetUserId = paramId;
        isMyProfile = false;
      } else {
        targetUserId = user.id;
        isMyProfile = true;
      }

      // 3. Charger le profil cible
      await loadTargetProfile();
      await loadInfractions();

    } catch (e) {
      console.error("Erreur init:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadTargetProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url, role, fonction') // <-- AJOUT DE FONCTION DANS LE SELECT
      .eq('id', targetUserId)
      .single();
    if (error) {
      alert("Profil introuvable.");
      return;
    }

    profileData = { ...profileData, ...data };
// Gestion Email (Confidentiel sauf si c'est moi ou si Admin via RPC)
    if (isMyProfile) {
      profileData.email = currentUser.email;
    } else if (isAdmin) {
      try {
        // Supposons que vous ayez cette fonction RPC comme dans le script original
        const { data: email } = await supabase.rpc('admin_get_user_email', { p_user_id: targetUserId });
        profileData.email = email || "Email non accessible";
      } catch {
        profileData.email = "Erreur récupération email";
      }
    } else {
      profileData.email = "Confidentiel";
    }
  }

  // --- ACTIONS ---

  async function handleUpdateProfile() {
    if (!isMyProfile && !isAdmin) return;
    isSaving = true;

    try {
      const updates = {
        username: profileData.username,
        full_name: profileData.full_name,
        // N'oubliez pas d'ajouter la fonction si elle est modifiable, sinon ce n'est pas nécessaire ici.
        updated_at: new Date()
      };
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', targetUserId);
      if (error) throw error;
      alert("Profil mis à jour avec succès !");
    } catch (e) {
      alert("Erreur: " + e.message);
    } finally {
      isSaving = false;
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    isUploading = true;
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Math.random()}.${ext}`;
      const filePath = `${targetUserId}/${fileName}`; // Dossier par user

      // Upload
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      // URL Publique
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicURL = urlData.publicUrl;

      // Update DB
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicURL, updated_at: new Date() })
        .eq('id', targetUserId);
      if (dbError) throw dbError;

      profileData.avatar_url = publicURL; // Refresh UI
      
    } catch (err) {
      console.error(err);
      alert("Échec de l'upload de l'avatar.");
    } finally {
      isUploading = false;
    }
  }

  async function handleChangePassword() {
    if (!isMyProfile) return;
    if (passwordData.new.length < 6) return alert("Le mot de passe doit faire 6 caractères min.");
    if (passwordData.new !== passwordData.confirm) return alert("Les mots de passe ne correspondent pas.");

    isSaving = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordData.new });
      if (error) throw error;
      alert("Mot de passe modifié !");
      passwordData = { new: "", confirm: "" };
    } catch (e) {
      alert("Erreur: " + e.message);
    } finally {
      isSaving = false;
    }
  }

  // --- INFRACTIONS & TRUST METER ---

  async function loadInfractions() {
    const { data } = await supabase
      .from('infractions')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('is_active', true)
      // Filtre complexe repris du JS original (Red OR (Yellow AND not expired))
      .or('card_type.eq.red, and(card_type.eq.yellow,expires_at.gt.now())')
      .order('created_at', { ascending: false });
    infractions = data || [];
    calculateTrustScore();
  }

  function calculateTrustScore() {
    if (infractions.length === 0) {
      trustScore = 100;
      trustColor = "bg-gradient-to-r from-green-400 to-green-600";
      trustLabel = "Dossier impeccable !";
      return;
    }

    let yellow = 0, red = 0;
    const MAX_POINTS = 6;
    infractions.forEach(i => {
      if (i.card_type === 'yellow') yellow++;
      if (i.card_type === 'red') red++;
    });
    const totalPoints = (red * MAX_POINTS) + yellow;
    let percentage = 100 - ((totalPoints / MAX_POINTS) * 100);
    if (percentage < 0) percentage = 0;

    trustScore = Math.round(percentage);
    if (totalPoints < 3) {
      trustColor = "bg-gradient-to-r from-yellow-300 to-yellow-400";
      trustLabel = "Attention (Moyen)";
    } else if (totalPoints < 6) {
      trustColor = "bg-gradient-to-r from-orange-500 to-orange-600";
      trustLabel = "Niveau Bas (Ban temporaire)";
    } else {
      trustColor = "bg-gradient-to-r from-red-600 to-red-700";
      trustLabel = "Critique (Compte Banni)";
    }
  }

  // --- UI HELPERS ---
  const inputClass = "block w-full rounded-2xl border-gray-200 bg-white p-3 text-sm font-medium focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 transition-shadow shadow-sm disabled:bg-gray-100 dark:disabled:bg-gray-700/50 disabled:text-gray-500";
  const labelClass = "block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide";
</script>

<div class="min-h-screen bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-10">
  
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight flex items-center gap-3">
        {#if isMyProfile} Mon Profil {:else} Profil de {profileData.full_name || 'Utilisateur'} {/if}
        {#if profileData.role === 'admin'}
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full uppercase shadow-sm">
            <Shield size={12} /> Admin
          </span>
        {/if}
      </h1>
    </div>

    {#if isLoading}
      <div class="flex justify-center py-20"><Loader2 class="animate-spin text-blue-600" /></div>
    {:else}
  
     
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <div class="space-y-8">
          
          <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full">
            
            <div class="flex flex-col items-center mb-8">
            
              <div class="relative group">
                <img 
                  src={profileData.avatar_url || 'https://via.placeholder.com/128'} 
                  alt="Avatar" 
                  class="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-700 shadow-md"
                >
                {#if isMyProfile || isAdmin}
                  <label class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                    {#if isUploading} <Loader2 class="animate-spin"/> {:else} <Camera size={32} /> {/if}
                    <input type="file" class="hidden" accept="image/*" on:change={handleAvatarUpload} disabled={isUploading}>
                  </label>
                {/if}
              </div>
            </div>

            <div class="space-y-5">
              <div class="grid grid-cols-1 gap-5">
                <div>
           
                  <label class={labelClass}>Nom d'utilisateur</label>
                  <input type="text" bind:value={profileData.username} class={inputClass} disabled={!isMyProfile && !isAdmin}>
                </div>
                <div>
                  <label class={labelClass}>Nom Complet</label>
               
                  <input type="text" bind:value={profileData.full_name} class={inputClass} disabled={!isMyProfile && !isAdmin}>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-5">
                <div>
                  <label class={labelClass}>Email</label>
         
                  <div class="relative">
                    <Mail size={16} class="absolute left-3 top-3.5 text-gray-400" />
                    <input type="text" value={profileData.email} class="{inputClass} pl-10" disabled>
                  </div>
                </div>
     
                <div>
                  <label class={labelClass}>Fonction</label>
                  <div class="relative">
                    <Tag size={16} class="absolute left-3 top-3.5 text-gray-400" />
                    <input type="text" value={profileData.fonction.toUpperCase() || 'N/A'} class="{inputClass} pl-10" disabled={!isMyProfile && !isAdmin}>
                  </div>
                </div>
                <div>
                  <label class={labelClass}>Rôle</label>
                  <div class="relative">
                    <Shield size={16} class="absolute left-3 top-3.5 text-gray-400" />
                    <input type="text" value={profileData.role.toUpperCase()} class="{inputClass} pl-10" 
                      disabled>
                  </div>
                </div>
              </div>

              {#if isMyProfile || isAdmin}
                <div class="pt-4 flex justify-end">
                  <button 
                    on:click={handleUpdateProfile} 
                    disabled={isSaving}
                    class="px-6 
                      py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {#if isAdmin && !isMyProfile} <Shield size={16}/> Enregistrer (Admin) {:else} <Save size={16}/> Enregistrer {/if}
                  </button>
                </div>
     
              {/if}
            </div>
          </div>

        </div>

        <div class="space-y-8">
          
          <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
    
              <CheckCircle size={20} class="text-blue-500" /> Niveau de Confiance
            </h2>
            
            <div class="mb-4">
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden shadow-inner">
                <div 
         
                  class="h-4 rounded-full transition-all duration-1000 ease-out {trustColor}" 
                  style="width: {trustScore}%"
                ></div>
              </div>
              <div class="flex justify-between items-center mt-2 text-xs font-bold">
                
                <span class="text-gray-500 dark:text-gray-400">{trustLabel}</span>
                <span class="text-gray-900 dark:text-white">{trustScore}%</span>
              </div>
            </div>

            <div class="space-y-3 max-h-60 overflow-y-auto pr-1">
              {#if infractions.length === 0}
                <p class="text-sm text-gray-500 dark:text-gray-400 italic 
                  text-center py-4">Aucune infraction active.</p>
              {:else}
                {#each infractions as inf}
                  <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                    {#if inf.card_type === 'yellow'}
             
                      <FileWarning size={20} class="text-yellow-500 mt-0.5 flex-shrink-0" />
                    {:else}
                      <AlertOctagon size={20} class="text-red-500 mt-0.5 flex-shrink-0" />
                    {/if}
                   
                    <div>
                      <p class="text-sm font-bold text-gray-800 dark:text-gray-200">
                        Carton {inf.card_type === 'yellow' ? 'Jaune' : 'Rouge'}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400 italic">"{inf.reason}"</p>
                      <p class="text-[10px] text-gray-400 mt-1">{new Date(inf.created_at).toLocaleDateString()}</p>
                    </div>
    
                  </div>
                {/each}
              {/if}
            </div>
          </div>

          {#if isMyProfile}
            <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
   
              <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Lock size={20} class="text-blue-500" /> Sécurité
              </h2>
              <div class="space-y-4">
                <div>
                
                  <label class={labelClass}>Nouveau mot de passe</label>
                  <input type="password" bind:value={passwordData.new} class={inputClass}>
                </div>
                <div>
                  <label class={labelClass}>Confirmer</label>
                  <input type="password" bind:value={passwordData.confirm} class={inputClass}>
 
                </div>
                <button 
                  on:click={handleChangePassword} 
                  disabled={isSaving}
                  class="w-full py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
   
                >
                  Changer le mot de passe
                </button>
              </div>
            </div>
          {/if}

        </div>
     
      </div>

    {/if}
  </main>
</div>