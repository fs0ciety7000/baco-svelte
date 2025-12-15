<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { fade } from 'svelte/transition';
    import { toast } from '$lib/stores/toast'; // Import du store Toast
    
    // Import des icônes
    import { CalendarDays, Plus, Loader2, ChevronLeft, ChevronRight, Users, Edit, Trash2, X, Save } from 'lucide-svelte';
    
    // --- ÉTATS GLOBAUX ---
    let isLoading = true;
    let isSubmitting = false;
    let user = null;
    let leaveRequests = []; // Toutes les demandes de congés (Maintenant toutes APPROUVÉES)

    // --- ÉTATS DU FORMULAIRE ET MODALE ---
    
    let modalState = {
        isOpen: false,
        isEditing: false,
        leaveId: null,
    };
    
    let currentLeave = {
        start_date: '',
        end_date: '',
        type: 'PAID',
        reason: ''
    };

    const LEAVE_TYPES = [
        { value: 'PAID', label: 'Congé Payé (CP)' },
        { value: 'UNPAID', label: 'Congé sans Solde (CSS)' },
        { value: 'RTT', label: 'RTT' },
        { value: 'SICK', label: 'Arrêt Maladie (à titre indicatif)' },
    ];

    // --- COULEURS ET UTILITAIRES DE PLANIFICATION ---
    
    // Couleurs Tailwind pour différencier les utilisateurs
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

    /** Assigne et retourne une classe de couleur stable pour un utilisateur. */
    function getUserColor(userId) {
        if (!userColorMap.has(userId)) {
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
            const start = new Date(req.start_date);
            const end = new Date(req.end_date);
            const current = new Date(dayString);
            
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);
            current.setHours(0, 0, 0, 0);

            // Comme toutes les demandes sont APPROUVÉES, on n'a plus besoin de vérifier le statut.
            return current >= start && current <= end;
        });
    }

    // --- LOGIQUE CALENDRIER ---
    
    let currentDate = new Date();
    currentDate.setDate(1); 
    $: displayedMonth = currentDate.getMonth();
    $: displayedYear = currentDate.getFullYear();
    let days = [];
    
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    
    // (Fonctions getWeekNumber, generateCalendarDays, goToPreviousMonth, goToNextMonth inchangées)
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
                leaves: getLeavesForDay(day)
            };
            calendarDays.push(dayData);
            
            day.setDate(day.getDate() + 1);
            loops++;
        }
        
        while (calendarDays.length < 42) {
            const lastDate = calendarDays[calendarDays.length - 1]?.date || new Date(year, month, 1);
            if(calendarDays.length > 0) {
                lastDate.setDate(lastDate.getDate() + 1);
            } else {
                // S'assurer qu'on ne boucle pas si la date de départ est en fin de mois précédent
                lastDate.setDate(lastDate.getDate()); 
            }
            
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


    // --- GESTION DES DEMANDES (CRUD) ---

    onMount(async () => {
        const { data: { user: sessionUser } } = await supabase.auth.getUser();
        user = sessionUser;
        
        await loadLeaveRequests();
        
        isLoading = false;
    });

    async function loadLeaveRequests() {
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
            toast.push({ message: "Erreur lors du chargement des demandes de congés.", type: "error" });
        }
        days = generateCalendarDays(displayedYear, displayedMonth);
    }

    // Ouvre le formulaire en mode Création
    function handleNewRequest() {
        currentLeave = { start_date: '', end_date: '', type: 'PAID', reason: '' };
        modalState = { isOpen: true, isEditing: false, leaveId: null };
    }

    // Ouvre le formulaire en mode Modification
    function handleEditRequest(leave) {
        // Format dates to YYYY-MM-DD for input type="date"
        const start_date = new Date(leave.start_date).toISOString().split('T')[0];
        const end_date = new Date(leave.end_date).toISOString().split('T')[0];

        currentLeave = {
            start_date: start_date,
            end_date: end_date,
            type: leave.type,
            reason: leave.reason || ''
        };
        modalState = { isOpen: true, isEditing: true, leaveId: leave.id };
    }
    
    // Ferme et réinitialise la modale
    function closeModal() {
        modalState = { isOpen: false, isEditing: false, leaveId: null };
    }


    async function saveLeave() {
        if (!user || !currentLeave.start_date || !currentLeave.end_date) {
            toast.push({ message: "Veuillez remplir toutes les dates requises.", type: "error" });
            return;
        }
        
        isSubmitting = true;
        let successMessage = '';

        try {
            if (modalState.isEditing) {
                // Modification (UPDATE)
                const { error } = await supabase
                    .from('leave_requests')
                    .update({
                        start_date: currentLeave.start_date,
                        end_date: currentLeave.end_date,
                        type: currentLeave.type,
                        reason: currentLeave.reason,
                    })
                    .match({ id: modalState.leaveId, user_id: user.id }); // Seul l'utilisateur peut modifier sa demande
    
                if (error) throw error;
                successMessage = "Demande de congé modifiée avec succès !";
                
            } else {
                // Création (INSERT)
                const { error } = await supabase
                    .from('leave_requests')
                    .insert({
                        user_id: user.id,
                        start_date: currentLeave.start_date,
                        end_date: currentLeave.end_date,
                        type: currentLeave.type,
                        reason: currentLeave.reason,
                        status: 'APPROVED' // AUTOMATIC APPROVAL
                    });
    
                if (error) throw error;
                successMessage = "Demande de congé soumise et APPROUVÉE automatiquement !";
            }
    
            await loadLeaveRequests(); 
            closeModal();
            toast.push({ message: successMessage, type: "success" });
            
        } catch (e) {
            console.error("Erreur lors de l'opération de congé:", e);
            toast.push({ message: `Échec de l'opération. ${e.message ? '(' + e.message + ')' : ''}`, type: "error" });
        } finally {
            isSubmitting = false;
        }
    }

    async function deleteLeave(id) {
        if (!confirm("Êtes-vous sûr de vouloir supprimer cette demande de congé ? Cette action est irréversible.")) {
            return;
        }
        
        try {
            const { error } = await supabase
                .from('leave_requests')
                .delete()
                .match({ id: id, user_id: user.id }); // Seul l'utilisateur peut supprimer sa demande

            if (error) throw error;

            await loadLeaveRequests();
            toast.push({ message: "Demande de congé supprimée avec succès.", type: "success" });
            
        } catch (e) {
            console.error("Erreur lors de la suppression:", e);
            toast.push({ message: `Échec de la suppression : ${e.message}`, type: "error" });
        }
    }
    
    // --- UTILITAIRES D'AFFICHAGE ---

    /** Renvoie les demandes de l'utilisateur actuel. */
    $: myLeaveRequests = leaveRequests.filter(req => user && req.user_id === user.id);

    /** Affiche les détails d'un jour. */
    function showLeaveDetails(day) {
        const leaves = day.leaves.map(l => {
            const name = l.profiles?.full_name || 'Inconnu';
            return `- ${name} : ${l.type}`; // Pas besoin de statut, car tout est approuvé
        }).join('\n');
        if (leaves) {
            toast.push({ 
                message: `Congés le ${day.date.toLocaleDateString('fr-FR')}:\n${leaves}`, 
                type: 'info',
                duration: 5000 
            });
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
                    <Edit class="w-5 h-5 text-blue-500" /> Mes Demandes de Congés
                </h2>
                
                <ul class="space-y-2">
                    {#each myLeaveRequests as request (request.id)}
                        <li class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-blue-500/10 dark:bg-blue-900/20 rounded-lg text-sm border-l-4 border-blue-500">
                            <span class="font-medium text-gray-800 dark:text-gray-200">
                                {request.profiles?.full_name || 'Moi'} ({request.type}) :
                                Du {new Date(request.start_date).toLocaleDateString('fr-FR')} 
                                au {new Date(request.end_date).toLocaleDateString('fr-FR')}
                            </span>
                            <div class="flex items-center gap-2 mt-2 sm:mt-0">
                                <span class="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full font-bold uppercase">
                                    Approuvée
                                </span>
                                <button on:click={() => handleEditRequest(request)} class="p-1 rounded-full text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-gray-700 transition-colors" title="Modifier">
                                    <Edit class="w-4 h-4" />
                                </button>
                                <button on:click={() => deleteLeave(request.id)} class="p-1 rounded-full text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-gray-700 transition-colors" title="Supprimer">
                                    <Trash2 class="w-4 h-4" />
                                </button>
                            </div>
                        </li>
                    {:else}
                        <li class="text-gray-500 dark:text-gray-400 italic text-center py-4">
                            Aucune demande de congé enregistrée par vous.
                        </li>
                    {/each}
                </ul>
            </div>

            <hr class="border-gray-200 dark:border-gray-700">

            <div class="space-y-4">
                <h2 class="text-xl font-semibold dark:text-white flex items-center gap-2">
                    <Users class="w-5 h-5 text-blue-500" /> Calendrier de l'Équipe
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
                                {#each day.leaves as leave, i (leave.id)}
                                   

                                    <div 
                                        class="h-3.5 w-full rounded-sm text-center font-bold overflow-hidden text-white transition-opacity duration-300 {getUserColor(leave.user_id)}"
                                        title="{leave.profiles?.full_name || 'Inconnu'} - {leave.type} (Approuvé)"
                                    >
                                        <span class="text-[8px] leading-3 whitespace-nowrap overflow-hidden">
                                            {leave.profiles?.full_name.substring(0, 1) || '?'}{day.leaves.length > 3 && i === 2 ? '+' : ''}
                                        </span>
                                    </div>
                                    
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
                
                <p class="text-sm text-gray-500 dark:text-gray-400 pt-4 border-t dark:border-gray-700/50">
                    *Toutes les demandes de congés sont automatiquement approuvées et affichées. Les congés sont colorés par utilisateur.
                </p>
            </div>
        </div>
    {/if}
</div>

{#if modalState.isOpen}
<div class="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" transition:fade>
    <div 
        class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full transform transition-all p-6 space-y-5"
        role="dialog"
        aria-modal="true"
    >
        <div class="flex justify-between items-center">
            <h3 class="text-xl font-bold dark:text-white">
                {modalState.isEditing ? 'Modifier ma Demande de Congé' : 'Soumettre une Nouvelle Demande'}
            </h3>
            <button on:click={closeModal} class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X class="w-6 h-6" />
            </button>
        </div>

        <form on:submit|preventDefault={saveLeave} class="space-y-4">
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label for="start_date" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de Début</label>
                    <input 
                        type="date" 
                        id="start_date" 
                        bind:value={currentLeave.start_date} 
                        required
                        class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white"
                    >
                </div>
                <div>
                    <label for="end_date" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de Fin</label>
                    <input 
                        type="date" 
                        id="end_date" 
                        bind:value={currentLeave.end_date} 
                        required
                        class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white"
                    >
                </div>
            </div>

            <div>
                <label for="leave_type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de Congé</label>
                <select 
                    id="leave_type" 
                    bind:value={currentLeave.type}
                    class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white"
                >
                    {#each LEAVE_TYPES as type}
                        <option value={type.value}>{type.label}</option>
                    {/each}
                </select>
            </div>

            <div>
                <label for="reason" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Raison (Optionnel)</label>
                <textarea 
                    id="reason" 
                    bind:value={currentLeave.reason} 
                    rows="3"
                    class="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white"
                    placeholder="Ex: Voyage familial, RTT imposée, etc."
                ></textarea>
            </div>

            <div class="flex justify-end space-x-3 pt-2">
                <button 
                    type="button" 
                    on:click={closeModal} 
                    class="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    Annuler
                </button>
                <button 
                    type="submit" 
                    disabled={isSubmitting}
                    class="px-4 py-2 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-2"
                >
                    {#if isSubmitting}
                        <Loader2 class="w-4 h-4 animate-spin" /> {modalState.isEditing ? 'Sauvegarde...' : 'Envoi en cours...'}
                    {:else}
                        <Save class="w-4 h-4" /> {modalState.isEditing ? 'Sauvegarder' : 'Soumettre la Demande'}
                    {/if}
                </button>
            </div>
        </form>

    </div>
</div>
{/if}