<script>
    import { useRegisterSW } from 'virtual:pwa-register/svelte';
    import { toast } from '$lib/stores/toast';
    import { RefreshCw } from 'lucide-svelte';

    let showUpdateBanner = $state(false);

    // Gestion des mises à jour
    const { needRefresh, updateServiceWorker, offlineReady } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered:', r);
        },
        onRegisterError(error) {
            console.log('SW Registration Error', error);
        }
    });

    // Afficher la bannière quand une mise à jour est disponible (sans recharger automatiquement)
    $effect(() => {
        if ($needRefresh) {
            showUpdateBanner = true;
        }
    });

    // Réaction : Si l'app est prête pour le hors-ligne
    $effect(() => {
        if ($offlineReady) {
            toast.success("Mode hors-ligne prêt !");
        }
    });

    function handleUpdate() {
        updateServiceWorker(true);
    }

    function dismissUpdate() {
        showUpdateBanner = false;
    }
</script>

{#if showUpdateBanner}
    <div class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-blue-600 text-white rounded-xl p-4 shadow-2xl border border-blue-500 flex items-center gap-3">
        <RefreshCw class="w-5 h-5 flex-shrink-0" />
        <div class="flex-grow">
            <p class="font-bold text-sm">Mise à jour disponible</p>
            <p class="text-xs text-blue-200">Une nouvelle version est prête.</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
            <button onclick={dismissUpdate} class="px-3 py-1.5 text-xs bg-white/20 hover:bg-white/30 rounded-lg font-bold">
                Plus tard
            </button>
            <button onclick={handleUpdate} class="px-3 py-1.5 text-xs bg-white text-blue-600 hover:bg-blue-50 rounded-lg font-bold">
                Mettre à jour
            </button>
        </div>
    </div>
{/if}