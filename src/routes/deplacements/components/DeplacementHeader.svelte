<script>
    import { Car, Train, Save, Mail, FileDown } from 'lucide-svelte';

    let { loading = $bindable(false), onSave, onCopyEmail, onGeneratePDF } = $props();
</script>

<header class="relative flex flex-col md:flex-row md:justify-between md:items-end gap-6 pb-8 overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 rounded-3xl animate-gradient-shift"></div>
    <div class="absolute inset-0 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-sm"></div>

    <div class="relative flex items-center gap-4 p-6">
        <div class="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg animate-pulse-soft">
            <Car class="w-10 h-10" />
        </div>
        <div>
            <h1 class="text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Déplacements PMR
            </h1>
            <p class="text-slate-400 text-sm mt-2 font-medium">
                Gestion centralisée des prises en charge
            </p>
        </div>
    </div>

    <div class="relative flex flex-wrap gap-3 p-6">
        <a href="/deplacements/historique" class="btn-primary">
            <Train class="w-5 h-5" /> Historique
        </a>
        <button onclick={onSave} disabled={loading} class="btn-primary">
            {#if loading}
                <span class="animate-spin">⏳</span>
            {:else}
                <Save class="w-5 h-5" />
            {/if}
            Sauvegarder
        </button>
        <button onclick={onCopyEmail} disabled={loading} class="btn-success">
            <Mail class="w-5 h-5" /> Copier pour Outlook
        </button>
        <button onclick={onGeneratePDF} disabled={loading} class="btn-danger">
            <FileDown class="w-5 h-5" /> Télécharger PDF
        </button>
    </div>
</header>

<style>
    @reference "tailwindcss";

    .animate-pulse-soft {
        animation: pulseSoft 3s ease-in-out infinite;
    }

    .animate-gradient-shift {
        background-size: 200% 200%;
        animation: gradientShift 15s ease infinite;
    }

    @keyframes pulseSoft {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.85; transform: scale(1.03); }
    }

    @keyframes gradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    .btn-primary {
        @apply flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50;
        background-color: rgb(var(--color-primary));
        color: white;
    }

    .btn-primary:hover:not(:disabled) {
        background-color: rgba(var(--color-primary), 0.8);
    }

    .btn-success {
        @apply flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105;
        background: linear-gradient(to right, #10b981, #14b8a6);
        color: white;
    }

    .btn-success:hover {
        background: linear-gradient(to right, #059669, #0d9488);
    }

    .btn-danger {
        @apply flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105;
        background: linear-gradient(to right, #dc2626, #f43f5e);
        color: white;
    }

    .btn-danger:hover {
        background: linear-gradient(to right, #b91c1c, #e11d48);
    }
</style>
