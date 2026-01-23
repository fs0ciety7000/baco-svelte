<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { fly, fade } from 'svelte/transition';
    import { 
        ChevronLeft, Shield, Save, Loader2, KeyRound, 
        AlertTriangle, FileWarning, History, CheckCircle, 
        UserX, UserCheck, Copy, X, AlertOctagon 
    } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    import { AdminService } from '$lib/services/admin.service.js';
    import { ProfileService } from '$lib/services/profile.service.js';

    // --- ÉTAT ---
    let isLoading = $state(true);
    let isSaving = $state(false);
    let user = $state(null);
    let infractions = $state([]);
    let trustScore = $state(100);
    
    // Modales
    let showInfractionModal = $state(false);
    let showResetModal = $state(false);
    
    // Données Actions
    let infractionData = $state({ type: 'yellow', reason: '', duration: 30 });
    let resetPassword = $state("");

    // ID depuis l'URL
    const userId = $page.params.id;

    // --- INIT ---
    onMount(async () => {
        await checkAccess();
        await loadFullProfile();
    });

    async function checkAccess() {
        const { data: { user: me } } = await supabase.auth.getUser();
        if (!me) return goto('/');
        const { data } = await supabase.from('profiles').select('role').eq('id', me.id).single();
        if (data?.role !== 'admin') goto('/');
    }

    async function loadFullProfile() {
        isLoading = true;
        try {
            // Profil
            const profile = await ProfileService.getProfile(userId);
            const email = await ProfileService.getAdminUserEmail(userId); // RPC
            user = { ...profile, email: email || 'Email masqué' };

            // Infractions
            infractions = await ProfileService.getInfractions(userId);
            calculateTrustScore();
        } catch (e) {
            toast.error("Erreur chargement profil");
            goto('/admin');
        } finally {
            isLoading = false;
        }
    }

    function calculateTrustScore() {
        if (!infractions.length) { trustScore = 100; return; }
        
        let points = 0;
        infractions.forEach(i => {
            if(i.is_active) points += (i.card_type === 'red' ? 6 : 1);
        });
        
        trustScore = Math.max(0, 100 - (points / 6 * 100));
    }

    // --- ACTIONS ---

    async function handleUpdate() {
        isSaving = true;
        try {
            await ProfileService.updateProfile(userId, {
                full_name: user.full_name,
                role: user.role,
                fonction: user.fonction
            });
            toast.success("Profil mis à jour");
        } catch(e) {
            toast.error("Erreur sauvegarde");
        } finally {
            isSaving = false;
        }
    }

    async function handleBan(shouldBan) {
        openConfirmModal(shouldBan ? "Bannir cet utilisateur ?" : "Réactiver ?", async () => {
            const updates = {
                banned_until: shouldBan ? new Date(2099, 0, 1) : null
            };
            await supabase.from('profiles').update(updates).eq('id', userId);
            user.banned_until = updates.banned_until;
            toast.success(shouldBan ? "Utilisateur Banni" : "Utilisateur Réactivé");
        });
    }

    // --- SANCTIONS ---

    async function addInfraction() {
        if (!infractionData.reason) return toast.warning("Motif requis");
        try {
            const { data: { user: me } } = await supabase.auth.getUser();
            await AdminService.addInfraction({
                userId: userId,
                type: infractionData.type,
                reason: infractionData.reason,
                durationDays: infractionData.duration,
                createdBy: me.id
            });
            toast.success("Sanction ajoutée");
            showInfractionModal = false;
            loadFullProfile(); // Refresh
        } catch(e) {
            toast.error("Erreur sanction");
        }
    }

    async function pardonInfraction(id) {
        openConfirmModal("Pardonner cette infraction ?", async () => {
            await AdminService.revokeInfraction(id);
            toast.success("Infraction pardonnée");
            loadFullProfile();
        });
    }

    // --- PASSWORD ---

    async function handleResetPassword() {
        try {
            await supabase.rpc('admin_reset_user_password', {
                user_id_to_reset: userId,
                new_password: resetPassword
            });
            toast.success("Mot de passe modifié !");
            showResetModal = false;
        } catch(e) {
            toast.error("Erreur reset password");
        }
    }

    function generatePassword() {
        resetPassword = Math.random().toString(36).slice(-10) + "!A1";
        showResetModal = true;
    }

    // Helpers
    const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all";
    const labelClass = "block text-xs font-bold text-gray-500 uppercase mb-2";

