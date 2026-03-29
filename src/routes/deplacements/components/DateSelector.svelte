<script>
    import { ChevronLeft, ChevronRight, Calendar } from 'lucide-svelte';

    let { date = $bindable(), onChange } = $props();

    function changeDate(delta) {
        const [y, m, d] = date.split('-').map(Number);
        const dt = new Date(y, m - 1, d + delta);
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        date = `${year}-${month}-${day}`;
        onChange();
    }
</script>

<div class="flex items-center justify-center gap-4 bg-black/20 backdrop-blur-sm border border-white/5 p-2 rounded-2xl inline-flex shadow-lg">
    <button 
        onclick={() => changeDate(-1)}
        class="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-95"
    >
        <ChevronLeft class="w-5 h-5" />
    </button>

    <div class="relative group">
        <div class="flex items-center gap-3 px-4 py-2 bg-black/30 border border-white/10 rounded-xl group-hover:border-white/20 transition-all">
            <Calendar class="w-4 h-4 text-blue-400" />
            <input 
                type="date" 
                bind:value={date} 
                onchange={onChange}
                class="bg-transparent text-white font-bold text-sm border-none outline-none uppercase tracking-wide cursor-pointer focus:ring-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full"
            />
            </div>
    </div>

    <button 
        onclick={() => changeDate(1)}
        class="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-95"
    >
        <ChevronRight class="w-5 h-5" />
    </button>
</div>