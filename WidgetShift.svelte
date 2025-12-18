<script>
    import { onMount, onDestroy } from 'svelte';
    import { Clock, Briefcase, Coffee } from 'lucide-svelte';
  
    // --- CONFIGURATION DES SHIFTS ---
    // AM: 06h-14h | PM: 14h-22h | NUIT: 22h-06h
    
    let currentShift = null;
    let progress = 0;
    let timeString = "";
    let interval;
  
    function calculateShift() {
        const now = new Date();
        const currentHour = now.getHours();
        timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
        let shiftName = "";
        let startH, endH;
        let isNightShift = false;
  
        // Détermination du Shift
        if (currentHour >= 6 && currentHour < 14) {
            shiftName = "Matin (AM)";
            startH = 6; endH = 14;
        } else if (currentHour >= 14 && currentHour < 22) {
            shiftName = "Après-midi (PM)";
            startH = 14; endH = 22;
        } else {
            shiftName = "Nuit";
            startH = 22; endH = 6;
            isNightShift = true;
        }
  
        // Création des objets Date pour le calcul précis
        const startDate = new Date(now);
        startDate.setHours(startH, 0, 0, 0);
        
        const endDate = new Date(now);
        endDate.setHours(endH, 0, 0, 0);
  
        // Gestion du décalage de jour pour la nuit (ex: il est 23h, fin est demain 6h)
        if (isNightShift) {
            if (currentHour >= 22) {
                endDate.setDate(endDate.getDate() + 1); // Fin demain
            } else {
                startDate.setDate(startDate.getDate() - 1); // Début hier
            }
        }
  
        // Calcul du pourcentage
        const totalDuration = endDate - startDate;
        const elapsed = now - startDate;
        let pct = (elapsed / totalDuration) * 100;
        
        // Bornes 0-100
        progress = Math.min(Math.max(pct, 0), 100);
  
        // Estimation Pause (au milieu du shift +/-)
        // Simple calcul visuel pour l'UI
        
        currentShift = {
            name: shiftName,
            start: `${startH}:00`,
            end: `${endH}:00`,
            isNight: isNightShift
        };
    }
  
    onMount(() => {
        calculateShift();
        interval = setInterval(calculateShift, 60000); // Mise à jour chaque minute
    });
  
    onDestroy(() => clearInterval(interval));

    // Couleurs dynamiques selon le shift
    $: barColor = currentShift?.name.includes('Matin') ? 'bg-yellow-400' 
                : currentShift?.name.includes('Après') ? 'bg-orange-500' 
                : 'bg-indigo-500';
</script>
  
<div class="h-full flex flex-col justify-between bg-gradient-to-br from-[#0f1115] to-[#1a1d24] rounded-xl border border-white/5 p-5 relative overflow-hidden group">
    
    <div class="flex justify-between items-start z-10">
        <div>
            <div class="flex items-center gap-2 text-gray-400 mb-1">
                <Briefcase class="w-4 h-4" />
                <span class="text-xs font-bold uppercase tracking-wider">Mon Service</span>
            </div>
            <h3 class="text-xl font-bold text-white tracking-tight">
                {currentShift?.name || 'Hors Service'}
            </h3>
        </div>
        <div class="text-right">
            <p class="text-2xl font-mono text-white font-bold">{timeString}</p>
        </div>
    </div>
  
    <div class="mt-4 z-10">
        <div class="flex justify-between text-xs font-medium text-gray-500 mb-2">
            <span>{currentShift?.start}</span>
            <span class="flex items-center gap-1 text-gray-600"><Coffee class="w-3 h-3"/> Pause</span>
            <span>{currentShift?.end}</span>
        </div>
        
        <div class="h-4 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
            <div 
                class="h-full {barColor} transition-all duration-1000 ease-out relative"
                style="width: {progress}%"
            >
                <div class="absolute inset-0 bg-white/20 animate-pulse"></div>
                <div class="absolute right-0 top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_10px_white]"></div>
            </div>

            <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/10 border-l border-dashed border-white/20 h-full"></div>
        </div>
        
        <div class="mt-2 text-right">
            <span class="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                {Math.round(progress)}% complété
            </span>
        </div>
    </div>

    <div class="absolute -bottom-5 -right-5 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
        <Clock size={120} />
    </div>
</div>