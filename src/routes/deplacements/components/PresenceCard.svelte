<script>
    import { MapPin } from 'lucide-svelte';

    let {
        title,
        presence = $bindable(),
        themeColor = 'blue',
        icon: IconComponent
    } = $props();

    const colorClasses = {
        blue: {
            border: 'border-blue-200',
            text: 'text-blue-900',
            icon: 'text-blue-600',
            slider: 'accent-blue-600'
        },
        purple: {
            border: 'border-purple-200',
            text: 'text-purple-900',
            icon: 'text-purple-600',
            slider: 'accent-purple-600'
        }
    };

    const colors = colorClasses[themeColor] || colorClasses.blue;
</script>

<div class="glass-panel rounded-lg border border-white/20 p-5 shadow-xl">
    <h3 class="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        {#if IconComponent}
            <IconComponent class="w-4 h-4 {colors.icon}" />
        {:else}
            <MapPin class="w-4 h-4 {colors.icon}" />
        {/if}
        {title}
    </h3>

    <div class="grid grid-cols-5 gap-3">
        {#each Object.keys(presence) as key}
            <div class="bg-white/5 rounded-lg p-3 flex flex-col items-center border border-white/10">
                <span class="text-xs uppercase font-semibold mb-2 text-gray-300">
                    {key.replace('shift_', '')}
                </span>
                <input
                    type="range"
                    min="0"
                    max="20"
                    bind:value={presence[key]}
                    class="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer {colors.slider}"
                />
                <span class="text-lg font-bold mt-2 text-white">
                    {presence[key]}
                </span>
            </div>
        {/each}
    </div>
</div>

<style>
    @reference "tailwindcss";
</style>
