<script>
    import { Briefcase } from 'lucide-svelte';
</script>

<div class="relative group mt-8">
    <div class="glass-panel border-2 border-yellow-500/30 rounded-2xl p-6 shadow-2xl flex items-start gap-4 animate-fade-in">
        <div class="p-3 bg-yellow-500 rounded-xl shadow-lg flex-shrink-0">
            <Briefcase class="w-6 h-6 text-white" />
        </div>
        <div class="text-sm space-y-2">
            <p class="text-slate-300 leading-relaxed">
                Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.
            </p>
            <p class="text-slate-300 leading-relaxed">
                Interventions PMR pour B-CS : Voir DICOS.
            </p>
            <p class="font-black text-yellow-400 mt-3 text-base">
                L'App DICOS PMR reste la base à consulter
            </p>
        </div>
    </div>
</div>

<style>
    @reference "tailwindcss";

    .animate-fade-in {
        animation: fadeIn 0.6s ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
