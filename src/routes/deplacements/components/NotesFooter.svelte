<script>
    import { NotebookPen } from 'lucide-svelte';
</script>

<div class="bg-black/20 border border-white/5 rounded-2xl p-6 mt-8">
    <div class="flex items-center gap-2 mb-4 text-gray-400">
        <NotebookPen class="w-4 h-4" />
        <h3 class="text-xs font-bold uppercase tracking-widest">Notes & Remarques</h3>
    </div>
    
    <div class="relative group">
        <textarea
            class="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none resize-none transition-all placeholder-gray-600"
            placeholder="Ajouter une note globale pour ce rapport..."
        ></textarea>
        
        <div class="absolute bottom-3 right-3 text-[10px] text-gray-600 font-mono">
            Markdown supporté
        </div>
    </div>
</div>