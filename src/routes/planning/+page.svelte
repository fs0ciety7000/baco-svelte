<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { CalendarDays, Plus, Loader2, ListTodo, ChevronLeft, ChevronRight, Users } from 'lucide-svelte';
  
  // --- ÉTATS ---
  let isLoading = true;
  let user = null;
  let leaveRequests = []; // Toutes les demandes de congés (Approuvées et en attente)

  // --- COULEURS ET UTILITAIRES DE PLANIFICATION ---
  
  // Couleurs Tailwind pour différencier les utilisateurs (ajoutez-en d'autres si nécessaire)
  const COLOR_CLASSES = [
    'bg-blue-500/80 text-white', 
    'bg-green-500/80 text-white', 
    'bg-indigo-500/80 text-white', 
    'bg-yellow-500/80 text-gray-900',
    'bg-red-500/80 text-white',
    'bg-purple-500/80 text-white',
    'bg-pink-500/80 text-white',
    'bg-teal-500/80 text-white',
  ];

  const userColorMap = new Map();

  /**
   * Assigne et retourne une classe de couleur stable pour un utilisateur basé sur son ID.
   * @param {string} userId - L'UUID de l'utilisateur.
   * @returns {string} - La classe Tailwind CSS.
   */
  function getUserColor(userId) {
    if (!userColorMap.has(userId)) {
      // Simple algorithme de hachage pour distribuer les couleurs
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
      }
      const colorIndex = Math.abs(hash) % COLOR_CLASSES.length;
      userColorMap.set(userId, COLOR_CLASSES[colorIndex]);
    }
    return userColorMap.get(userId);
  }

  /**
   * Vérifie si un jour donné fait partie d'une demande de congé.
   * @param {Date} date - Le jour à vérifier.
   * @returns {Array} - Les demandes de congé qui tombent ce jour-là.
   */
  function getLeavesForDay(date) {
    const dayString = date.toISOString().split('T')[0];
    return leaveRequests.filter(req => {
      // On ne veut afficher que les congés approuvés
      if (req.status !== 'APPROVED') return false; 
      
      const start = new Date(req.start_date);
      const end = new Date(req.end_date);
      const current = new Date(dayString);
      
      // Ajustement pour s'assurer que les dates sont comparables (on ignore l'heure)
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      current.setHours(0, 0, 0, 0);

      return current >= start && current <= end;
    });
  }

  // --- LOGIQUE CALENDRIER (Copie de Nav.svelte, mais mieux placée ici) ---
  
  let currentDate = new Date();
  currentDate.setDate(1); 
  $: displayedMonth = currentDate.getMonth();
  $: displayedYear = currentDate.getFullYear();
  let days = [];
  
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  
  function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }
  
  function generateCalendarDays(year, month) {
    const calendarDays = [];
    const date = new Date(year, month);
    const today = new Date();
    
    const getISOWeekday = (d) => (d.getDay() === 0 ? 7 : d.getDay());
    let startDayOfWeek = getISOWeekday(date);
    let day = new Date(date);
    day.setDate(day.getDate() - (startDayOfWeek - 1));

    let loops = 0;
    while (loops < 42 && (day.getMonth() !== month || loops < 7)) {
      const dayData = {
        date: new Date(day),
        dayOfMonth: day.getDate(),
        isCurrentMonth: day.getMonth() === month,
        isToday: day.toDateString() === today.toDateString(),
        weekNumber: getWeekNumber(day),
        isStartOfWeek: getISOWeekday(day) === 1,
        leaves: getLeavesForDay(day) // Ajoute les congés pour ce jour
      };
      calendarDays.push(dayData);
      
      day.setDate(day.getDate() + 1);
      loops++;
    }
    
    while (calendarDays.length < 42) {
      const lastDate = calendarDays[calendarDays.length - 1].date;
      lastDate.setDate(lastDate.getDate() + 1);
      const dayData = {
          date: new Date(lastDate),
          dayOfMonth: lastDate.getDate(),
          isCurrentMonth: false,
          isToday: lastDate.toDateString() === today.toDateString(),
          weekNumber: getWeekNumber(lastDate),
          isStartOfWeek: getISOWeekday(lastDate) === 1,
          leaves: getLeavesForDay(lastDate)
      };
      calendarDays.push(dayData);
    }

    return calendarDays;
  }
  
  function goToPreviousMonth() {
    currentDate = new Date(displayedYear, displayedMonth - 1, 1);
  }

  function goToNextMonth() {
    currentDate = new Date(displayedYear, displayedMonth + 1, 1);
  }

  $: {
    days = generateCalendarDays(displayedYear, displayedMonth);
  }
  // --- FIN LOGIQUE CALENDRIER ---


  // --- INITIALISATION & CHARGEMENT DES DONNÉES ---
  
  onMount(async () => {
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    user = sessionUser;
    
    await loadLeaveRequests();
    
    isLoading = false;
  });

  async function loadLeaveRequests() {
    // Note: on charge toutes les demandes d'un coup pour simplifier l'exemple.
    // Pour une application réelle, vous voudriez filtrer par année/mois pour optimiser.
    const { data, error } = await supabase
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, type, status, reason,
            profiles(full_name) 
        `)
        .order('start_date', { ascending: true });
        
    if (data) {
        leaveRequests = data;
    }
    if (error) {
        console.error("Erreur chargement congés:", error);
    }
    // Après le chargement des congés, on regénère les jours du calendrier
    days = generateCalendarDays(displayedYear, displayedMonth);
  }

  function handleNewRequest() {
    // Logique pour ouvrir une modale/formulaire
    alert("Ouvrir la modale de nouvelle demande de congé");
  }

  function showLeaveDetails(day) {
    const leaves = day.leaves.map(l => {
        const name = l.profiles?.full_name || 'Inconnu';
        return `- ${name} : ${l.type} (${l.status})`;
    }).join('\n');
    if (leaves) {
        alert(`Congés le ${day.date.toLocaleDateString('fr-FR')}:\n${leaves}`);
    }
  }

</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3 dark:text-gray-100">
            <CalendarDays class="w-6 h-6 text-blue-500" />
            Planning (Congés et Absences)
        </h1>
        <button on:click={handleNewRequest} class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <Plus class="w-4 h-4" /> Nouvelle Demande
        </button>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-blue-600" /></div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-8">
            
            <div class="space-y-4">
                <h2 class="text-xl font-semibold dark:text-white flex items-center gap-2">
                    <ListTodo class="w-5 h-5 text-yellow-500" /> Demandes en attente
                </h2>
                
                <ul class="space-y-2">
                    {#each leaveRequests.filter(r => r.status === 'PENDING') as request (request.id)}
                        <li class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-yellow-500/10 dark:bg-yellow-900/20 rounded-lg text-sm border-l-4 border-yellow-500">
                            <span class="font-medium text-gray-800 dark:text-gray-200">
                                {request.profiles?.full_name || 'Utilisateur inconnu'} ({request.type}) :
                                Du {new Date(request.start_date).toLocaleDateString('fr-FR')} 
                                au {new Date(request.end_date).toLocaleDateString('fr-FR')}
                            </span>
                            <span class="text-xs mt-1 sm:mt-0 px-2 py-0.5 bg-yellow-500 text-white rounded-full font-bold uppercase">
                                En attente
                            </span>
                        </li>
                    {:else}
                        <li class="text-gray-500 dark:text-gray-400 italic text-center py-4">
                            Aucune demande de congé en attente de validation.
                        </li>
                    {/each}
                </ul>
            </div>

            <hr class="border-gray-200 dark:border-gray-700">

            <div class="space-y-4">
                <h2 class="text-xl font-semibold dark:text-white flex items-center gap-2">
                    <Users class="w-5 h-5 text-blue-500" /> Congés de l'Équipe
                </h2>

                <div class="flex justify-between items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-3">
                    <button on:click={goToPreviousMonth} class="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white">
                        <ChevronLeft class="w-5 h-5" />
                    </button>
                    <span class="text-gray-900 dark:text-white font-bold text-lg">
                        {monthNames[displayedMonth]} {displayedYear}
                    </span>
                    <button on:click={goToNextMonth} class="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white">
                        <ChevronRight class="w-5 h-5" />
                    </button>
                </div>

                <div class="grid grid-cols-8 gap-1 text-center border border-gray-200 dark:border-gray-700 rounded-xl p-2">
                    <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 border-r dark:border-gray-700">S</div> 
                    {#each dayNames as day}
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400">{day}</div>
                    {/each}

                    {#each days as day}
                        {#if day.isStartOfWeek}
                            <div class="text-xs text-gray-500 dark:text-gray-500 pt-1 border-r dark:border-gray-700">
                                {day.weekNumber}
                            </div>
                        {/if}

                        <div
                            on:click={() => day.leaves.length > 0 && showLeaveDetails(day)}
                            class="w-full h-16 rounded-lg text-xs font-medium relative overflow-hidden transition-shadow duration-100 p-0.5 
                                {day.isCurrentMonth ? 'dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}
                                {day.isToday ? 'border-2 border-red-500' : 'hover:shadow-inner hover:bg-gray-100 dark:hover:bg-gray-700/50'}
                                {day.leaves.length > 0 ? 'cursor-pointer' : ''}"
                        >
                            <span class="block absolute top-1 left-1 font-bold 
                                {day.isToday ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}">
                                {day.dayOfMonth}
                            </span>
                            
                            <div class="absolute bottom-0 left-0 right-0 p-[2px] space-y-[1px]">
                                {#each day.leaves as leave (leave.id)}
                                    <div 
                                        class="h-3.5 w-full rounded-sm text-center font-bold overflow-hidden"
                                        class:bg-gray-400={leave.status !== 'APPROVED'}
                                        class:text-white={leave.status !== 'APPROVED'}
                                        style="background-color: {leave.status === 'APPROVED' ? '' : '#9ca3af'};"
                                        title="{leave.profiles?.full_name || 'Inconnu'} - {leave.type}"
                                        class:bg-blue-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('blue')}
                                        class:bg-green-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('green')}
                                        class:bg-indigo-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('indigo')}
                                        class:bg-yellow-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('yellow')}
                                        class:text-gray-900={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('yellow')}
                                        class:bg-red-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('red')}
                                        class:bg-purple-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('purple')}
                                        class:bg-pink-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('pink')}
                                        class:bg-teal-500/80={leave.status === 'APPROVED' && getUserColor(leave.user_id).includes('teal')}
                                    >
                                        <span class="text-[8px] leading-3 whitespace-nowrap overflow-hidden">
                                            {leave.profiles?.full_name.substring(0, 1) || '?'}{day.leaves.length > 1 ? '+' : ''}
                                        </span>
                                    </div>
                                    
                                    {#if day.leaves.indexOf(leave) >= 2}
                                        {@break}
                                    {/if}
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
                
                <p class="text-sm text-gray-500 dark:text-gray-400 pt-4 border-t dark:border-gray-700/50">
                    *Les congés sont colorés et affichent la première lettre du nom de l'utilisateur. Cliquez sur un jour marqué pour voir les détails. Seules les demandes **approuvées** sont affichées sur le planning.
                </p>
            </div>
        </div>
    {/if}
</div>