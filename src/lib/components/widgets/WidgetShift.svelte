<script>
    import { onMount, onDestroy } from 'svelte';
    import { Clock, Briefcase, Coffee, LogOut, AlertCircle, Timer } from 'lucide-svelte';
    import { fade, fly } from 'svelte/transition';
    import { toast } from '$lib/stores/toast';
  
    // --- PROPS ---
    export let id = 'default'; 
    export let maxHours = 12;

 // --- CONFIG ---
    const SHIFTS = {
        AM:    { label: 'Matin',       start: 6,  end: 14, color: 'bg-yellow-400' },
        EXTRA: { label: 'Extra 10-18', start: 10, end: 18, color: 'bg-pink-500' },   // <--- NOUVEL AJOUT
        PM:    { label: 'Après-midi',  start: 14, end: 22, color: 'bg-orange-500' },
        NUIT:  { label: 'Nuit',        start: 22, end: 6,  color: 'bg-indigo-500', isNight: true }
    };

    // --- ÉTAT ---
    let activeShift = null; 
    let progress = 0;
    let timeString = "";
    let remainingString = ""; // Temps restant formaté (ex: 2h 15m)
    let interval;
    let isOvertime = false;

    const STORAGE_KEY = `baco_shift_checkin_${id}`;

    onMount(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && SHIFTS[saved]) {
            activeShift = saved;
        }
        updateTime();
        interval = setInterval(updateTime, 1000);
    });
  
    onDestroy(() => clearInterval(interval));

    function updateTime() {
        const now = new Date();
        timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        if (activeShift) {
            calculateProgressAndCheckTimeout();
        }
    }

    function checkIn(shiftKey) {
        activeShift = shiftKey;
        localStorage.setItem(STORAGE_KEY, shiftKey);
        calculateProgressAndCheckTimeout();
        toast.success(`Début de service : ${SHIFTS[shiftKey].label}`);
    }

    function checkOut(auto = false) {
        if (auto) toast.info("Fin de service automatique (Temps écoulé)");
        else toast.success("Service terminé. Bonne route !");

        activeShift = null;
        progress = 0;
        isOvertime = false;
        remainingString = "";
        localStorage.removeItem(STORAGE_KEY);
    }
  
    function calculateProgressAndCheckTimeout() {
        if (!activeShift) return;

        const now = new Date();
        const config = SHIFTS[activeShift];
        
        let startDate = new Date(now);
        startDate.setHours(config.start, 0, 0, 0);
        
        let endDate = new Date(now);
        endDate.setHours(config.end, 0, 0, 0);

        if (config.isNight) {
            if (now.getHours() < 12) {
                startDate.setDate(startDate.getDate() - 1);
            } else {
                endDate.setDate(endDate.getDate() + 1);
            }
        }

        const elapsedMs = now - startDate;
        const totalDurationMs = endDate - startDate;
        const elapsedHours = elapsedMs / (1000 * 60 * 60);

        // Sécurité
        if (elapsedHours > maxHours) {
            checkOut(true);
            return;
        }

        // Calcul pourcentage
        let pct = (elapsedMs / totalDurationMs) * 100;

        // Calcul du temps restant
        const remainingMs = totalDurationMs - elapsedMs;
        
        if (remainingMs > 0) {
            const h = Math.floor(remainingMs / (1000 * 60 * 60));
            const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            remainingString = `${h}h ${m.toString().padStart(2, '0')}m`;
            isOvertime = false;
            progress = Math.max(pct, 0);
        } else {
            isOvertime = true;
            progress = 100;
            const overdueMs = Math.abs(remainingMs);
            const h = Math.floor(overdueMs / (1000 * 60 * 60));
            const m = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));
            remainingString = `+ ${h}h ${m}m`;
        }
    }
</script>

