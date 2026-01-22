<script>
    import PresenceCard from './PresenceCard.svelte';
    import { MapPin } from 'lucide-svelte';

    let {
        title,
        presenceMons = $bindable(),
        presenceTournai = $bindable(),
        borderColor = 'border-theme-primary',
        titleColor = 'text-theme-primary'
    } = $props();
</script>

<div class="relative group">
    <div class="relative glass-panel {borderColor} rounded-2xl p-8 shadow-2xl">
        <h2 class="text-3xl font-black mb-8 flex items-center gap-3 pb-5 border-b-2 {borderColor}">
            <span class={titleColor}>{title}</span>
        </h2>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Mons -->
            <PresenceCard
                title="Quinyx gare de Mons"
                bind:presence={presenceMons}
                themeColor="primary"
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
