<script>
    import { Calendar } from 'lucide-svelte';

    let { date = $bindable(), onChange } = $props();
</script>

<div class="bg-white/15 backdrop-blur-md rounded-lg border border-white/30 p-4 shadow-xl">
    <label class="block text-sm font-medium text-white mb-2 flex items-center gap-2">
        <Calendar class="w-4 h-4 text-gray-200" />
        Date du rapport
    </label>
    <input
        type="date"
        bind:value={date}
        onchange={onChange}
        class="block w-full max-w-md px-4 py-2.5 text-white bg-white/15 border border-white/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors hover:bg-white/20"
    />
</div>

<style>
    @reference "tailwindcss";
</style>
