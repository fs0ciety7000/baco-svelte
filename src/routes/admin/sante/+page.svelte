<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import {
        Activity, ArrowLeft, Database, AlertTriangle, HardDrive,
        Loader2, CheckCircle2, Clock, BarChart3, Bus, Car, Train
    } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';

    let isLoading = $state(true);
    let isAuthorized = $state(false);

    let lastBackup = $state(null);
    let recentErrors = $state([]);
    let moduleUsage = $state([]);
    let dbSizeInfo = $state(null);

    const MODULES = [
        { table: 'otto_commandes', label: 'Otto (C3)', icon: Train, dateCol: 'date_commande' },
        { table: 'taxi_commands', label: 'Taxi', icon: Car, dateCol: 'date_trajet' },
        { table: 'bus_reservations', label: 'Bus', icon: Bus, dateCol: 'created_at' }
    ];

    function formatDate(d) {
        if (!d) return '—';
        return new Date(d).toLocaleString('fr-BE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function timeAgo(d) {
        if (!d) return null;
        const diffMs = Date.now() - new Date(d).getTime();
        const hours = diffMs / 3600000;
        if (hours < 1) return `il y a ${Math.round(diffMs / 60000)} min`;
        if (hours < 24) return `il y a ${Math.round(hours)} h`;
        return `il y a ${Math.round(hours / 24)} j`;
    }

    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        const currentUser = { ...session.user, ...profile };

        if (currentUser.role !== 'sysop' && !hasPermission(currentUser, ACTIONS.ADMIN_ACCESS)) {
            toast.error("Accès réservé aux sysops.");
            return goto('/accueil');
        }
        isAuthorized = true;

        await Promise.all([loadLastBackup(), loadRecentErrors(), loadModuleUsage()]);
        isLoading = false;
    });

    async function loadLastBackup() {
        try {
            const { data } = await supabase
                .from('app_backups')
                .select('*, profiles(full_name)')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            lastBackup = data;
        } catch (e) {
            console.warn('app_backups indisponible', e);
        }
    }

    async function loadRecentErrors() {
        try {
            const { data } = await supabase
                .from('app_error_logs')
                .select('*, profiles(full_name)')
                .order('created_at', { ascending: false })
                .limit(20);
            recentErrors = data || [];
        } catch (e) {
            console.warn('app_error_logs indisponible', e);
        }
    }

    async function loadModuleUsage() {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceStr = since.toISOString();

        const results = await Promise.all(MODULES.map(async (m) => {
            try {
                const { count } = await supabase
                    .from(m.table)
                    .select('*', { count: 'exact', head: true })
                    .gte(m.dateCol, sinceStr);
                return { ...m, count: count || 0 };
            } catch {
                return { ...m, count: null };
            }
        }));
        moduleUsage = results;
    }

    let backupHealthy = $derived(lastBackup && (Date.now() - new Date(lastBackup.created_at).getTime()) < 7 * 24 * 3600000);
</script>

<div class="mx-auto max-w-5xl px-4 py-6">
    <div class="mb-6 flex items-center gap-3">
        <a href="/admin" class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
            <ArrowLeft class="h-5 w-5" />
        </a>
        <div>
            <h1 class="flex items-center gap-2 text-xl font-black text-white">
                <Activity class="h-5 w-5 text-emerald-400" /> Dashboard santé de l'app
            </h1>
            <p class="text-xs text-gray-500">Réservé aux sysops — état du système en un coup d'œil.</p>
        </div>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-16"><Loader2 class="h-6 w-6 animate-spin text-emerald-500/30" /></div>
    {:else if !isAuthorized}
        <p class="text-center text-sm text-gray-500">Accès non autorisé.</p>
    {:else}
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <!-- Dernière sauvegarde -->
            <div class="glass-panel rounded-xl border border-white/5 p-4 md:col-span-1">
                <h3 class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-gray-500 uppercase">
                    <HardDrive class="h-4 w-4" /> Dernière sauvegarde
                </h3>
                {#if lastBackup}
                    <div class="flex items-center gap-2">
                        {#if backupHealthy}
                            <CheckCircle2 class="h-5 w-5 shrink-0 text-emerald-400" />
                        {:else}
                            <AlertTriangle class="h-5 w-5 shrink-0 text-amber-400" />
                        {/if}
                        <div>
                            <p class="text-sm font-bold text-white">{formatDate(lastBackup.created_at)}</p>
                            <p class="text-[11px] text-gray-500">{timeAgo(lastBackup.created_at)}</p>
                        </div>
                    </div>
                    <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div class="rounded-lg bg-white/5 p-2">
                            <p class="text-sm font-black text-white">{lastBackup.tables_count}</p>
                            <p class="text-[9px] text-gray-500 uppercase">Tables</p>
                        </div>
                        <div class="rounded-lg bg-white/5 p-2">
                            <p class="text-sm font-black text-white">{lastBackup.rows_count?.toLocaleString('fr-BE')}</p>
                            <p class="text-[9px] text-gray-500 uppercase">Lignes</p>
                        </div>
                        <div class="rounded-lg bg-white/5 p-2">
                            <p class="text-sm font-black text-white">{Math.round((lastBackup.size_bytes || 0) / 1024)}</p>
                            <p class="text-[9px] text-gray-500 uppercase">Ko</p>
                        </div>
                    </div>
                    {#if !backupHealthy}
                        <p class="mt-2 text-[11px] font-bold text-amber-400">⚠ Plus de 7 jours sans backup</p>
                    {/if}
                {:else}
                    <p class="text-sm text-gray-500 italic">Aucun backup journalisé pour le moment.</p>
                {/if}
                <a href="/admin" class="mt-3 inline-block text-[10px] font-bold text-emerald-400 hover:text-emerald-300">Générer un backup →</a>
            </div>

            <!-- Usage par module -->
            <div class="glass-panel rounded-xl border border-white/5 p-4 md:col-span-2">
                <h3 class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-gray-500 uppercase">
                    <BarChart3 class="h-4 w-4" /> Usage par module (30 derniers jours)
                </h3>
                <div class="grid grid-cols-3 gap-3">
                    {#each moduleUsage as m}
                        <div class="flex flex-col items-center gap-1 rounded-lg bg-white/5 p-3 text-center">
                            <svelte:component this={m.icon} class="h-5 w-5 text-emerald-400" />
                            <p class="text-lg font-black text-white">{m.count ?? '—'}</p>
                            <p class="text-[10px] text-gray-500">{m.label}</p>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Erreurs récentes -->
            <div class="glass-panel rounded-xl border border-white/5 p-4 md:col-span-3">
                <h3 class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-gray-500 uppercase">
                    <AlertTriangle class="h-4 w-4" /> Erreurs récentes
                </h3>
                {#if recentErrors.length === 0}
                    <p class="py-4 text-center text-sm text-gray-500 italic">Aucune erreur journalisée récemment. 🎉</p>
                {:else}
                    <div class="max-h-96 space-y-2 overflow-y-auto">
                        {#each recentErrors as err}
                            <div class="rounded-lg border border-red-500/10 bg-red-500/5 p-3">
                                <div class="flex items-center justify-between gap-2">
                                    <p class="truncate text-xs font-bold text-red-300">{err.message}</p>
                                    <span class="flex shrink-0 items-center gap-1 text-[10px] text-gray-500">
                                        <Clock class="h-3 w-3" /> {formatDate(err.created_at)}
                                    </span>
                                </div>
                                <p class="mt-1 text-[10px] text-gray-500">
                                    {err.url || 'URL inconnue'} — {err.profiles?.full_name || 'Utilisateur inconnu'}
                                </p>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
