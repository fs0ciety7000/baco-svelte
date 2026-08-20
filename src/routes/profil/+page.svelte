<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import {
        User, Mail, Shield, Camera, Lock, Save, LogOut,
        Loader2, CheckCircle, Tag, Cake, Palette,
        Briefcase, Hash, Building, MapPin, Smartphone, Phone, FileText,
        Link2, Check, Bus, Car, Trophy, Code2, ShieldCheck, Medal, Flame, Crown, Award,
        Heart, MessageCircle, Send, Trash2, Compass, AtSign, Smile, Plus, Upload
    } from 'lucide-svelte';

    // Stores & Libs
    import { toast } from '$lib/stores/toast';
    import { openConfirmModal } from '$lib/stores/modal.js';
    import { supabase } from '$lib/supabase';
    import { currentThemeId, themesConfig, applyTheme } from '$lib/stores/theme';
    import { ProfileService } from '$lib/services/profile.service.js';
    import { ActivityStatsService } from '$lib/services/activityStats.service.js';
    import { SocialService, REACTIONS, QUICK_EMOJIS } from '$lib/services/social.service.js';
    import { computeBadges } from '$lib/utils/badges.js';

    // Map nom d'icône (string, défini dans badges.js) -> composant lucide
    const BADGE_ICONS = { Code2, ShieldCheck, Shield, Bus, Car, Trophy, Medal, Flame, Crown, Heart };

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
       district: "Sud-Ouest",

        birthday: null, avatar_url: null, theme: "default"
    });

    // Mot de passe
    let passwordData = $state({ new: "", confirm: "" });

    // Trust Meter
    let infractions = $state([]);
    let trustScore = $state(100);
    let trustColor = $state("bg-green-500");
    let trustLabel = $state("Chargement...");

    // Activité / Badges
    let activityStats = $state({ ottoCount: 0, taxiCount: 0, total: 0 });
    let badges = $derived(computeBadges(profileData, activityStats, likes.length));
    let linkCopied = $state(false);
    let myFullName = $state("");

    // Social (Réactions / Commentaires)
    let likes = $state([]);
    let myReaction = $derived(likes.find(l => l.liker_id === currentUser?.id)?.reaction_type || null);
    let reactionCounts = $derived.by(() => {
        const map = {};
        REACTIONS.forEach(r => map[r.type] = 0);
        likes.forEach(l => { if (map[l.reaction_type] !== undefined) map[l.reaction_type]++; });
        return map;
    });
    let showReactionPicker = $state(false);
    let isLiking = $state(false);
    let comments = $state([]);
    let newComment = $state("");
    let isPostingComment = $state(false);
    let allProfiles = $state([]); // pour l'autocomplete @mention

    // Mentions (@Nom)
    let showMentionList = $state(false);
    let mentionQuery = $state("");
    let commentInputEl = $state(null);
    let mentionCandidates = $derived(
        mentionQuery.trim()
            ? allProfiles.filter(p => p.full_name?.toLowerCase().includes(mentionQuery.trim().toLowerCase())).slice(0, 6)
            : allProfiles.slice(0, 6)
    );

    // Barre d'emojis (standards + personnalisés)
    let showEmojiBar = $state(false);
    let customEmojis = $state([]);
    let showEmojiUpload = $state(false);
    let emojiUploadName = $state("");
    let emojiUploadFile = $state(null);
    let isUploadingEmoji = $state(false);

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
        isAdmin = myProfile?.role === 'admin' || myProfile?.role === 'sysop';
        myFullName = myProfile?.full_name || 'Un collègue';

        // Initialisation Theme
        if (myProfile?.theme) {
            currentThemeId.set(myProfile.theme);
            applyTheme(myProfile.theme);
        }

        // Annuaire léger pour l'autocomplete @mention
        SocialService.getAllProfiles().then(list => allProfiles = list).catch(() => {});
        SocialService.getCustomEmojis().then(list => customEmojis = list).catch(() => {});

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
            await Promise.all([loadProfile(), loadInfractions(), loadActivityStats(), loadSocial()]);
        } catch(e) {
            console.error(e);
            toast.error("Erreur chargement données");
        } finally {
            isLoading = false;
        }
    }

    async function loadSocial() {
        try {
            const [l, c] = await Promise.all([
                SocialService.getLikes(targetUserId),
                SocialService.getComments(targetUserId)
            ]);
            likes = l;
            comments = c;
        } catch (e) {
            console.error(e);
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

    async function loadActivityStats() {
        try {
            // full_name provisoire (profileData pas encore fusionné à ce stade si appelé en parallèle)
            const data = await ProfileService.getProfile(targetUserId);
            activityStats = await ActivityStatsService.getUserStats(targetUserId, data.full_name);
        } catch (e) {
            console.error(e);
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

    async function copyProfileLink() {
        try {
            const url = `${window.location.origin}/profil?id=${targetUserId}`;
            await navigator.clipboard.writeText(url);
            linkCopied = true;
            toast.success("Lien du profil copié !");
            setTimeout(() => linkCopied = false, 2000);
        } catch (e) {
            toast.error("Impossible de copier le lien");
        }
    }

    // --- SOCIAL ---
    async function handleReact(reactionType) {
        if (!currentUser || isLiking) return;
        isLiking = true;
        showReactionPicker = false;
        try {
            const active = await SocialService.setReaction(targetUserId, currentUser.id, reactionType, { actorName: myFullName });
            likes = likes.filter(l => l.liker_id !== currentUser.id);
            if (active) likes = [...likes, { liker_id: currentUser.id, reaction_type: active }];
        } catch (e) {
            toast.error("Erreur");
        } finally {
            isLiking = false;
        }
    }

    // --- MENTIONS (@Nom) dans le champ commentaire ---
    function handleCommentInput(e) {
        const val = e.target.value;
        const caret = e.target.selectionStart;
        const beforeCaret = val.slice(0, caret);
        const match = beforeCaret.match(/@([^\s@]*)$/);
        if (match) {
            mentionQuery = match[1];
            showMentionList = true;
        } else {
            showMentionList = false;
        }
    }

    function insertMention(person) {
        const caret = commentInputEl?.selectionStart ?? newComment.length;
        const beforeCaret = newComment.slice(0, caret);
        const afterCaret = newComment.slice(caret);
        const replaced = beforeCaret.replace(/@([^\s@]*)$/, `@${person.full_name} `);
        newComment = replaced + afterCaret;
        showMentionList = false;
        commentInputEl?.focus();
    }

    // --- BARRE D'EMOJIS ---
    function insertAtCaret(text) {
        const el = commentInputEl;
        const caret = el?.selectionStart ?? newComment.length;
        newComment = newComment.slice(0, caret) + text + newComment.slice(caret);
        const pos = caret + text.length;
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange?.(pos, pos);
        });
    }

    function insertQuickEmoji(char) {
        insertAtCaret(char);
    }

    function insertCustomEmoji(emoji) {
        insertAtCaret(`:${emoji.name}: `);
        showEmojiBar = false;
    }

    function handleEmojiFileChange(e) {
        emojiUploadFile = e.target.files?.[0] || null;
    }

    async function handleUploadEmoji() {
        if (!emojiUploadFile || !emojiUploadName.trim() || isUploadingEmoji) return;
        isUploadingEmoji = true;
        try {
            const created = await SocialService.uploadCustomEmoji(emojiUploadFile, emojiUploadName, currentUser.id);
            customEmojis = [...customEmojis, created].sort((a, b) => a.name.localeCompare(b.name));
            toast.success(`Emoji :${created.name}: ajouté !`);
            emojiUploadName = "";
            emojiUploadFile = null;
            showEmojiUpload = false;
        } catch (e) {
            toast.error(e.message || "Erreur upload emoji");
        } finally {
            isUploadingEmoji = false;
        }
    }

    async function handlePostComment() {
        if (!newComment.trim() || isPostingComment) return;
        isPostingComment = true;
        try {
            await SocialService.addComment(targetUserId, currentUser.id, newComment, {
                actorName: myFullName,
                mentionCandidates: allProfiles
            });
            newComment = "";
            showMentionList = false;
            comments = await SocialService.getComments(targetUserId);
        } catch (e) {
            toast.error(e.message || "Erreur lors de l'envoi");
        } finally {
            isPostingComment = false;
        }
    }

    function handleDeleteComment(comment) {
        if (!isMyProfile && !isAdmin && comment.author_id !== currentUser?.id) return;
        openConfirmModal("Supprimer ce commentaire ?", async () => {
            try {
                await SocialService.deleteComment(comment.id);
                comments = comments.filter(c => c.id !== comment.id);
                toast.success("Commentaire supprimé");
            } catch (e) {
                toast.error("Erreur suppression");
            }
        });
    }

    function timeAgo(dateStr) {
        const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
        if (diff < 60) return "à l'instant";
        if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
        return `il y a ${Math.floor(diff / 86400)} j`;
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
            <span class="inline-flex items-center gap-1 px-3 py-1 bg-sky-500/10 text-sky-300 text-xs font-bold rounded-full uppercase border border-sky-500/20">
              <MapPin size={12} /> {profileData.district || 'Sud-Ouest'}
            </span>
          </h1>
          <p class="text-gray-500 text-sm mt-1">
             ID: <span class="font-mono text-gray-600">{targetUserId}</span>
          </p>
        </div>
    </div>

    <div class="flex items-center gap-2">
        <div class="relative">
            <button
                onclick={() => showReactionPicker = !showReactionPicker}
                onblur={() => setTimeout(() => showReactionPicker = false, 150)}
                disabled={isLiking}
                class="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border disabled:opacity-50
                    {myReaction ? 'bg-pink-500/15 text-pink-300 border-pink-500/30' : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'}"
            >
                {#if myReaction}
                    <span class="text-base leading-none">{REACTIONS.find(r => r.type === myReaction)?.emoji}</span>
                {:else}
                    <Heart size={16} />
                {/if}
                {likes.length}
            </button>
            {#if showReactionPicker}
                <div class="absolute top-full mt-1.5 left-0 z-20 bg-[#1a1d24] border border-white/10 rounded-2xl shadow-2xl p-1.5 flex gap-1" in:fly={{ y: -5, duration: 120 }}>
                    {#each REACTIONS as r}
                        <button
                            onmousedown={(e) => e.preventDefault()}
                            onclick={() => handleReact(r.type)}
                            class="w-9 h-9 rounded-xl flex items-center justify-center text-lg hover:bg-white/10 transition-all hover:scale-125 {myReaction === r.type ? 'bg-white/10 ring-1 ring-pink-400/50' : ''}"
                            title={r.label}
                        >{r.emoji}</button>
                    {/each}
                </div>
            {/if}
        </div>
        <button onclick={copyProfileLink} class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
            {#if linkCopied}<Check size={16} class="text-emerald-400"/> Copié !{:else}<Link2 size={16}/> Partager{/if}
        </button>
        {#if isMyProfile}
            <button onclick={handleSignOut} class="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
                <LogOut size={16}/> Déconnexion
            </button>
        {/if}
    </div>
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
            <p class="text-gray-400 text-sm mb-4">@{profileData.username || 'user'}</p>

            {#if badges.length > 0}
                <div class="flex flex-wrap justify-center gap-2">
                    {#each badges as badge}
                        {@const Icon = BADGE_ICONS[badge.icon] || Award}
                        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border {badge.badgeClass} {badge.glow}" title={badge.label}>
                            <Icon size={13} /> {badge.label}
                        </span>
                    {/each}
                </div>
            {/if}
            {#if likes.length > 0}
                <div class="flex justify-center gap-3 mt-3">
                    {#each REACTIONS as r}
                        {#if reactionCounts[r.type] > 0}
                            <span class="flex items-center gap-1 text-xs text-gray-500" title={r.label}>
                                <span class="text-sm leading-none">{r.emoji}</span> {reactionCounts[r.type]}
                            </span>
                        {/if}
                    {/each}
                </div>
            {/if}
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
   
              <div class="grid grid-cols-3 gap-4">
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
                    <label class={labelClass}>District</label>
                    <div class="relative">
                      <MapPin size={16} class="absolute left-3 top-3.5 text-gray-500" />
                      <input type="text" value={profileData.district || 'Sud-Ouest'} class="{inputClass} pl-10" disabled>
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
          <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
            <Trophy size={20} class="text-amber-400" /> Activité
          </h2>
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-black/30 rounded-2xl p-4 border border-white/5 text-center">
              <Bus size={18} class="mx-auto mb-2 text-blue-400" />
              <p class="text-2xl font-extrabold text-white">{activityStats.ottoCount}</p>
              <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mt-1">Bus (Otto)</p>
            </div>
            <div class="bg-black/30 rounded-2xl p-4 border border-white/5 text-center">
              <Car size={18} class="mx-auto mb-2 text-yellow-400" />
              <p class="text-2xl font-extrabold text-white">{activityStats.taxiCount}</p>
              <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mt-1">Taxis</p>
            </div>
            <div class="bg-gradient-to-br from-white/10 to-white/5 rounded-2xl p-4 border border-white/10 text-center">
              <Trophy size={18} class="mx-auto mb-2 text-amber-400" />
              <p class="text-2xl font-extrabold text-white">{activityStats.total}</p>
              <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mt-1">Total</p>
            </div>
          </div>
          <a href="/classement" class="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500 hover:text-amber-400 transition-colors">
            Voir le classement <Trophy size={12} />
          </a>
        </div>

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

    <!-- ─── Commentaires ─────────────────────────────────────────────── -->
    <div class="bg-black/20 border border-white/5 rounded-3xl p-8 shadow-sm" in:fly={{ y: 20, delay: 250 }}>
      <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
        <MessageCircle size={20} style="color: rgb(var(--color-primary));" /> Commentaires ({comments.length})
      </h2>

      {#if currentUser}
        <div class="flex gap-3 mb-6 relative">
          <div class="relative flex-grow">
            <textarea
              bind:this={commentInputEl}
              bind:value={newComment}
              oninput={handleCommentInput}
              onblur={() => setTimeout(() => showMentionList = false, 150)}
              placeholder="Laisser un commentaire... (@ pour mentionner)"
              maxlength="500"
              rows="2"
              class="{inputClass} resize-none w-full"
              style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);"
            ></textarea>
            {#if showMentionList && mentionCandidates.length > 0}
              <div class="absolute bottom-full mb-1.5 left-0 w-64 max-h-48 overflow-y-auto bg-[#1a1d24] border border-white/10 rounded-xl shadow-2xl py-1.5 z-20 custom-scrollbar" in:fly={{ y: 5, duration: 120 }}>
                {#each mentionCandidates as person}
                  <button
                    onmousedown={(e) => e.preventDefault()}
                    onclick={() => insertMention(person)}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors"
                  >
                    <img src={person.avatar_url || '/default-avatar.png'} alt="av" class="w-6 h-6 rounded-full object-cover border border-white/10">
                    <span class="flex items-center gap-1"><AtSign size={11} class="text-gray-500"/>{person.full_name}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <div class="relative shrink-0">
            <button
              onclick={() => showEmojiBar = !showEmojiBar}
              class="px-3 h-full rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 flex items-center justify-center transition-all"
              title="Emojis"
            >
              <Smile size={18} />
            </button>

            {#if showEmojiBar}
              <div class="absolute bottom-full mb-1.5 right-0 w-72 bg-[#1a1d24] border border-white/10 rounded-2xl shadow-2xl p-3 z-20" in:fly={{ y: 5, duration: 120 }}>
                <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Emojis</p>
                <div class="grid grid-cols-8 gap-1 mb-3">
                  {#each QUICK_EMOJIS as e}
                    <button
                      onmousedown={(ev) => ev.preventDefault()}
                      onclick={() => insertQuickEmoji(e)}
                      class="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-white/10 transition-all hover:scale-125"
                    >{e}</button>
                  {/each}
                </div>

                {#if customEmojis.length > 0}
                  <div class="flex items-center justify-between mb-2">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Personnalisés</p>
                    <button onmousedown={(ev) => ev.preventDefault()} onclick={() => showEmojiUpload = !showEmojiUpload} class="text-gray-500 hover:text-white"><Plus size={13}/></button>
                  </div>
                  <div class="grid grid-cols-8 gap-1 mb-1 max-h-28 overflow-y-auto custom-scrollbar">
                    {#each customEmojis as emoji}
                      <button
                        onmousedown={(ev) => ev.preventDefault()}
                        onclick={() => insertCustomEmoji(emoji)}
                        class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all hover:scale-125"
                        title=":{emoji.name}:"
                      ><img src={emoji.image_url} alt={emoji.name} class="w-5 h-5 object-contain"></button>
                    {/each}
                  </div>
                {:else}
                  <button onmousedown={(ev) => ev.preventDefault()} onclick={() => showEmojiUpload = !showEmojiUpload} class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors mb-1">
                    <Plus size={13}/> Ajouter un emoji perso
                  </button>
                {/if}

                {#if showEmojiUpload}
                  <div class="mt-2 pt-3 border-t border-white/10 space-y-2" in:fly={{ y: -5, duration: 100 }}>
                    <input
                      type="text"
                      bind:value={emojiUploadName}
                      placeholder="nom_emoji"
                      maxlength="32"
                      class="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-white/20"
                    >
                    <label class="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-dashed border-white/15 text-[11px] text-gray-400 cursor-pointer transition-colors">
                      <Upload size={12}/> {emojiUploadFile ? emojiUploadFile.name : 'Choisir une image (100 Ko max)'}
                      <input type="file" accept="image/*" class="hidden" onchange={handleEmojiFileChange}>
                    </label>
                    <button
                      onclick={handleUploadEmoji}
                      disabled={!emojiUploadFile || !emojiUploadName.trim() || isUploadingEmoji}
                      class="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5 transition-all"
                    >
                      {#if isUploadingEmoji}<Loader2 size={13} class="animate-spin"/>{:else}<Plus size={13}/>{/if} Créer l'emoji
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <button
            onclick={handlePostComment}
            disabled={!newComment.trim() || isPostingComment}
            class="px-4 rounded-xl bg-[#1a1d24] hover:bg-white/10 text-white border border-white/10 disabled:opacity-40 flex items-center justify-center transition-all shrink-0"
            style="border-color: rgba(var(--primary-rgb), 0.4);"
          >
            {#if isPostingComment}<Loader2 size={18} class="animate-spin" />{:else}<Send size={18} />{/if}
          </button>
        </div>
      {/if}

      <div class="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        {#if comments.length === 0}
          <p class="text-sm text-gray-500 italic text-center py-6">Aucun commentaire pour l'instant.</p>
        {:else}
          {#each comments as c (c.id)}
            <div class="flex gap-3 group">
              <img src={c.author?.avatar_url || '/default-avatar.png'} alt="av" class="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0">
              <div class="flex-grow min-w-0 bg-black/30 rounded-xl p-3 border border-white/5">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-bold text-gray-200">{c.author?.full_name || 'Utilisateur'}</span>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-[10px] text-gray-500">{timeAgo(c.created_at)}</span>
                    {#if isMyProfile || isAdmin || c.author_id === currentUser?.id}
                      <button onclick={() => handleDeleteComment(c)} class="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    {/if}
                  </div>
                </div>
                {@const jumbo = SocialService.isEmojiOnly(c.content, customEmojis)}
                <p class="mt-1 whitespace-pre-wrap break-words {jumbo ? 'text-3xl leading-relaxed' : 'text-sm text-gray-300'}">
                  {#each SocialService.renderCommentParts(c.content, customEmojis) as part}
                    {#if part.type === 'emoji'}
                      <img
                        src={part.value.image_url}
                        alt=":{part.value.name}:"
                        title=":{part.value.name}:"
                        class="inline-block object-contain {jumbo ? 'w-10 h-10 mx-0.5' : 'w-5 h-5 align-text-bottom mx-0.5'}"
                      >
                    {:else}
                      {part.value}
                    {/if}
                  {/each}
                </p>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
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