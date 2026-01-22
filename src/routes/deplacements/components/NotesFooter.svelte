<script>
    import { Info } from 'lucide-svelte';
</script>

<div class="bg-white/15 backdrop-blur-md border border-white/30 rounded-lg p-5 flex items-start gap-4 shadow-xl">
    <div class="p-2 bg-blue-600 rounded-lg flex-shrink-0 shadow-md">
        <Info class="w-5 h-5 text-white" />
    </div>
    <div class="text-sm space-y-2">
        <p class="text-gray-200 leading-relaxed">
            • Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.
        </p>
        <p class="text-gray-200 leading-relaxed">
            • Interventions PMR pour B-CS : Voir DICOS.
        </p>
        <p class="font-bold text-white mt-3">
            IMPORTANT: L'App DICOS PMR reste la base à consulter
        </p>
    </div>
</div>

<style>
    @reference "tailwindcss";
</style>
