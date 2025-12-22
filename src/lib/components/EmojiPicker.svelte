<script>
    import { onMount } from 'svelte';
    import { Smile } from 'lucide-svelte';
    import { scale } from 'svelte/transition';

    // Props : on ajoute 'align' pour contrôler la direction ('left' ou 'right')
    let { onselect, align = 'right' } = $props();

    let isOpen = $state(false);
    let pickerRef;
    let containerRef;

    onMount(async () => {
        await import('emoji-picker-element');
        
        const handleClickOutside = (event) => {
            if (containerRef && !containerRef.contains(event.target) && isOpen) {
                isOpen = false;
            }
        };
        document.addEventListener('click', handleClickOutside, true);
        return () => document.removeEventListener('click', handleClickOutside, true);
    });

    $effect(() => {
        if (isOpen && pickerRef) {
            pickerRef.addEventListener('emoji-click', (event) => {
                if (onselect) onselect(event.detail.unicode);
                isOpen = false;
            });
        }
    });
</script>

<div class="relative inline-block" bind:this={containerRef}>
    <button 
        type="button"
        onclick={() => isOpen = !isOpen}
        class="p-2 text-gray-400 hover:text-yellow-400 hover:bg-white/10 transition-all rounded-full"
        title="Insérer un emoji"
    >
        <Smile size={20} />
    </button>

    {#if isOpen}
        <div 
            transition:scale={{duration: 200, start: 0.95}}
            class="absolute bottom-full mb-3 z-50 shadow-2xl rounded-xl overflow-hidden {align === 'left' ? 'left-0' : 'right-0'}"
        >
            <emoji-picker class="dark" bind:this={pickerRef}></emoji-picker>
        </div>
    {/if}
</div>

<style>
    emoji-picker {
        --background: #1a1d24;
        --border-color: #333;
        --input-border-color: #444;
        --input-placeholder-color: #888;
        --indicator-color: #3b82f6;
        --button-hover-background: #333;
        height: 350px;
        width: 320px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
</style>