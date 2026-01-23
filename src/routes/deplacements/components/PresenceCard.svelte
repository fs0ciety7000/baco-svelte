<script>
    import { MapPin } from 'lucide-svelte';

    let {
        title,
        presence = $bindable(),
        themeColor = 'blue', 
        icon: IconComponent
    } = $props();

    // Couleurs d'accentuation uniquement
    const accent = themeColor === 'blue' ? 'text-blue-400 accent-blue-500' : 'text-purple-400 accent-purple-500';
</script>

<div class="bg-black/20 border border-white/5 rounded-2xl p-5 h-full flex flex-col justify-center">
    <h3 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
        {#if IconComponent}
            <IconComponent class="w-3.5 h-3.5 {accent.split(' ')[0]}" />
        {:else}
            <MapPin class="w-3.5 h-3.5 {accent.split(' ')[0]}" />
        {/if}
        {title}
    </h3>

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {#each Object.keys(presence) as key}
            <div class="bg-black/30 rounded-lg p-2 border border-white/5 flex flex-col items-center gap-1 group relative overflow-hidden">
                <span class="text-[9px] font-black text-gray-600 uppercase tracking-wider z-10">
                    {key.replace('shift_', '')}
                </span>

                <span class="text-xl font-bold text-white z-10 tabular-nums">
                    {presence[key]}
                </span>

                <input
                    type="range"
                    min="0"
                    max="3"
                    bind:value={presence[key]}
                    class="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer {accent.split(' ')[1]} opacity-50 hover:opacity-100 z-10"
                />
            </div>
        {/each}
    </div>
</div>