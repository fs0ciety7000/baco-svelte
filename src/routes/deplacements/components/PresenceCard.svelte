<script>
    import { MapPin } from 'lucide-svelte';

    let {
        title,
        presence = $bindable(),
        themeColor = 'primary',
        icon: IconComponent
    } = $props();

    const colorClasses = {
        primary: 'border-theme-primary text-theme-primary',
        purple: 'border-purple-500/30 text-purple-400'
    };

    const sliderBgClasses = {
        primary: 'bg-slate-800',
        purple: 'bg-purple-900'
    };

    const valueBgClasses = {
        primary: 'bg-slate-900 border-theme-primary',
        purple: 'bg-slate-900 border-purple-500/20'
    };

    const valueTextClasses = {
        primary: 'text-theme-primary text-slate-100',
        purple: 'text-purple-300 text-purple-100'
    };
</script>

<div class="glass-panel {colorClasses[themeColor]} rounded-2xl p-6">
    <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2">
        {#if IconComponent}
            <IconComponent class="w-5 h-5 {colorClasses[themeColor]}" />
        {:else}
            <MapPin class="w-5 h-5 {colorClasses[themeColor]}" />
        {/if}
        {title}
    </h3>

    <div class="grid grid-cols-5 gap-3">
        {#each Object.keys(presence) as key}
            <div class="{valueBgClasses[themeColor]} rounded-xl p-3 flex flex-col items-center">
                <span class="text-[10px] uppercase font-bold mb-2 {valueTextClasses[themeColor].split(' ')[0]}">
                    {key.replace('shift_', '')}
                </span>
                <input
                    type="range"
                    min="0"
                    max="20"
                    bind:value={presence[key]}
                    class="w-full h-2 {sliderBgClasses[themeColor]} rounded-lg appearance-none cursor-pointer slider-thumb"
                />
                <span class="text-lg font-bold mt-2 {valueTextClasses[themeColor].split(' ')[1]}">
                    {presence[key]}
                </span>
            </div>
        {/each}
    </div>
</div>

<style>
    @reference "tailwindcss";

    .slider-thumb::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgb(var(--color-primary));
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(var(--color-primary), 0.5);
    }

    .slider-thumb::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgb(var(--color-primary));
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(var(--color-primary), 0.5);
        border: none;
    }
</style>
