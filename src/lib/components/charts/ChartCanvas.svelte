<script>
    import { onMount, onDestroy } from 'svelte';
    import { Chart, registerables } from 'chart.js';

    Chart.register(...registerables);

    // --- PROPS ---
    let { type = 'line', data, options = {}, height = '280px' } = $props();

    // --- LOCAL STATE ---
    let canvasEl;
    let chartInstance = null;

    function render() {
        if (!canvasEl) return;
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        chartInstance = new Chart(canvasEl, { type, data, options });
    }

    onMount(() => {
        render();
    });

    onDestroy(() => {
        chartInstance?.destroy();
        chartInstance = null;
    });

    // Re-render à chaque changement de data/type/options (nouvelle référence)
    $effect(() => {
        // Souscription explicite aux valeurs suivies
        void data;
        void type;
        void options;
        if (canvasEl) render();
    });
</script>

<div style="height: {height}; position: relative; width: 100%;">
    <canvas bind:this={canvasEl}></canvas>
</div>
