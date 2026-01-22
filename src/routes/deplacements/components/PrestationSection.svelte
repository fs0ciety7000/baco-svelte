<script>
    import PresenceCard from './PresenceCard.svelte';
    import { MapPin } from 'lucide-svelte';

    let {
        title,
        presenceMons = $bindable(),
        presenceTournai = $bindable(),
        period = 'morning'
    } = $props();

    const periodColors = {
        morning: {
            bg: 'bg-purple-50',
            border: 'border-purple-200',
            text: 'text-purple-900'
        },
        afternoon: {
            bg: 'bg-yellow-50',
            border: 'border-yellow-200',
            text: 'text-yellow-900'
        }
    };

    const colors = periodColors[period] || periodColors.morning;
</script>

<div class="glass-panel rounded-lg border border-white/20 shadow-xl overflow-hidden">
    <!-- Header -->
    <div class="{colors.bg} px-6 py-4 border-b border-white/20">
        <h2 class="text-xl font-bold {colors.text}">
            {title}
        </h2>
    </div>

    <!-- Content -->
    <div class="p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Mons -->
            <PresenceCard
                title="Quinyx gare de Mons"
                bind:presence={presenceMons}
                themeColor="blue"
                icon={MapPin}
            />

            <!-- Tournai -->
            <PresenceCard
                title="Quinyx gare de Tournai"
                bind:presence={presenceTournai}
                themeColor="purple"
                icon={MapPin}
            />
        </div>
    </div>
</div>

<style>
    @reference "tailwindcss";
</style>
