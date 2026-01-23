<script>
    import { Save, Copy, FileText, Loader2, TrainFront } from 'lucide-svelte';

    let { 
        loading, 
        onSave, 
        onCopyEmail, 
        onGeneratePDF 
    } = $props();
</script>

<header class="sticky top-0 z-40 w-full rounded-xl bg-[#0f1115]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 text-blue-400">
                <TrainFront class="w-6 h-6" />
            </div>
            <div>
                <h1 class="text-lg font-bold text-white tracking-tight">Déplacements</h1>
                <p class="text-[10px] text-gray-500 font-mono uppercase tracking-widest hidden sm:block">Gestion Quotidienne PMR</p>
            </div>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
            
            <button 
                onclick={onCopyEmail}
                disabled={loading}
                class="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-300 bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
            >
                <Copy class="w-4 h-4" />
                <span class="hidden lg:inline">Copier Email</span>
            </button>

            <button 
                onclick={onGeneratePDF}
                disabled={loading}
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-300 bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
            >
                <FileText class="w-4 h-4" />
                <span class="hidden lg:inline">PDF</span>
            </button>

            <button 
                onclick={onSave}
                disabled={loading}
                class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {#if loading}
                    <Loader2 class="w-4 h-4 animate-spin" />
                    <span>...</span>
                {:else}
                    <Save class="w-4 h-4" />
                    <span>Enregistrer</span>
                {/if}
            </button>
        </div>
    </div>
</header>