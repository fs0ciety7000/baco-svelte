<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import {
        Shield, Search, Loader2, ArrowUpDown,
        CheckCircle, AlertTriangle, UserPlus, X, Eye, EyeOff,
        Power, Terminal, Lock, Database, Download, Archive, RefreshCw
    } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { AdminService } from '$lib/services/admin.service.js';
    import { openConfirmModal } from '$lib/stores/modal.js';

    // --- ÉTAT ---
    let isLoading = $state(true);
    let usersList = $state([]);
    let filteredUsers = $state([]);

    // Mode maintenance & gate
    let maintenanceMode = $state(false);
    let togglingMaintenance = $state(false);
    let gateMode = $state(false);
    let togglingGate = $state(false);

    // Modal création utilisateur
    let showCreateModal = $state(false);
    let isCreating = $state(false);
    let showPassword = $state(false);
    let newUser = $state({
        email: '',
        password: '',
        full_name: '',
        role: 'reader'
    });

    // Filtres & Tri
    let searchQuery = $state("");
    let sortCol = $state('last_active');
    let sortAsc = $state(false);

    // --- INIT ---
    onMount(async () => {
        await checkAccess();
        await Promise.all([loadUsers(), loadAppSettings()]);
    });

    async function loadAppSettings() {
        try {
            const settings = await AdminService.getAppSettings();
            maintenanceMode = settings.maintenance_mode || false;
            gateMode = settings.gate_mode || false;
        } catch (e) {
            console.warn("Impossible de charger les settings");
        }
    }

    async function checkAccess() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return goto('/');
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (data?.role !== 'admin') return goto('/');
    }

    async function loadUsers() {
        isLoading = true;
        try {
            // 1. Profils
            const { users } = await AdminService.getUsers({ limit: 1000 });
            
            // 2. Présence (Dernière activité réelle)
            const { data: presence } = await supabase.from('user_presence').select('user_id, last_seen_at');
            const presenceMap = new Map(presence?.map(p => [p.user_id, p.last_seen_at]));

            // 3. Sanctions (Compteurs)
            const { data: sanctions } = await supabase.from('infractions').select('user_id, card_type').eq('is_active', true);
            const sanctionMap = {};
            sanctions?.forEach(s => {
                if (!sanctionMap[s.user_id]) sanctionMap[s.user_id] = { yellow: 0, red: 0 };
                if (s.card_type === 'yellow') sanctionMap[s.user_id].yellow++;
                if (s.card_type === 'red') sanctionMap[s.user_id].red++;
            });

            // 4. Fusion des données
            usersList = users.map(u => {
                const lastSeen = presenceMap.get(u.id);
                // On prend le plus récent entre le login et la présence
                let realLastActive = u.last_sign_in_at;
                if (lastSeen && (!realLastActive || new Date(lastSeen) > new Date(realLastActive))) {
                    realLastActive = lastSeen;
                }

                return {
                    ...u,
                    last_active: realLastActive, // Champ unifié pour le tri
                    yellow_cards: sanctionMap[u.id]?.yellow || 0,
                    red_cards: sanctionMap[u.id]?.red || 0
                };
            });

        } catch (e) {
            toast.error("Erreur chargement");
        } finally {
            isLoading = false;
        }
    }

    // --- TRI & FILTRE ---
    $effect(() => {
        let res = [...usersList];
        
        // 1. Recherche
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            res = res.filter(u => 
                (u.email && u.email.toLowerCase().includes(q)) || 
                (u.full_name && u.full_name.toLowerCase().includes(q))
            );
        }

        // 2. Tri
        res.sort((a, b) => {
            let valA = a[sortCol];
            let valB = b[sortCol];

            if (sortCol === 'last_active') {
                valA = new Date(valA || 0).getTime();
                valB = new Date(valB || 0).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortAsc ? -1 : 1;
            if (valA > valB) return sortAsc ? 1 : -1;
            return 0;
        });

        filteredUsers = res;
    });

    function toggleSort(col) {
        if (sortCol === col) sortAsc = !sortAsc;
        else { sortCol = col; sortAsc = true; }
    }

    function formatDate(d) {
        if (!d) return '-';
        // Format court : JJ/MM HH:mm
        return new Date(d).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
    }

    // --- CRÉATION UTILISATEUR ---
    function openCreateModal() {
        newUser = { email: '', password: '', full_name: '', role: 'reader' };
        showPassword = false;
        showCreateModal = true;
    }

    function generatePassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
        let pwd = '';
        for (let i = 0; i < 12; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        newUser.password = pwd;
        showPassword = true;
    }

    async function handleCreateUser() {
        if (!newUser.email || !newUser.password) {
            return toast.error("Email et mot de passe requis");
        }
        if (newUser.password.length < 8) {
            return toast.error("Le mot de passe doit contenir au moins 8 caractères");
        }

        isCreating = true;
        try {
            await AdminService.createUser(newUser);
            toast.success(`Utilisateur ${newUser.email} créé avec succès`);
            showCreateModal = false;
            await loadUsers();
        } catch (e) {
            toast.error(e.message || "Erreur lors de la création");
        } finally {
            isCreating = false;
        }
    }

    // --- MODE GATE (FAÇADE) ---
    function toggleGate() {
        const action = gateMode ? 'désactiver' : 'activer';
        openConfirmModal(
            `Voulez-vous ${action} le mode façade ? ${!gateMode ? 'Le site sera complètement masqué. Seul le code secret permet d\'y accéder.' : ''}`,
            async () => {
                togglingGate = true;
                try {
                    await AdminService.setGateMode(!gateMode);
                    gateMode = !gateMode;
                    toast.success(`Mode façade ${gateMode ? 'activé' : 'désactivé'}`);
                } catch (e) {
                    toast.error("Erreur lors du changement de mode");
                } finally {
                    togglingGate = false;
                }
            }
        );
    }

    // --- BACKUP ---
    let backupState = $state('idle'); // 'idle' | 'loading' | 'done' | 'error'
    let backupMeta = $state(null);   // { tables, rows, size, filename, duration }

    async function handleBackup() {
        backupState = 'loading';
        backupMeta = null;
        const t0 = Date.now();

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Session expirée, reconnecte-toi.');

            const res = await fetch('/api/admin/backup', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }

            const tables = res.headers.get('X-Backup-Tables');
            const rows   = res.headers.get('X-Backup-Rows');
            const blob   = await res.blob();
            const duration = ((Date.now() - t0) / 1000).toFixed(1);

            // Déclencher le téléchargement côté navigateur
            const cd = res.headers.get('Content-Disposition') || '';
            const filenameMatch = cd.match(/filename="([^"]+)"/);
            const filename = filenameMatch ? filenameMatch[1] : 'baco_backup.json.gz';

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            backupMeta = {
                tables: parseInt(tables || '0'),
                rows: parseInt(rows || '0'),
                size: (blob.size / 1024).toFixed(1),
                filename,
                duration,
            };
            backupState = 'done';
            toast.success(`Backup téléchargé — ${backupMeta.rows.toLocaleString('fr-BE')} lignes`);
        } catch (e) {
            backupState = 'error';
            toast.error('Erreur backup : ' + e.message);
        }
    }

    // --- MODE MAINTENANCE ---
    function toggleMaintenance() {
        const action = maintenanceMode ? 'désactiver' : 'activer';
        openConfirmModal(
            `Voulez-vous ${action} le mode maintenance ? ${!maintenanceMode ? 'Tous les utilisateurs (sauf admins) seront redirigés vers la page maintenance.' : ''}`,
            async () => {
                togglingMaintenance = true;
                try {
                    await AdminService.setMaintenanceMode(!maintenanceMode);
                    maintenanceMode = !maintenanceMode;
                    toast.success(`Mode maintenance ${maintenanceMode ? 'activé' : 'désactivé'}`);
                } catch (e) {
                    toast.error("Erreur lors du changement de mode");
                } finally {
                    togglingMaintenance = false;
                }
            }
        );
    }
