<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores'; 
  import { supabase } from '$lib/supabase';
  import { fly, fade } from 'svelte/transition';
  import { currentThemeId, themesConfig, applyTheme } from '$lib/stores/theme';
  import { 
    User, Mail, Shield, Camera, Lock, Save, 
    FileWarning, AlertOctagon, Loader2, CheckCircle,
    Tag, Cake, Calendar, Palette 
  } from 'lucide-svelte';
  
  // IMPORT TOAST
  import { toast } from '$lib/stores/toast';

  let { data } = $props();
  let session = $derived(data.session);
  
  // --- ÉTAT (Conversion en Runes) ---
  let isLoading = $state(true);
  let isSaving = $state(false);
  let isUploading = $state(false);

  // Utilisateurs
  let currentUser = $state(null); 
  let targetUserId = $state(null);

  // Le profil qu'on regarde
  let isMyProfile = $state(false);
  let isAdmin = $state(false);

  // Données Formulaire
  let profileData = $state({
    username: "",
    full_name: "",
    email: "", 
    role: "user",
    fonction: "", 
    birthday: null, 
    avatar_url: null,
    theme: "default"
  });

  // Mot de passe
  let passwordData = $state({ new: "", confirm: "" });

  // Infractions (Trust Meter)
  let infractions = $state([]);
  let trustScore = $state(100);
  let trustColor = $state("bg-green-500");
  let trustLabel = $state("Chargement...");

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    currentUser = user;

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    isAdmin = myProfile?.role === 'admin';
  });

  // --- LOGIQUE RÉACTIVE (Remplacement de $:) ---
  $effect(() => {
    if ($page.url.searchParams && currentUser) {
        const urlParams = $page.url.searchParams;
        const paramId = urlParams.get('id');
        const newTargetUserId = (paramId && paramId !== currentUser.id) ? paramId : currentUser.id;

        if (newTargetUserId !== targetUserId) {
            targetUserId = newTargetUserId;
            isMyProfile = targetUserId === currentUser.id;
            loadProfileData(); 
        }
    }
  });

  // --- CHARGEMENT ---
  async function loadProfileData() {
    isLoading = true;
    try {
        await Promise.all([
            loadTargetProfile(), 
            loadInfractions()
        ]);
    } catch (e) {
        console.error("Erreur chargement profil:", e);
        toast.error("Impossible de charger les données du profil.");
    } finally {
        isLoading = false;
    }
  }

  async function loadTargetProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url, role, fonction, birthday, theme') 
      .eq('id', targetUserId)
      .single();

    if (error) {
      toast.error("Profil introuvable.");
      return;
    }

    // Mise à jour de l'objet réactif
    Object.assign(profileData, data);

    if (isMyProfile) {
      profileData.email = currentUser.email;
    } else if (isAdmin) {
      try {
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
        birthday: profileData.birthday, 
        fonction: profileData.fonction, 
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

  async function saveTheme(themeKey) {
     if (!isMyProfile) return;
     
     // 1. Mise à jour immédiate (UI optimiste & Store)
     currentThemeId.set(themeKey);
     applyTheme(themeKey); // AJOUT : Applique le thème au DOM
     profileData.theme = themeKey;
     
     // 2. Persistance dans user_preferences (Source de vérité)
     try {
         // Mise à jour de user_preferences (prioritaire)
         const { error } = await supabase
            .from('user_preferences')
            .upsert({ 
                user_id: currentUser.id, 
                theme: themeKey,
                updated_at: new Date()
            }, { onConflict: 'user_id' });
            
         if (error) throw error;
         
         // On met aussi à jour le profil pour garder la trace (optionnel)
         await supabase
            .from('profiles')
            .update({ theme: themeKey })
            .eq('id', currentUser.id);

         toast.success(`Thème ${themesConfig[themeKey].name} appliqué !`);
     } catch (e) {
         toast.error("Erreur sauvegarde thème");
         console.error(e);
     }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    isUploading = true;
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Math.random()}.${ext}`;
      const filePath = `${targetUserId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicURL = urlData.publicUrl;

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicURL, updated_at: new Date() })
        .eq('id', targetUserId);

      if (dbError) throw dbError;

      profileData.avatar_url = publicURL;
      toast.success("Photo de profil mise à jour !");
      
    } catch (err) {
      console.error(err);
      toast.error("Échec de l'upload de l'avatar.");
    } finally {
      isUploading = false;
    }
  }

  async function handleChangePassword() {
    if (!isMyProfile) return;

    if (passwordData.new.length < 6) {
        return toast.warning("Le mot de passe doit faire 6 caractères min.");
    }
    if (passwordData.new !== passwordData.confirm) {
        return toast.warning("Les mots de passe ne correspondent pas.");
    }

    isSaving = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordData.new });
      if (error) throw error;

      toast.success("Mot de passe modifié avec succès !");
      passwordData = { new: "", confirm: "" };
    } catch (e) {
      toast.error("Erreur: " + e.message);
    } finally {
      isSaving = false;
    }
  }

  // --- TRUST METER ---
  async function loadInfractions() {
    const { data } = await supabase
      .from('infractions')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('is_active', true)
      .or('card_type.eq.red, and(card_type.eq.yellow,expires_at.gt.now())')
      .order('created_at', { ascending: false });

    infractions = data || [];
    calculateTrustScore();
  }

  function calculateTrustScore() {
    if (infractions.length === 0) {
      trustScore = 100;
      trustColor = "bg-green-500";
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
      trustColor = "bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)]";
      trustLabel = "Attention (Moyen)";
    } else if (totalPoints < 6) {
      trustColor = "bg-gradient-to-r from-orange-500 to-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.4)]";
      trustLabel = "Niveau Bas (Ban temporaire)";
    } else {
      trustColor = "bg-gradient-to-r from-red-600 to-red-700 shadow-[0_0_15px_rgba(220,38,38,0.4)]";
      trustLabel = "Critique (Compte Banni)";
    }
  }

 // Styles Inputs Glass Thémés
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:ring-2 focus:border-transparent transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  const labelClass = "block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-1";

  // --- STYLE DYNAMIQUE ---
  let borderClass = $derived(profileData.role === 'admin' 
      ? 'bg-gradient-to-br from-yellow-300/80 via-amber-400/50 to-yellow-500/80 shadow-[0_0_35px_rgba(245,158,11,0.6)] ring-1 ring-yellow-400/50' 
      : profileData.role === 'moderator'
      ? 'bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-[0_0_30px_rgba(168,85,247,0.6)] animate-pulse' 
      : 'bg-gradient-to-br from-[rgba(var(--color-primary),0.5)] to-purple-500/50 shadow-[0_0_30px_rgba(var(--color-primary),0.2)]');

