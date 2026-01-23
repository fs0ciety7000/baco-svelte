<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { 
        User, Mail, Shield, Camera, Lock, Save, LogOut,
        Loader2, CheckCircle, Tag, Cake, Palette, 
        Briefcase, Hash, Building, MapPin, Smartphone, Phone, FileText 
    } from 'lucide-svelte';
  
    // Stores & Libs
    import { toast } from '$lib/stores/toast';
    import { supabase } from '$lib/supabase';
    import { currentThemeId, themesConfig, applyTheme } from '$lib/stores/theme';
    import { ProfileService } from '$lib/services/profile.service.js';

    // --- ÉTAT (RUNES) ---
    let isLoading = $state(true);
    let isSaving = $state(false);
    let isUploading = $state(false);

    // Utilisateurs
    let currentUser = $state(null); 
    let targetUserId = $state(null);
    let isMyProfile = $state(false);
    let isAdmin = $state(false);

    // Données Profil (Fusion Business + Technique)
    let profileData = $state({
        username: "", full_name: "", email: "", role: "user",
        // Business
       fonction: "",
      
        birthday: null, avatar_url: null, theme: "default"
    });

    // Mot de passe
    let passwordData = $state({ new: "", confirm: "" });

    // Trust Meter
    let infractions = $state([]);
    let trustScore = $state(100);
    let trustColor = $state("bg-green-500");
    let trustLabel = $state("Chargement...");

    // --- STYLE DYNAMIQUE (Basé sur le rôle) ---
    let borderClass = $derived(profileData.role === 'admin' 
      ? 'bg-gradient-to-br from-yellow-300/80 via-amber-400/50 to-yellow-500/80 shadow-[0_0_35px_rgba(245,158,11,0.6)] ring-1 ring-yellow-400/50' 
      : profileData.role === 'moderator'
      ? 'bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-[0_0_30px_rgba(168,85,247,0.6)] animate-pulse' 
      : 'bg-gradient-to-br from-[rgba(var(--color-primary),0.5)] to-purple-500/50 shadow-[0_0_30px_rgba(var(--color-primary),0.2)]');

    // --- LOGIQUE ---

    onMount(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return goto('/');
        
        currentUser = user;
        
        // Vérif Admin
        const myProfile = await ProfileService.getProfile(currentUser.id);
        isAdmin = myProfile?.role === 'admin';
        
        // Initialisation Theme
        if (myProfile?.theme) {
            currentThemeId.set(myProfile.theme);
            applyTheme(myProfile.theme);
        }

        handleUrlParams();
    });

    // Détection changement d'URL (pour voir le profil d'un autre)
    $effect(() => {
        if ($page.url.searchParams && currentUser) {
            handleUrlParams();
        }
    });

    function handleUrlParams() {
        const paramId = $page.url.searchParams.get('id');
        const newTargetId = (paramId && paramId !== currentUser.id) ? paramId : currentUser.id;
        
        if (newTargetId !== targetUserId) {
            targetUserId = newTargetId;
            isMyProfile = targetUserId === currentUser.id;
            loadAllData();
        }
    }

    async function loadAllData() {
        isLoading = true;
        try {
            await Promise.all([loadProfile(), loadInfractions()]);
        } catch(e) {
            console.error(e);
            toast.error("Erreur chargement données");
        } finally {
            isLoading = false;
        }
    }

    async function loadProfile() {
        const data = await ProfileService.getProfile(targetUserId);
        profileData = { ...profileData, ...data }; // Fusion

        // Gestion Email (souvent privé)
        if (isMyProfile) {
            profileData.email = currentUser.email;
        } else if (isAdmin) {
            const adminEmail = await ProfileService.getAdminUserEmail(targetUserId);
            profileData.email = adminEmail || "Masqué (RPC manquant)";
        } else {
            profileData.email = "Confidentiel";
        }
    }

    // --- TRUST METER LOGIC ---
    async function loadInfractions() {
        infractions = await ProfileService.getInfractions(targetUserId);
        calculateTrustScore();
    }

    function calculateTrustScore() {
        if (infractions.length === 0) {
            trustScore = 100; trustColor = "bg-green-500"; trustLabel = "Dossier impeccable !";
            return;
        }

        let yellow = 0, red = 0;
        const MAX_POINTS = 6;
        infractions.forEach(i => {
            if (i.card_type === 'yellow') yellow++;
            if (i.card_type === 'red') red++;
        });

        const totalPoints = (red * MAX_POINTS) + yellow;
        let percentage = Math.max(0, 100 - ((totalPoints / MAX_POINTS) * 100));
        trustScore = Math.round(percentage);

        if (totalPoints < 3) {
            trustColor = "bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)]"; trustLabel = "Attention (Moyen)";
        } else if (totalPoints < 6) {
            trustColor = "bg-gradient-to-r from-orange-500 to-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.4)]"; trustLabel = "Niveau Bas";
        } else {
            trustColor = "bg-gradient-to-r from-red-600 to-red-700 shadow-[0_0_15px_rgba(220,38,38,0.4)]"; trustLabel = "Critique (Banni)";
        }
    }

    // --- ACTIONS ---

    async function handleUpdate() {
        if (!isMyProfile && !isAdmin) return;
        isSaving = true;
        try {
            // Exclusion des champs techniques
            const { email, role, theme, avatar_url, ...updates } = profileData;
            await ProfileService.updateProfile(targetUserId, updates);
            toast.success("Profil mis à jour !");
        } catch(e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSaving = false;
        }
    }

    async function handleThemeChange(key) {
        if (!isMyProfile) return;
        currentThemeId.set(key);
        applyTheme(key);
        profileData.theme = key;
        try {
            await ProfileService.updateTheme(currentUser.id, key);
            toast.success(`Thème ${themesConfig[key].name} activé !`);
        } catch(e) {
            console.error(e);
        }
    }

    async function handleAvatarUpload(e) {
        if ((!isMyProfile && !isAdmin) || !e.target.files[0]) return;
        isUploading = true;
        try {
            const url = await ProfileService.uploadAvatar(targetUserId, e.target.files[0]);
            profileData.avatar_url = url;
            await ProfileService.updateProfile(targetUserId, { avatar_url: url });
            toast.success("Avatar mis à jour !");
        } catch(e) {
            toast.error("Erreur upload");
        } finally {
            isUploading = false;
        }
    }

    async function handleChangePassword() {
        if (!isMyProfile) return;
        if (passwordData.new.length < 6) return toast.warning("Min 6 caractères.");
        if (passwordData.new !== passwordData.confirm) return toast.warning("Mots de passe différents.");
        
        isSaving = true;
        try {
            await ProfileService.updatePassword(passwordData.new);
            toast.success("Mot de passe modifié !");
            passwordData = { new: "", confirm: "" };
        } catch(e) {
            toast.error(e.message);
        } finally {
            isSaving = false;
        }
    }

    async function handleSignOut() {
        await ProfileService.signOut();
        goto('/');
    }

    // Classes CSS partagées
    const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:ring-2 focus:border-transparent transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed";
    const labelClass = "block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-1 flex items-center gap-2";