</script>

<div class="container mx-auto p-4 md:p-8 min-h-screen space-y-8">
    
    <a href="/admin" class="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors" in:fly={{ x: -20 }}>
        <ChevronLeft size={20}/> Retour liste
    </a>

    {#if isLoading || !user}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-white w-10 h-10"/></div>
    {:else}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8" in:fade>
            
            <div class="lg:col-span-2 space-y-8">
                
                <div class="bg-black/20 border border-white/5 rounded-3xl p-8 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    
                    <div class="flex flex-col md:flex-row items-center gap-6 mb-8 border-b border-white/5 pb-8">
                        <img src={user.avatar_url || '/default-avatar.png'} alt="av" class="w-24 h-24 rounded-full border-4 border-[#1a1d24] shadow-xl object-cover">
                        <div class="text-center md:text-left">
                            <h1 class="text-2xl font-bold text-white">{user.full_name || 'Utilisateur'}</h1>
                            <p class="text-gray-400 font-mono text-sm mt-1">{user.email}</p>
                            <div class="flex gap-2 justify-center md:justify-start mt-3">
                                <span class="px-2 py-1 rounded border border-white/10 bg-white/5 text-xs font-bold uppercase text-gray-300">{user.role}</span>
                                {#if user.banned_until}
                                    <span class="px-2 py-1 rounded border border-red-500/20 bg-red-500/10 text-xs font-bold uppercase text-red-400 animate-pulse">Banni</span>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <div class="space-y-6">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label class={labelClass}>Nom Complet</label><input type="text" bind:value={user.full_name} class={inputClass}></div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class={labelClass}>Rôle</label>
                                <select bind:value={user.role} class={inputClass}>
                                    <option value="user" class="bg-gray-900">User</option>
                                    <option value="moderator" class="bg-gray-900">Modérateur</option>
                                    <option value="admin" class="bg-gray-900">Admin</option>
                                </select>
                            </div>
                            <div><label class={labelClass}>Fonction</label><input type="text" bind:value={user.fonction} class={inputClass}></div>
                        </div>

                        <div class="flex justify-end pt-4">
                            <button onclick={handleUpdate} disabled={isSaving} class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all">
                                {#if isSaving}<Loader2 class="animate-spin w-4 h-4"/>{/if} Enregistrer
                            </button>
                        </div>
                    </div>
                </div>

                <div class="bg-black/20 border border-white/5 rounded-3xl p-8">
                    <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2"><History class="text-gray-400"/> Historique Sanctions</h3>
                    
                    <div class="space-y-3">
                        {#each infractions as inf}
                            <div class="p-4 rounded-xl border border-white/5 bg-black/40 flex justify-between items-start {inf.is_active ? '' : 'opacity-50'}">
                                <div class="flex gap-4">
                                    <div class="mt-1">
                                        {#if inf.card_type === 'red'}
                                            <AlertOctagon size={20} class="text-red-500"/>
                                        {:else}
                                            <FileWarning size={20} class="text-yellow-500"/>
                                        {/if}
                                    </div>
                                    <div>
                                        <p class="font-bold text-gray-200 text-sm">{inf.reason}</p>
                                        <p class="text-xs text-gray-500 mt-1">
                                            Le {new Date(inf.created_at).toLocaleDateString()} 
                                            {#if !inf.is_active} <span class="text-green-500 ml-2">(Pardonné)</span> {/if}
                                        </p>
                                    </div>
                                </div>
                                {#if inf.is_active}
                                    <button onclick={() => pardonInfraction(inf.id)} class="text-xs text-blue-400 hover:underline">Pardonner</button>
                                {/if}
                            </div>
                        {:else}
                            <p class="text-gray-500 italic text-center py-4">Casier vierge.</p>
                        {/each}
                    </div>
                </div>

            </div>

            <div class="space-y-8">
                
                <div class="bg-black/20 border border-white/5 rounded-3xl p-8 relative overflow-hidden">
                    <div class="absolute inset-0 opacity-5 bg-gradient-to-br {trustScore > 50 ? 'from-green-500' : 'from-red-500'} to-transparent pointer-events-none"></div>
                    <h3 class="text-lg font-bold text-white mb-6 flex items-center gap-2"><CheckCircle class="text-gray-400"/> Trust Score</h3>
                    
                    <div class="relative w-full h-4 bg-black/40 rounded-full overflow-hidden mb-2">
                        <div class="h-full transition-all duration-1000 {trustScore > 80 ? 'bg-green-500' : trustScore > 40 ? 'bg-yellow-500' : 'bg-red-500'}" style="width: {trustScore}%"></div>
                    </div>
                    <div class="flex justify-between text-xs font-bold uppercase tracking-wider">
                        <span class="text-gray-400">Fiabilité</span>
                        <span class="text-white">{Math.round(trustScore)}%</span>
                    </div>
                </div>

                <div class="bg-black/20 border border-white/5 rounded-3xl p-8 space-y-4">
                    <h3 class="text-lg font-bold text-white mb-4">Actions</h3>
                    
                    <button onclick={() => { infractionData.type='yellow'; showInfractionModal = true; }} class="w-full py-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-400 font-bold hover:bg-yellow-500/20 transition-all flex items-center justify-center gap-2">
                        <FileWarning size={18}/> Avertissement
                    </button>
                    
                    <button onclick={() => { infractionData.type='red'; showInfractionModal = true; }} class="w-full py-3 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 font-bold hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                        <AlertTriangle size={18}/> Carton Rouge
                    </button>

                    <div class="h-px bg-white/10 my-4"></div>

                    <button onclick={generatePassword} class="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-gray-300 font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                        <KeyRound size={18}/> Reset Password
                    </button>

                    {#if user.banned_until}
                        <button onclick={() => handleBan(false)} class="w-full py-3 rounded-xl border border-green-500/20 bg-green-500/10 text-green-400 font-bold hover:bg-green-500/20 transition-all flex items-center justify-center gap-2">
                            <UserCheck size={18}/> Débannir
                        </button>
                    {:else}
                        <button onclick={() => handleBan(true)} class="w-full py-3 rounded-xl border border-white/10 bg-black/40 text-gray-500 font-bold hover:text-red-400 hover:border-red-500/30 transition-all flex items-center justify-center gap-2">
                            <UserX size={18}/> Bannir
                        </button>
                    {/if}
                </div>

            </div>
        </div>
    {/if}

    {#if showInfractionModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
            <div class="bg-[#1a1d24] w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl" in:fly={{ y: 20 }}>
                <h3 class="text-xl font-bold text-white mb-4">Nouvelle Sanction ({infractionData.type === 'yellow' ? 'Jaune' : 'Rouge'})</h3>
                <textarea bind:value={infractionData.reason} class="{inputClass} h-32 resize-none mb-4" placeholder="Motif de la sanction..."></textarea>
                <div class="flex gap-3 justify-end">
                    <button onclick={() => showInfractionModal = false} class="px-4 py-2 text-gray-400 hover:text-white">Annuler</button>
                    <button onclick={addInfraction} class="px-6 py-2 bg-white text-black font-bold rounded-xl hover:bg-gray-200">Confirmer</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showResetModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
            <div class="bg-[#1a1d24] w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl" in:fly={{ y: 20 }}>
                <h3 class="text-xl font-bold text-white mb-4">Nouveau Mot de Passe</h3>
                <div class="bg-black/40 p-4 rounded-xl border border-white/10 flex justify-between items-center mb-6">
                    <span class="font-mono text-lg text-white tracking-widest">{resetPassword}</span>
                    <button onclick={() => { navigator.clipboard.writeText(resetPassword); toast.success("Copié"); }} class="text-gray-400 hover:text-white"><Copy size={18}/></button>
                </div>
                <div class="flex gap-3 justify-end">
                    <button onclick={() => showResetModal = false} class="px-4 py-2 text-gray-400 hover:text-white">Annuler</button>
                    <button onclick={handleResetPassword} class="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500">Valider</button>
                </div>
            </div>
        </div>
    {/if}

</div>