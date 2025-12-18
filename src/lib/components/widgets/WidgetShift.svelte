<script>
    import { onMount, onDestroy } from 'svelte';
    import { Clock, Briefcase, Coffee, LogOut, AlertCircle } from 'lucide-svelte';
    import { fade, fly } from 'svelte/transition';
    import { toast } from '$lib/stores/toast';
  
    // --- PROPS ---
    export let id = 'default'; 
    export let maxHours = 9; // "x heures" avant reset forcé (Sécurité)

    // --- CONFIG ---
    const SHIFTS = {
        AM:   { label: 'Matin',      start: 6,  end: 14, color: 'bg-yellow-400' },
        PM:   { label: 'Après-midi', start: 14, end: 22, color: 'bg-orange-500' },
        NUIT: { label: 'Nuit',       start: 22, end: 6,  color: 'bg-indigo-500', isNight: true }
    };

    // --- ÉTAT ---
    let activeShift = null; 
    let progress = 0;
    let timeString = "";
    let interval;
    let isOvertime = false; // Si on a dépassé 100%

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
        localStorage.removeItem(STORAGE_KEY);
    }
  
    function calculateProgressAndCheckTimeout() {
        if (!activeShift) return;

        const now = new Date();
        const config = SHIFTS[activeShift];
        
        // 1. Déterminer les bornes temporelles
        let startDate = new Date(now);
        startDate.setHours(config.start, 0, 0, 0);
        
        let endDate = new Date(now);
        endDate.setHours(config.end, 0, 0, 0);

        // Gestion Nuit & Chevauchement de jours
        if (config.isNight) {
            // Si on est le matin (0h-12h), le shift a commencé hier soir
            if (now.getHours() < 12) {
                startDate.setDate(startDate.getDate() - 1);
            } else {
                // Si on est le soir (12h-24h), le shift finit demain
                endDate.setDate(endDate.getDate() + 1);
            }
        } else {
            // Pour AM/PM, si on est très tôt le matin (ex: 1h du mat) et qu'on regarde le shift PM (14h-22h)
            // On regarde probablement celui d'hier si on est encore connecté ? 
            // La logique "hoursSinceStart" ci-dessous gérera la déconnexion.
        }

        // 2. Calcul du temps écoulé
        const elapsedMs = now - startDate;
        const totalDurationMs = endDate - startDate;
        const elapsedHours = elapsedMs / (1000 * 60 * 60);

        // 3. SÉCURITÉ : AUTO-CHECKOUT (Si > x heures)
        // Permet de nettoyer les sessions oubliées
        if (elapsedHours > maxHours) {
            checkOut(true); // True = Automatique
            return;
        }

        // 4. Calcul Pourcentage
        let pct = (elapsedMs / totalDurationMs) * 100;
        
        // Si > 100%, on est en "Overtime" (mais < maxHours)
        if (pct >= 100) {
            progress = 100;
            isOvertime = true;
        } else {
            progress = Math.max(pct, 0);
            isOvertime = false;
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
            <div class="grid grid-cols-3 gap-2 h-full" in:fly={{ y: 20, duration: 300 }}>
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
            <div class="flex flex-col justify-end h-full space-y-4" in:fly={{ y: 20, duration: 300 }}>
                
                <div class="flex justify-between text-xs font-medium text-gray-500">
                    <span>{SHIFTS[activeShift].start}h</span>
                    <span>{SHIFTS[activeShift].end}h</span>
                </div>
                
                <div class="h-4 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
                    <div 
                        class="h-full {isOvertime ? 'bg-red-500' : SHIFTS[activeShift].color} transition-all duration-1000 ease-out relative"
                        style="width: {progress}%"
                    >
                        {#if !isOvertime}
                            <div class="absolute inset-0 bg-white/20 animate-pulse"></div>
                        {/if}
                    </div>
                </div>

                <div class="flex justify-between items-center mt-2">
                    <button 
                        on:click={() => checkOut(false)}
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/20 transition-colors"
                    >
                        <LogOut class="w-3 h-3" /> Stop
                    </button>
                    
                    {#if isOvertime}
                         <span class="text-xs font-bold text-red-400 flex items-center gap-1">
                            <AlertCircle class="w-3 h-3"/> +{(new Date().getHours() - SHIFTS[activeShift].end)}h
                         </span>
                    {:else}
                        <span class="text-xs font-bold text-white bg-white/10 px-2 py-1 rounded border border-white/5">
                            {Math.round(progress)}%
                        </span>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>