</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex items-center justify-between pb-6 border-b border-white/5" in:fly={{ y: -20, duration: 600 }} style="--primary-rgb: var(--color-primary);">
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl border transition-all duration-500"
             style="background-color: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-color: rgba(var(--primary-rgb), 0.2); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);">
          <User size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight flex items-center gap-3">
            {#if isMyProfile} Mon Profil {:else} Profil de {profileData.full_name || 'Utilisateur'} {/if}
            {#if profileData.role === 'admin'}
              <span class="inline-flex items-center gap-1 px-3 py-1 bg-yellow-500/20 text-yellow-300 text-xs font-bold rounded-full uppercase border border-yellow-500/30">
                <Shield size={12} /> Admin
              </span>
            {/if}
          </h1>
          <p class="text-gray-500 text-sm mt-1">Gestion des informations personnelles et sécurité.</p>
        </div>
    </div>
  </header>

  {#if isLoading}
    <div class="flex justify-center py-20"><Loader2 class="animate-spin w-10 h-10 text-themed-muted" style="color: rgba(var(--color-primary), 0.5);" /></div>
  {:else}

    <main class="grid grid-cols-1 lg:grid-cols-2 gap-8" style="--primary-rgb: var(--color-primary);">
      
      <div class="space-y-8" in:fly={{ x: -20, duration: 600, delay: 100 }}>
        
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 relative overflow-hidden">
          <div class="absolute top-0 left-0 right-0 h-32 opacity-20 pointer-events-none" 
               style="background: linear-gradient(to b, rgb(var(--color-primary)), transparent);"></div>

          <div class="relative flex flex-col items-center mb-8">
            <div class="relative group">
                <div class="w-36 h-36 rounded-full p-1 transition-all duration-500 {borderClass}">
                    <img src={profileData.avatar_url || 'https://via.placeholder.com/150'} alt="Avatar" class="w-full h-full rounded-full object-cover border-4 border-[#0f1115]">
                </div>
                {#if isMyProfile || isAdmin}
                  <label class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white backdrop-blur-sm m-1">
                    {#if isUploading} <Loader2 class="animate-spin w-8 h-8"/> {:else} <Camera size={32} /> {/if}
                    <input type="file" class="hidden" accept="image/*" on:change={handleAvatarUpload} disabled={isUploading}>
                  </label>
                {/if}
            </div>
            
            <h2 class="text-2xl font-bold text-white mt-4">{profileData.full_name || 'Sans Nom'}</h2>
            <p class="text-gray-400 text-sm">@{profileData.username || 'username'}</p>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 gap-5">
              <div>
                <label class={labelClass}>Nom Complet</label>
                <div class="relative">
                    <User size={16} class="absolute left-3 top-3.5 text-gray-500" />
                    <input type="text" bind:value={profileData.full_name} class="{inputClass} pl-10" disabled={!isMyProfile && !isAdmin} style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
                </div>
              </div>
              
              <div>
                <label class={labelClass}>Date de Naissance</label>
                <div class="relative">
                  <Cake size={16} class="absolute left-3 top-3.5 text-gray-500" />
                  <input type="date" bind:value={profileData.birthday} class="{inputClass} pl-10 dark:[color-scheme:dark]" disabled={!isMyProfile && !isAdmin} style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
                </div>
              </div>

              <div>
                <label class={labelClass}>Email</label>
                <div class="relative">
                  <Mail size={16} class="absolute left-3 top-3.5 text-gray-500" />
                  <input type="text" value={profileData.email} class="{inputClass} pl-10" disabled>
                </div>
              </div>
   
              <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class={labelClass}>Fonction</label>
                    <div class="relative">
                      <Tag size={16} class="absolute left-3 top-3.5 text-gray-500" />
                      <select bind:value={profileData.fonction} class="{inputClass} pl-10 appearance-none" disabled={!isMyProfile && !isAdmin} style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
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
                      <input type="text" value={profileData.role.toUpperCase()} class="{inputClass} pl-10" disabled>
                    </div>
                  </div>
              </div>
            </div>

            {#if isMyProfile || isAdmin}
              <div class="pt-4 flex justify-end border-t border-white/5">
                <button 
                  on:click={handleUpdateProfile} 
                  disabled={isSaving}
                  class="btn-save px-6 py-2.5 text-white rounded-xl font-bold transition-all flex items-center gap-2 disabled:opacity-50 border border-white/10"
                >
                  {#if isAdmin && !isMyProfile} <Shield size={16}/> Enregistrer (Admin) {:else} <Save size={16}/> Enregistrer {/if}
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="space-y-8" in:fly={{ x: 20, duration: 600, delay: 200 }}>
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-sm relative overflow-hidden">
          <div class="absolute top-0 right-0 p-32 opacity-10 rounded-full blur-3xl pointer-events-none" style="background-color: rgb(var(--color-primary));"></div>
          
          <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
            <CheckCircle size={20} style="color: rgb(var(--color-primary));" /> Niveau de Confiance
          </h2>
          
          <div class="mb-8">
            <div class="w-full bg-black/40 rounded-full h-4 overflow-hidden border border-white/5 shadow-inner">
              <div class="h-4 rounded-full transition-all duration-1000 ease-out {trustColor} relative" style="width: {trustScore}%">
                <div class="absolute inset-0 bg-white/20 animate-pulse"></div>
              </div>
            </div>
            <div class="flex justify-between items-center mt-3 text-xs font-bold uppercase tracking-wide">
              <span class="text-gray-400">{trustLabel}</span>
              <span class="text-white bg-white/10 px-2 py-1 rounded border border-white/10">{trustScore}%</span>
            </div>
          </div>

          <div class="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {#if infractions.length === 0}
              <div class="text-center py-8 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                  <CheckCircle size={32} class="mx-auto opacity-30 mb-2" style="color: rgb(var(--color-primary));" />
                  <p class="text-sm text-gray-400">Aucune infraction active.</p>
              </div>
            {:else}
              {#each infractions as inf}
                <div class="flex items-start gap-4 p-4 bg-black/30 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  </div>
              {/each}
            {/if}
          </div>
        </div>

        {#if isMyProfile}
          <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-sm mt-8" in:fly={{ x: 20, duration: 600, delay: 300 }}>
            <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
              <Palette size={20} style="color: rgb(var(--color-primary));" /> Personnalisation
            </h2>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {#each Object.entries(themesConfig) as [key, theme]}
                    <button on:click={() => saveTheme(key)}
                        class="relative p-4 rounded-xl border transition-all duration-300 flex items-center gap-3 overflow-hidden group
                        {profileData.theme === key ? 'border-themed bg-white/5' : 'border-white/10 hover:border-white/30 bg-black/20'}">
                        <div class="flex -space-x-2">
                            <div class="w-6 h-6 rounded-full border border-white/20" style="background-color: rgb({theme.colors['--color-primary']})"></div>
                            <div class="w-6 h-6 rounded-full border border-white/20" style="background: linear-gradient(135deg, {theme.colors['--bg-gradient-from']}, {theme.colors['--bg-gradient-to']})"></div>
                        </div>
                        <span class="text-sm font-bold {profileData.theme === key ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}">{theme.name}</span>
                        {#if profileData.theme === key}
                            <div class="absolute inset-0 opacity-10 blur-xl" style="background-color: rgb(var(--color-primary));"></div>
                        {/if}
                    </button>
                {/each}
            </div>
          </div>
        {/if}
      </div>
    </main>
  {/if}
</div>

<style>
  .btn-save {
    background-color: rgba(var(--primary-rgb), 0.8);
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);
  }
  .btn-save:hover:not(:disabled) {
    background-color: rgb(var(--primary-rgb));
    box-shadow: 0 0 25px rgba(var(--primary-rgb), 0.5);
    transform: translateY(-1px);
  }
  .border-themed {
    border-color: rgb(var(--primary-rgb));
    box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.2);
  }
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>