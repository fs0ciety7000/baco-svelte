<script>
    import { useRegisterSW } from 'virtual:pwa-register/svelte';
    import { toast } from '$lib/stores/toast';

    // Gestion automatique des mises à jour
    const { needRefresh, updateServiceWorker, offlineReady } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered:', r);
        },
        onRegisterError(error) {
            console.log('SW Registration Error', error);
        }
    });

    // Réaction : Si une mise à jour est prête
    $effect(() => {
        if ($needRefresh) {
            toast.info("Mise à jour disponible. Rechargement...", 5000);
            setTimeout(() => {
                updateServiceWorker(true);
            }, 1000);
        }
    });

    // Réaction : Si l'app est prête pour le hors-ligne
    $effect(() => {
        if ($offlineReady) {
            toast.success("Mode hors-ligne prêt !");
        }
    });
</script>