</script>

<svelte:head>
  <title>Admin Utilisateurs | BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-4">
            <div class="p-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_15px_rgba(220,38,38,0.2)]">
                <Shield size={32} />
            </div>
            <div>
                <h1 class="text-3xl font-bold text-gray-200">Administration</h1>
                <p class="text-gray-500 text-sm">Annuaire des utilisateurs ({filteredUsers.length})</p>
            </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <!-- Bouton Mode Gate (Façade) -->
            <button
                onclick={toggleGate}
                disabled={togglingGate}
                class="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition-all hover:scale-105 disabled:opacity-50
                    {gateMode
                        ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30'
                        : 'bg-white/5 hover:bg-white/10 text-gray-500 border border-white/10'}"
                title={gateMode ? 'Désactiver la façade (Code: BACO ou Konami)' : 'Activer la façade'}
            >
                {#if togglingGate}
                    <Loader2 size={16} class="animate-spin" />
                {:else}
                    <Lock size={16} />
                {/if}
                <span class="hidden md:inline">{gateMode ? 'Façade ON' : 'Façade'}</span>
            </button>

            <!-- Bouton Mode Maintenance -->
            <button
                onclick={toggleMaintenance}
                disabled={togglingMaintenance}
                class="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition-all hover:scale-105 disabled:opacity-50
                    {maintenanceMode
                        ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30'
                        : 'bg-white/5 hover:bg-white/10 text-gray-500 border border-white/10'}"
                title={maintenanceMode ? 'Désactiver la maintenance' : 'Activer la maintenance'}
            >
                {#if togglingMaintenance}
                    <Loader2 size={16} class="animate-spin" />
                {:else}
                    <Terminal size={16} />
                {/if}
                <span class="hidden sm:inline">{maintenanceMode ? 'Maintenance ON' : 'Maintenance'}</span>
            </button>

            <!-- Bouton Créer un compte -->
            <button
                onclick={openCreateModal}
                class="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-xl font-bold text-sm transition-all hover:scale-105"
            >
                <UserPlus size={18} />
                <span class="hidden sm:inline">Créer un compte</span>
            </button>
        </div>
    </header>

    <div class="flex flex-col md:flex-row gap-4" in:fly={{ y: 20 }}>
        <div class="relative flex-grow">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
                type="text" 
                bind:value={searchQuery} 
                placeholder="Rechercher un utilisateur..." 
                class="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500/30 outline-none"
            />
        </div>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-red-500 w-10 h-10"/></div>
    {:else}
        <div class="bg-black/20 border border-white/5 rounded-3xl overflow-hidden shadow-lg" in:fade>
            <div class="overflow-x-auto">
                <table class="min-w-full text-left">
                    <thead class="bg-white/[0.02] text-xs uppercase text-gray-500 font-bold border-b border-white/5">
                        <tr>
                            <th class="px-6 py-4 cursor-pointer hover:text-white" onclick={() => toggleSort('full_name')}>Utilisateur <ArrowUpDown size={12} class="inline"/></th>
                            <th class="px-6 py-4 cursor-pointer hover:text-white" onclick={() => toggleSort('role')}>Rôle <ArrowUpDown size={12} class="inline"/></th>
                            <th class="px-6 py-4">Statut</th>
                            <th class="px-6 py-4 text-center">Sanctions</th> <th class="px-6 py-4 cursor-pointer hover:text-white" onclick={() => toggleSort('last_active')}>Dernière Activité <ArrowUpDown size={12} class="inline"/></th>
                            <th class="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5 text-sm">
                        {#each filteredUsers as user (user.id)}
                            <tr class="hover:bg-white/[0.02] transition-colors group">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <img src={user.avatar_url || '/default-avatar.png'} alt="av" class="w-10 h-10 rounded-full bg-black/40 object-cover border border-white/10">
                                        <div>
                                            <div class="font-bold text-gray-200">{user.full_name || 'Sans nom'}</div>
                                            <div class="text-xs text-gray-500">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase border 
                                        {user.role === 'admin' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                         user.role === 'moderator' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 
                                         'bg-white/5 text-gray-400 border-white/10'}">
                                        {user.role || 'user'}
                                    </span>
                                </td>
                                <td class="px-6 py-4">
                                    {#if user.banned_until}
                                        <span class="text-red-500 font-bold text-xs flex items-center gap-1"><AlertTriangle size={12}/> Banni</span>
                                    {:else}
                                        <span class="text-green-500 font-bold text-xs flex items-center gap-1"><CheckCircle size={12}/> Actif</span>
                                    {/if}
                                </td>
                                
                                <td class="px-6 py-4 text-center">
                                    <div class="flex justify-center gap-2">
                                        {#if user.yellow_cards > 0} 
                                            <span class="text-yellow-500 text-xs font-bold bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20" title="Avertissements">⚠ {user.yellow_cards}</span> 
                                        {/if}
                                        {#if user.red_cards > 0} 
                                            <span class="text-red-500 text-xs font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20" title="Expulsions">🚷 {user.red_cards}</span> 
                                        {/if}
                                        {#if user.yellow_cards === 0 && user.red_cards === 0}
                                            <span class="text-gray-600 text-xs">—</span>
                                        {/if}
                                    </div>
                                </td>

                                <td class="px-6 py-4 font-mono text-xs text-gray-400">
                                    {formatDate(user.last_active)}
                                    {#if user.last_active && new Date(user.last_active) > new Date(Date.now() - 5*60000)} <span class="inline-block w-2 h-2 rounded-full bg-green-500 ml-2 animate-pulse" title="En ligne"></span>
                                    {/if}
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <a 
                                        href="/admin/utilisateur/{user.id}" 
                                        class="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-all border border-white/10 hover:border-white/20"
                                    >
                                        Gérer
                                    </a>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- ─── Section Backup ─────────────────────────────────────── -->
    <section class="space-y-4" in:fly={{ y: 20, delay: 100 }}>
        <div class="flex items-center gap-3 border-b border-white/5 pb-4">
            <div class="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Database size={18} />
            </div>
            <div>
                <h2 class="text-base font-bold text-gray-200">Sauvegarde de la base de données</h2>
                <p class="text-xs text-gray-500">Génère un dump compressé de toutes les tables du schéma public.</p>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Carte action -->
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col gap-5">
                <div class="flex items-start gap-4">
                    <div class="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                        <Archive size={24} />
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-200 mb-1">Dump JSON compressé (.json.gz)</h3>
                        <p class="text-xs text-gray-500 leading-relaxed">
                            Exporte toutes les lignes de chaque table en JSON, puis compresse avec gzip (niveau 9).
                            Le fichier peut être décompressé avec n'importe quel outil standard (7-Zip, gzip, etc.).
                        </p>
                    </div>
                </div>

                <!-- Info chips -->
                <div class="flex flex-wrap gap-2 text-[11px]">
                    <span class="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 flex items-center gap-1.5">
                        <Database size={11} class="text-cyan-400" /> Toutes les tables publiques
                    </span>
                    <span class="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 flex items-center gap-1.5">
                        <Archive size={11} class="text-cyan-400" /> Gzip niveau 9
                    </span>
                    <span class="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 flex items-center gap-1.5">
                        <Shield size={11} class="text-red-400" /> Admin uniquement
                    </span>
                </div>

                <button
                    onclick={handleBackup}
                    disabled={backupState === 'loading'}
                    class="flex items-center justify-center gap-2.5 w-full py-3 px-5 rounded-xl font-bold text-sm transition-all
                           {backupState === 'loading'
                               ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 cursor-wait'
                               : backupState === 'error'
                                   ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                                   : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]'}"
                >
                    {#if backupState === 'loading'}
                        <Loader2 size={16} class="animate-spin" />
                        Génération en cours...
                    {:else if backupState === 'error'}
                        <RefreshCw size={16} />
                        Réessayer
                    {:else}
                        <Download size={16} />
                        Générer &amp; Télécharger le backup
                    {/if}
                </button>
            </div>

            <!-- Carte résultat / infos -->
            <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Dernier backup</h3>

                {#if backupState === 'idle'}
                    <div class="flex-1 flex flex-col items-center justify-center py-6 text-center gap-3">
                        <Database size={32} class="text-white/10" />
                        <p class="text-gray-600 text-sm">Aucun backup généré dans cette session.</p>
                    </div>

                {:else if backupState === 'loading'}
                    <div class="flex-1 flex flex-col items-center justify-center py-6 gap-4">
                        <div class="relative">
                            <div class="w-12 h-12 rounded-full border-2 border-cyan-500/20 flex items-center justify-center">
                                <Loader2 size={22} class="animate-spin text-cyan-400" />
                            </div>
                        </div>
                        <div class="text-center">
                            <p class="text-sm font-bold text-gray-300">Dump en cours...</p>
                            <p class="text-xs text-gray-500 mt-1">Lecture de toutes les tables, compression gzip</p>
                        </div>
                    </div>

                {:else if backupState === 'done' && backupMeta}
                    <div class="flex-1 space-y-4" in:fly={{ y: 5, duration: 200 }}>
                        <div class="flex items-center gap-2 text-emerald-400">
                            <CheckCircle size={16} />
                            <span class="text-sm font-bold">Téléchargement lancé</span>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-black/30 rounded-xl p-3 border border-white/5">
                                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Tables</p>
                                <p class="text-xl font-extrabold text-white">{backupMeta.tables}</p>
                            </div>
                            <div class="bg-black/30 rounded-xl p-3 border border-white/5">
                                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Lignes</p>
                                <p class="text-xl font-extrabold text-white">{backupMeta.rows.toLocaleString('fr-BE')}</p>
                            </div>
                            <div class="bg-black/30 rounded-xl p-3 border border-white/5">
                                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Taille</p>
                                <p class="text-xl font-extrabold text-white">{backupMeta.size} Ko</p>
                            </div>
                            <div class="bg-black/30 rounded-xl p-3 border border-white/5">
                                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Durée</p>
                                <p class="text-xl font-extrabold text-white">{backupMeta.duration}s</p>
                            </div>
                        </div>

                        <div class="bg-black/30 rounded-xl p-3 border border-white/5">
                            <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Fichier</p>
                            <p class="text-xs font-mono text-cyan-400 truncate">{backupMeta.filename}</p>
                        </div>
                    </div>

                {:else if backupState === 'error'}
                    <div class="flex-1 flex flex-col items-center justify-center py-6 text-center gap-3">
                        <AlertTriangle size={28} class="text-red-500/60" />
                        <p class="text-red-400 text-sm font-bold">Erreur lors du backup</p>
                        <p class="text-gray-600 text-xs">Vérifiez la console et réessayez.</p>
                    </div>
                {/if}
            </div>
        </div>
    </section>

</div>

<!-- Modal Création Utilisateur -->
{#if showCreateModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
        <div class="bg-[#1a1d24] w-full max-w-md rounded-2xl shadow-2xl border border-white/10" transition:fly={{ y: 20 }}>
            <div class="flex justify-between items-center px-6 py-4 border-b border-white/10">
                <h3 class="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <UserPlus size={20} class="text-green-400" />
                    Créer un compte
                </h3>
                <button onclick={() => showCreateModal = false} class="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-white/5">
                    <X size={20} />
                </button>
            </div>

            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1.5">Email *</label>
                    <input
                        type="email"
                        bind:value={newUser.email}
                        placeholder="utilisateur@exemple.com"
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/50 outline-none"
                    />
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1.5">Nom complet</label>
                    <input
                        type="text"
                        bind:value={newUser.full_name}
                        placeholder="Prénom Nom"
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/50 outline-none"
                    />
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1.5">Mot de passe * (min 8 caractères)</label>
                    <div class="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            bind:value={newUser.password}
                            placeholder="••••••••"
                            class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 pr-24 text-white focus:ring-2 focus:ring-green-500/50 outline-none font-mono"
                        />
                        <div class="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                            <button
                                type="button"
                                onclick={() => showPassword = !showPassword}
                                class="p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/10"
                                title={showPassword ? 'Masquer' : 'Afficher'}
                            >
                                {#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
                            </button>
                            <button
                                type="button"
                                onclick={generatePassword}
                                class="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-gray-300 rounded font-bold"
                                title="Générer un mot de passe"
                            >
                                Générer
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1.5">Rôle</label>
                    <select
                        bind:value={newUser.role}
                        class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/50 outline-none"
                    >
                        <option value="reader">Lecteur (lecture seule)</option>
                        <option value="user">Utilisateur (lecture + écriture)</option>
                        <option value="moderator">Modérateur</option>
                        <option value="admin">Administrateur</option>
                    </select>
                    <p class="text-xs text-gray-500 mt-1">
                        {#if newUser.role === 'reader'}
                            Accès en lecture seule sur tous les modules.
                        {:else if newUser.role === 'user'}
                            Lecture et écriture sur la plupart des modules.
                        {:else if newUser.role === 'moderator'}
                            Lecture et écriture, mais pas de suppression.
                        {:else}
                            Accès complet à toutes les fonctionnalités.
                        {/if}
                    </p>
                </div>
            </div>

            <div class="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <button
                    onclick={() => showCreateModal = false}
                    class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-bold text-sm"
                >
                    Annuler
                </button>
                <button
                    onclick={handleCreateUser}
                    disabled={isCreating}
                    class="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                >
                    {#if isCreating}<Loader2 size={16} class="animate-spin" />{/if}
                    Créer le compte
                </button>
            </div>
        </div>
    </div>
{/if}