<div class="h-full flex flex-col bg-gradient-to-br from-[#0f1115] to-[#1a1d24] rounded-xl border border-white/5 relative overflow-hidden group shadow-lg">
    
    <div class="flex justify-between items-start p-5 pb-0 z-10">
        <div>
            <div class="flex items-center gap-2 text-gray-400 mb-1">
                <Briefcase class="w-4 h-4" />
                <span class="text-xs font-bold uppercase tracking-wider">Mon Service</span>
            </div>
            {#if activeShift}
                <div class="flex items-center gap-2" in:fade>
                    <h3 class="text-xl font-bold text-white tracking-tight">
                        {SHIFTS[activeShift].label}
                    </h3>
                    {#if isOvertime}
                        <span class="px-1.5 py-0.5 rounded bg-red-500 text-[10px] font-bold text-white animate-pulse">FIN</span>
                    {/if}
                </div>
            {:else}
                <h3 class="text-xl font-bold text-white tracking-tight" in:fade>
                    Check-in
                </h3>
            {/if}
        </div>
        <div class="text-right">
            <p class="text-2xl font-mono text-white font-bold tracking-wider">{timeString}</p>
        </div>
    </div>

    <div class="flex-grow p-5 pt-4 relative z-10">
        
        {#if !activeShift}
            <div class="grid grid-cols-2 gap-2 h-full" in:fly={{ y: 20, duration: 300 }}>
                {#each Object.entries(SHIFTS) as [key, conf]}
                    <button 
                        on:click={() => checkIn(key)} 
                        class="flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-{conf.color.replace('bg-', '')} rounded-lg transition-all hover:scale-105 group/btn"
                    >
                        <span class="text-lg font-bold text-gray-200 group-hover/btn:text-white">{key}</span>
                        <span class="text-[10px] text-gray-500">{conf.start}h-{conf.end}h</span>
                        <div class="w-8 h-1 rounded-full {conf.color} opacity-50 group-hover/btn:opacity-100"></div>
                    </button>
                {/each}
            </div>

        {:else}
            <div class="flex flex-col justify-between h-full space-y-4" in:fly={{ y: 20, duration: 300 }}>
                
                <div class="flex-grow flex flex-col items-center justify-center relative py-2">
                    <div class="absolute inset-0 bg-gradient-to-b {isOvertime ? 'from-red-500/20' : 'from-blue-500/20'} to-transparent blur-xl rounded-full opacity-50"></div>
                    
                    <span class="text-xs uppercase tracking-[0.2em] text-gray-400 mb-1 font-bold z-10">
                        {#if isOvertime}DÉPASSEMENT{:else}TEMPS RESTANT{/if}
                    </span>
                    
                    <div class="relative z-10 flex items-baseline gap-2">
                        {#if !isOvertime}
                             <Timer class="w-6 h-6 text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.8)]" />
                        {:else}
                             <AlertCircle class="w-6 h-6 text-red-400 animate-pulse" />
                        {/if}

                        <span class="text-5xl font-black tracking-tighter text-transparent bg-clip-text 
                            {isOvertime 
                                ? 'bg-gradient-to-b from-white via-red-300 to-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.6)]' 
                                : 'bg-gradient-to-b from-white via-blue-200 to-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]'}"
                        >
                            {remainingString}
                        </span>
                    </div>
                </div>
                
                <div class="space-y-1">
                    <div class="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        <span>{SHIFTS[activeShift].start}h00</span>
                        <span>{SHIFTS[activeShift].end}h00</span>
                    </div>
                    
                    <div class="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/10 relative shadow-inner">
                        <div 
                            class="h-full {isOvertime ? 'bg-red-500 animate-pulse' : SHIFTS[activeShift].color} transition-all duration-1000 ease-out relative"
                            style="width: {progress}%"
                        >
                            {#if !isOvertime}
                                <div class="absolute inset-0 bg-white/30 animate-[pulse_2s_infinite]"></div>
                                <div class="absolute top-0 bottom-0 w-20 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 animate-[shimmer_2s_infinite]"></div>
                            {/if}
                        </div>
                    </div>
                </div>

                <div class="flex justify-between items-center pt-2 border-t border-white/5">
                    <button 
                        on:click={() => checkOut(false)}
                        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/20 hover:border-red-500/50 transition-all hover:scale-105 shadow-lg shadow-red-900/10"
                    >
                        <LogOut class="w-3.5 h-3.5" /> Fin de service
                    </button>
                    
                    <span class="text-xs font-bold text-white bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 shadow-inner">
                        {Math.round(progress)}%
                    </span>
                </div>
            </div>
        {/if}
    </div> </div> <style>
    @keyframes shimmer {
        0% { transform: translateX(-150%); }
        100% { transform: translateX(400%); }
    }
</style>