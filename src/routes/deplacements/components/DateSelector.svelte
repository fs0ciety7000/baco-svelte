<script>
    import { Calendar } from 'lucide-svelte';

    let { date = $bindable(), onChange } = $props();
</script>

<div class="glass-panel rounded-lg border border-white/20 p-4 shadow-xl">
    <label class="block text-sm font-medium text-white mb-2 flex items-center gap-2">
        <Calendar class="w-4 h-4 text-gray-300" />
        Date du rapport
    </label>
    <input
        type="date"
        bind:value={date}
        onchange={onChange}
        class="block w-full max-w-md px-4 py-2.5 text-white bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors backdrop-blur-sm"
    />
</div>

<style>
    @reference "tailwindcss";
</style>
