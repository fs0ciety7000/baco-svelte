<script>
    // Calendrier d'activité façon GitHub : grille semaines (colonnes) x jours (lignes),
    // intensité de couleur selon le nombre de commandes du jour.

    let { counts = {}, from, to } = $props();

    const DAY_LABELS = ['Lun', '', 'Mer', '', 'Ven', '', ''];
    const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    function toISODate(d) { return d.toISOString().split('T')[0]; }

    // Construit les semaines (colonnes) entre `from` et `to`, alignées sur lundi.
    let weeks = $derived.by(() => {
        if (!from || !to) return [];
        const start = new Date(from + 'T00:00:00');
        const end = new Date(to + 'T00:00:00');

        // Aligne le début sur le lundi de la semaine
        const startDay = start.getDay() || 7;
        start.setDate(start.getDate() - startDay + 1);

        const result = [];
        let cursor = new Date(start);
        let guard = 0;
        while (cursor <= end && guard < 60) {
            const week = [];
            for (let i = 0; i < 7; i++) {
                const iso = toISODate(cursor);
                week.push({ date: iso, count: counts[iso] || 0, inRange: cursor >= new Date(from + 'T00:00:00') && cursor <= end });
                cursor.setDate(cursor.getDate() + 1);
            }
            result.push(week);
            guard++;
        }
        return result;
    });

    // Étiquettes de mois positionnées au-dessus de la première semaine de chaque mois
    let monthMarkers = $derived.by(() => {
        const markers = [];
        let lastMonth = null;
        weeks.forEach((week, i) => {
            const firstOfWeek = new Date(week[0].date + 'T00:00:00');
            const m = firstOfWeek.getMonth();
            if (m !== lastMonth) {
                markers.push({ index: i, label: MONTH_LABELS[m] });
                lastMonth = m;
            }
        });
        return markers;
    });

    function intensityClass(count) {
        if (count === 0) return 'bg-white/5';
        if (count === 1) return 'bg-orange-900/60';
        if (count <= 3) return 'bg-orange-700/70';
        if (count <= 6) return 'bg-orange-500/80';
        return 'bg-orange-400';
    }
</script>

<div class="overflow-x-auto custom-scrollbar pb-2">
    <div class="inline-block min-w-full">
        <!-- Étiquettes de mois -->
        <div class="flex gap-[3px] mb-1 pl-6 relative h-3">
            {#each monthMarkers as m}
                <span class="absolute text-[9px] text-gray-500 font-bold" style="left: {24 + m.index * 13}px">{m.label}</span>
            {/each}
        </div>

        <div class="flex gap-[3px]">
            <!-- Étiquettes de jours -->
            <div class="flex flex-col gap-[3px] pr-1 shrink-0">
                {#each DAY_LABELS as d}
                    <span class="h-[10px] text-[8px] text-gray-600 leading-[10px]">{d}</span>
                {/each}
            </div>

            <!-- Grille -->
            {#each weeks as week}
                <div class="flex flex-col gap-[3px]">
                    {#each week as day}
                        <div
                            class="w-[10px] h-[10px] rounded-sm {day.inRange ? intensityClass(day.count) : 'bg-transparent'}"
                            title={day.inRange ? `${day.count} commande${day.count !== 1 ? 's' : ''} — ${new Date(day.date + 'T00:00:00').toLocaleDateString('fr-BE')}` : ''}
                        ></div>
                    {/each}
                </div>
            {/each}
        </div>

        <!-- Légende -->
        <div class="flex items-center gap-1.5 mt-2 pl-6 text-[9px] text-gray-600">
            <span>Moins</span>
            <div class="w-[10px] h-[10px] rounded-sm bg-white/5"></div>
            <div class="w-[10px] h-[10px] rounded-sm bg-orange-900/60"></div>
            <div class="w-[10px] h-[10px] rounded-sm bg-orange-700/70"></div>
            <div class="w-[10px] h-[10px] rounded-sm bg-orange-500/80"></div>
            <div class="w-[10px] h-[10px] rounded-sm bg-orange-400"></div>
            <span>Plus</span>
        </div>
    </div>
</div>
