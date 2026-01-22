<script>
    import { Calendar } from 'lucide-svelte';

    let { date = $bindable(), onChange } = $props();
</script>

<div class="relative group">
    <div class="relative glass-panel rounded-2xl p-6 shadow-2xl">
        <label class="text-xs uppercase font-bold text-theme-primary mb-3 flex items-center gap-2 tracking-widest">
            <Calendar class="w-5 h-5 animate-pulse-soft" />
            Date du rapport
        </label>
        <input
            type="date"
            bind:value={date}
            onchange={onChange}
            class="datepicker-input w-full max-w-md glass-panel rounded-xl px-5 py-3.5 text-lg font-semibold focus:ring-2 focus:ring-[rgb(var(--color-primary))] outline-none transition-all cursor-pointer border-theme-primary"
        />
    </div>
</div>

<style>
    @reference "tailwindcss";

    .animate-pulse-soft {
        animation: pulseSoft 3s ease-in-out infinite;
    }

    @keyframes pulseSoft {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.85; transform: scale(1.03); }
    }

    .datepicker-input {
        color-scheme: dark;
    }

    .datepicker-input::-webkit-calendar-picker-indicator {
        filter: brightness(0) invert(1);
        cursor: pointer;
        opacity: 1;
    }

    .datepicker-input::-webkit-calendar-picker-indicator:hover {
        opacity: 0.8;
        transform: scale(1.1);
    }
</style>
