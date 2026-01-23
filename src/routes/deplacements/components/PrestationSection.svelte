<script>
    import PresenceCard from './PresenceCard.svelte';
    import { Sun, Moon } from 'lucide-svelte';

    let {
        title,
        presenceMons = $bindable(),
        presenceTournai = $bindable(),
        period = 'morning' // 'morning' | 'afternoon'
    } = $props();

    // Icône et couleur selon la période
    const Icon = period === 'morning' ? Sun : Moon;
    const accentColor = period === 'morning' ? 'text-purple-400' : 'text-yellow-400';
</script>

<div class="space-y-4">
    <div class="flex items-center gap-2 px-2">
        <Icon class="w-4 h-4 {accentColor}" />
        <h2 class="text-sm font-bold uppercase tracking-widest text-gray-400">{title}</h2>
        <div class="h-px bg-white/10 flex-grow ml-4"></div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PresenceCard 
            title="MONS" 
            bind:presence={presenceMons} 
            themeColor="blue"
        />
        <PresenceCard 
            title="TOURNAI" 
            bind:presence={presenceTournai} 
            themeColor="purple"
        />
    </div>
</div>