</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen" style="--primary-rgb: var(--color-primary);">
  
  <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
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
          <p class="text-gray-500 text-sm mt-1">
             ID: <span class="font-mono text-gray-600">{targetUserId}</span>
          </p>
        </div>
    </div>

    {#if isMyProfile}
        <button onclick={handleSignOut} class="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
            <LogOut size={16}/> Déconnexion
        </button>
    {/if}
  </header>

  {#if isLoading}
    <div class="flex justify-center py-20"><Loader2 class="animate-spin w-10 h-10" style="color: rgb(var(--color-primary));" /></div>
  {:else}

     <main class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      <div class="space-y-8" in:fly={{ x: -20, delay: 100 }}>
        
        <div class="bg-black/20 border border-white/5 rounded-3xl p-8 relative overflow-hidden">
          <div class="absolute top-0 left-0 right-0 h-32 opacity-20 pointer-events-none" style="background: linear-gradient(to b, rgb(var(--color-primary)), transparent);"></div>

          <div class="relative flex flex-col items-center mb-8">
            <div class="relative group">
                <div class="w-36 h-36 rounded-full p-1 transition-all duration-500 {borderClass}">
                    {#if isUploading}
                        <div class="w-full h-full rounded-full bg-black/60 flex items-center justify-center"><Loader2 class="animate-spin text-white"/></div>
                    {:else}
                        <img src={profileData.avatar_url || 'https://via.placeholder.com/150'} alt="Avatar" class="w-full h-full rounded-full object-cover border-4 border-[#0f1115]">
                    {/if}
                </div>
                {#if isMyProfile || isAdmin}
                  <label class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white backdrop-blur-sm m-1">
                    <Camera size={32} />
                    <input type="file" class="hidden" accept="image/*" onchange={handleAvatarUpload} disabled={isUploading}>
                  </label>
                {/if}
            </div>
            <h2 class="text-2xl font-bold text-white mt-4">{profileData.full_name || 'Utilisateur'}</h2>
            <p class="text-gray-400 text-sm">@{profileData.username || 'user'}</p>
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
                  onclick={handleUpdate} 
                  disabled={isSaving}
                  class="px-6 py-2.5 bg-[#1a1d24] hover:bg-white/10 text-white rounded-xl font-bold transition-all flex items-center gap-2 disabled:opacity-50 border border-white/10 hover:border-white/20"
                  style="border-color: rgba(var(--primary-rgb), 0.5); box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.1);"
                >
                  {#if isSaving} <Loader2 class="animate-spin w-4 h-4"/> {:else} <Save size={16}/> {/if} Enregistrer
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="space-y-8" in:fly={{ x: 20, delay: 200 }}>
        
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
                    <div class="w-2 h-2 mt-1.5 rounded-full {inf.card_type === 'red' ? 'bg-red-500 shadow-[0_0_8px_red]' : 'bg-yellow-500 shadow-[0_0_8px_orange]'}"></div>
                    <div>
                        <p class="text-sm font-bold text-gray-200">{inf.reason}</p>
                        <p class="text-xs text-gray-500">{new Date(inf.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        {#if isMyProfile}
          <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-sm" in:fly={{ x: 20, delay: 300 }}>
            <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
              <Palette size={20} style="color: rgb(var(--color-primary));" /> Thème
            </h2>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {#each Object.entries(themesConfig) as [key, theme]}
                    <button onclick={() => handleThemeChange(key)}
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

          <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-sm">
             <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
              <Lock size={20} style="color: rgb(var(--color-primary));" /> Sécurité
            </h2>
            <div class="space-y-4">
                <div>
                    <label class={labelClass}>Nouveau mot de passe</label>
                    <input type="password" bind:value={passwordData.new} class={inputClass} placeholder="••••••" style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
                </div>
                <div>
                    <label class={labelClass}>Confirmer</label>
                    <input type="password" bind:value={passwordData.confirm} class={inputClass} placeholder="••••••" style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
                </div>
                <div class="flex justify-end pt-2">
                    <button onclick={handleChangePassword} disabled={isSaving} class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 transition-colors">
                        Modifier mot de passe
                    </button>
                </div>
            </div>
          </div>
        {/if}
      </div>
    </main>
  {/if}
</div>

<style>
  .border-themed {
    border-color: rgb(var(--primary-rgb));
    box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.2);
  }
  /* Scrollbar fine pour les listes */
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>