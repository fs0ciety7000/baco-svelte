<script>
    import { Calendar } from 'lucide-svelte';

    let { date = $bindable(), onChange } = $props();
</script>

<div class="glass-panel rounded-lg border border-gray-200 p-4 shadow-sm">
    <label class="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
        <Calendar class="w-4 h-4 text-gray-500" />
        Date du rapport
    </label>
    <input
        type="date"
        bind:value={date}
        onchange={onChange}
        class="block w-full max-w-md px-4 py-2.5 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
    />
</div>

<style>
    @reference "tailwindcss";
</style>
