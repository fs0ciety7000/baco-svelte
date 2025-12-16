<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { fade } from 'svelte/transition';
    import { toast } from '$lib/stores/toast'; 
    import { Download } from 'lucide-svelte';
    import { jsPDF } from 'jspdf';
    import html2canvas from 'html2canvas';
    // Import des icônes
    import { 
        CalendarDays, Plus, Loader2, ChevronLeft, ChevronRight, Users, 
        Edit, Trash2, X, Save, Shield, ListTodo, Cake, Check, Ban 
    } from 'lucide-svelte';
    
    // --- ÉTATS GLOBAUX ---
    let isLoading = true;
    let isSubmitting = false;
    let user = null;
    let leaveRequests = []; 
    let allProfiles = []; 
    // FIX: Déclaration de la référence
    let calendarContent;

    // --- ÉTATS DU FORMULAIRE ET MODALE ---
    
    let modalState = {
        isOpen: false,
        isEditing: false,
        leaveId: null,
    };
    
    let currentLeave = {
        start_date: '',
        end_date: '',
        type: 'CN',
        reason: ''
    };

    const LEAVE_TYPES = [
        { value: 'CN', label: 'CN' },
        { value: 'JC', label: 'JC' },
        { value: 'ZM', label: 'ZM' },
        { value: 'BT', label: 'BT' },
    ];
    
    // Mapping des statuts pour l'affichage
    const STATUS_MAP = {
        'APPROVED': 'Approuvée',
        'REJECTED': 'Refusée',
        'PENDING': 'En attente'
    };

    // --- NOUVEL ÉTAT DE CONFIRMATION DE SUPPRESSION ---
    let confirmDeleteId = null; 

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
     * Vérifie si un jour donné fait partie d'une demande de congé (tous statuts).
     */
  function getLeavesForDay(date) {
    // Crée une date de référence locale pour le jour
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    return leaveRequests.filter(req => {
        // Interpréter la chaîne de date Supabase comme étant locale (YYYY/MM/DD)
        // Note: Remplacer les tirets par des barres obliques pour garantir l'interprétation locale dans Chrome/Firefox
        const start = new Date(req.start_date.replace(/-/g, '/'));
        const end = new Date(req.end_date.replace(/-/g, '/'));
        
        // Mettre les heures à 0 (minuit local)
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        // Assurez-vous que targetDay est aussi minuit local
        targetDay.setHours(0, 0, 0, 0);

        // La comparaison est maintenant basée sur les valeurs locales
        return targetDay >= start && targetDay <= end;
    });
}

    /**
     * Vérifie si un jour donné est un anniversaire.
     */
    function getBirthdaysForDay(dayDate) {
        const currentMonth = dayDate.getMonth();
        const currentDay = dayDate.getDate();
        
        return allProfiles
            .filter(p => {
                if (!p.birthday) return false;
                // Utiliser la fonction pour éviter les problèmes de fuseau horaire
                const bday = new Date(p.birthday.replace(/-/g, '/')); 
                return bday.getDate() === currentDay && bday.getMonth() === currentMonth;
            })
            .map(p => p.full_name);
    }

    // --- LOGIQUE CALENDRIER (Fonctions inchangées) ---
    
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
                leaves: getLeavesForDay(day),
                birthdays: getBirthdaysForDay(day)
            };
            calendarDays.push(dayData);
            
            day.setDate(day.getDate() + 1);
            loops++;
        }
        
    while (calendarDays.length < 42) {
    // Récupérer la date du dernier jour ajouté
    const lastDayDate = calendarDays[calendarDays.length - 1].date; 
    
    // Créer une NOUVELLE date basée sur le jour suivant
    const nextDay = new Date(lastDayDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const dayData = {
        date: nextDay, // Utiliser la nouvelle date
        dayOfMonth: nextDay.getDate(),
        isCurrentMonth: false, // Ces jours sont toujours du mois suivant/précédent
        isToday: nextDay.toDateString() === today.toDateString(),
        weekNumber: getWeekNumber(nextDay),
        isStartOfWeek: getISOWeekday(nextDay) === 1,
        leaves: getLeavesForDay(nextDay),
        birthdays: getBirthdaysForDay(nextDay)
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
        
        await loadPlanningData();
        
        isLoading = false;
    });

    async function loadPlanningData() {
        // 1. Charger les demandes de congés
        const { data: leaves, error: leaveError } = await supabase
            .from('leave_requests')
            .select(`
                id, user_id, start_date, end_date, type, status, reason,
                profiles(full_name) 
            `)
            .order('start_date', { ascending: true });
            
        if (leaves) {
            leaveRequests = leaves;
        }
        if (leaveError) {
            console.error("Erreur chargement congés:", leaveError);
            toast.error("Erreur lors du chargement des demandes de congés."); 
        }
        
        // 2. Charger tous les profils pour les anniversaires
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, birthday');
        
        if (profiles) {
            allProfiles = profiles;
        }
        if (profileError) {
            console.error("Erreur chargement profils:", profileError);
        }

        days = generateCalendarDays(displayedYear, displayedMonth);
    }

    // Ouvre le formulaire en mode Création
    function handleNewRequest() {
        currentLeave = { start_date: '', end_date: '', type: 'CN', reason: '' };
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
            toast.error("Veuillez remplir toutes les dates requises."); 
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
                    .match({ id: modalState.leaveId, user_id: user.id }); 
    
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
                        status: 'PENDING' // Par défaut en attente
                    });
    
                if (error) throw error;
                successMessage = "Demande de congé soumise et en attente d'approbation.";
            }
    
            await loadPlanningData(); 
            closeModal();
            toast.success(successMessage); 
            
        } catch (e) {
            console.error("Erreur lors de l'opération de congé:", e);
            toast.error(`Échec de l'opération. ${e.message ? '(' + e.message + ')' : ''}`); 
        } finally {
            isSubmitting = false;
        }
    }

    // Affiche le prompt de confirmation pour la suppression
    function initiateDelete(id) {
        confirmDeleteId = id;
    }

    // Annule la suppression
    function cancelDelete() {
        confirmDeleteId = null;
    }

    // Exécute la suppression (remplace le ancien code avec `confirm()`)
    async function executeDelete(id) {
        confirmDeleteId = null; // Cacher le prompt de confirmation
        
        try {
            const { error } = await supabase
                .from('leave_requests')
                .delete()
                .match({ id: id, user_id: user.id }); 

            if (error) throw error;

            await loadPlanningData();
            toast.success("Demande de congé supprimée avec succès."); 
            
        } catch (e) {
            console.error("Erreur lors de la suppression:", e);
            toast.error(`Échec de la suppression : ${e.message}`); 
        }
    }
    
    // Fonction de gestion du statut par l'utilisateur
    async function handleStatusChange(id, newStatus) {
        if (!user) return; // Sécurité

        try {
            const { error } = await supabase
                .from('leave_requests')
                .update({ status: newStatus })
                .match({ id: id, user_id: user.id });

            if (error) throw error;

            // Mise à jour de l'état local
            leaveRequests = leaveRequests.map(req => {
                if (req.id === id) {
                    return { ...req, status: newStatus };
                }
                return req;
            });
            
            days = generateCalendarDays(displayedYear, displayedMonth);

            toast.success(`Statut de votre demande mis à jour à "${STATUS_MAP[newStatus]}."`); 
            
        } catch (e) {
            console.error("Erreur mise à jour statut:", e);
            toast.error(`Échec de la mise à jour du statut : ${e.message}`); 
        }
    }


    // --- UTILITAIRES D'AFFICHAGE ---

    /** Renvoie les demandes de l'utilisateur actuel. */
    $: myLeaveRequests = leaveRequests.filter(req => user && req.user_id === user.id);

    /** Affiche les détails d'un jour (congés + anniversaires). */
    function showLeaveDetails(day) {
        const leaves = day.leaves.map(l => {
            const name = l.profiles?.full_name || 'Inconnu';
            return `- ${name} : ${l.type} (Statut: ${STATUS_MAP[l.status] || l.status})`;
        }).join('\n');
        
        const bdays = day.birthdays.length > 0 ? `\n\n🎂 Anniversaire(s) : ${day.birthdays.join(', ')}` : '';
        
        if (leaves || bdays) {
            toast.info(`Congés le ${day.date.toLocaleDateString('fr-FR')}:\n${leaves}${bdays}`, 5000); 
        }
    }


   // --- NOUVELLE FONCTION : EXPORT PDF (CORRIGÉE pour le problème oklch) ---
async function exportPlanningToPDF() {
    if (!calendarContent) {
        toast.error("Le calendrier n'est pas chargé. Veuillez attendre que les données apparaissent.");
        return;
    }

    const dateString = new Date().toLocaleDateString('fr-FR');
    // Utilisation de displayedMonth/Year car currentMonth n'existe pas dans ce script
    const monthYear = new Date(displayedYear, displayedMonth).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    // --- FIX : Enregistrer les styles originaux et préparer l'élément pour html2canvas ---
    const originalBg = calendarContent.style.backgroundColor;
    const originalClasses = calendarContent.className; 
    
    // Simplifier les classes potentiellement problématiques (ombres, dark mode, opacités complexes)
    let tempClasses = originalClasses.replace(/\bshadow-[a-z0-9-]+\b/g, '') // Enlève toutes les classes shadow-*
                                     .replace(/\bdark:bg-[a-z0-9-]+\b/g, 'dark:bg-white') // Simplifie les fonds sombres
                                     .replace(/\bbg-[a-z0-9-]+\/[a-z0-9-]+\b/g, ''); // Enlève les opacités complexes
    
    calendarContent.className = tempClasses.trim() + ' bg-white'; // Assurer un fond blanc sûr
    calendarContent.style.backgroundColor = '#ffffff'; 
    
    // --- FIN FIX ---

    try {
        // 2. Capturer le contenu du calendrier en tant qu'image (canvas)
        const canvas = await html2canvas(calendarContent, {
            scale: 2, 
            useCORS: true,
            logging: false,
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'mm', 'a4'); 

        const imgWidth = 280; 
        const pageHeight = 210; 
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let position = 10; 

        // 3. Ajouter un titre 
        pdf.setFontSize(16);
        pdf.text(`Planning du mois de ${monthYear}`, 148.5, 15, { align: 'center' }); 
        pdf.setFontSize(10);
        pdf.text(`Exporté le ${dateString}`, 10, 20);

        // 4. Ajouter l'image au PDF
        pdf.addImage(imgData, 'PNG', 10, position + 10, imgWidth, imgHeight);

    } catch (e) {
        console.error("Erreur lors de l'export PDF:", e);
        // Fournir un message d'erreur plus spécifique à l'utilisateur
        toast.error("Échec de l'export PDF. Le système n'a pas pu traiter les couleurs. Veuillez réessayer.");
    } finally {
        // 5. Réactiver les styles originaux, même en cas d'erreur
        calendarContent.style.backgroundColor = originalBg;
        calendarContent.className = originalClasses; // Restaurer les classes d'origine
        
        // 6. Sauvegarder le fichier (déplacé ici pour ne pas sauvegarder si l'erreur s'est produite AVANT l'image)
        if (pdf) {
            pdf.save(`Planning_${monthYear.replace(' ', '_')}.pdf`);
        }
    }
}
    // --- FIN NOUVELLE FONCTION ---

</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3 dark:text-gray-100">
            <CalendarDays class="w-6 h-6 text-blue-500" />
            Planning (Congés et Absences)
        </h1>
     <!--    <button 
        on:click={exportPlanningToPDF}
        class="fpx-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-colors flex items-center gap-2"
        title="Exporter le mois actuel en PDF"
    >
        <Download class="w-4 h-4" />
        Export PDF
    </button> -->

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
                        <li class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 rounded-lg text-sm border-l-4 
                                {request.status === 'APPROVED' ? 'bg-green-500/10 dark:bg-green-900/20 border-green-500' : ''}
                                {request.status === 'REJECTED' ? 'bg-red-500/10 dark:bg-red-900/20 border-red-500' : ''}
                                {request.status === 'PENDING' ? 'bg-yellow-500/10 dark:bg-yellow-900/20 border-yellow-500' : ''}"
                        >
                            <span class="font-medium text-gray-800 dark:text-gray-200">
                                {request.profiles?.full_name || 'Moi'} ({request.type}) :
                                Du {new Date(request.start_date).toLocaleDateString('fr-FR')} 
                                au {new Date(request.end_date).toLocaleDateString('fr-FR')}
                            </span>
                            <div class="flex items-center gap-2 mt-2 sm:mt-0">
                                
                                <select 
                                    on:change={(e) => handleStatusChange(request.id, e.target.value)}
                                    class="p-1 border border-gray-300 rounded text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={request.status}
                                >
                                    <option value="APPROVED">Approuvée</option>
                                    <option value="REJECTED">Refusée</option>
                                    <option value="PENDING">En attente</option>
                                </select>
                                <button on:click={() => handleEditRequest(request)} class="p-1 rounded-full text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-gray-700 transition-colors" title="Modifier">
                                    <Edit class="w-4 h-4" />
                                </button>
                                
                                {#if confirmDeleteId === request.id}
                                    <span class="text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                                        Sûr?
                                    </span>
                                    <button on:click={() => executeDelete(request.id)} class="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors" title="Confirmer Suppression">
                                        <Check class="w-4 h-4" />
                                    </button>
                                    <button on:click={cancelDelete} class="p-1 rounded-full text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors" title="Annuler">
                                        <Ban class="w-4 h-4" />
                                    </button>
                                    {:else}
                                    <button on:click={() => initiateDelete(request.id)} class="p-1 rounded-full text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-gray-700 transition-colors" title="Supprimer">
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                {/if}
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
                
                <div class="planning-calendar-wrapper" bind:this={calendarContent} id="planning-calendar">
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
                                on:click={() => (day.leaves.length > 0 || day.birthdays.length > 0) && showLeaveDetails(day)}
                                class="w-full h-16 rounded-lg text-xs font-medium relative overflow-hidden transition-shadow duration-100 p-0.5 
                                    {day.isCurrentMonth ? 'dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}
                                    {day.isToday ? 'border-2 border-red-500' : 'hover:shadow-inner hover:bg-gray-100 dark:hover:bg-gray-700/50'}
                                    {(day.leaves.length > 0 || day.birthdays.length > 0) ? 'cursor-pointer' : ''}"
                            >
                                <span class="block absolute top-1 left-1 font-bold 
                                    {day.isToday ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}">
                                    {day.dayOfMonth}
                                </span>
                                
                                {#if day.birthdays.length > 0}
                                    <span class="absolute top-1 right-1 text-yellow-500" title="Anniversaire(s) : {day.birthdays.join(', ')}">
                                        <Cake class="w-3 h-3 fill-current" />
                                    </span>
                                {/if}
                                
                                <div class="absolute bottom-0 left-0 right-0 p-[2px] space-y-[1px]">
                                    {#each day.leaves as leave, i (leave.id)}
                                        
                                        <div 
                                            class="h-3.5 w-full rounded-sm text-center font-bold overflow-hidden text-white transition-opacity duration-300 {getUserColor(leave.user_id)}"
                                            class:opacity-50={leave.status !== 'APPROVED'} 
                                            title="{leave.profiles?.full_name || 'Inconnu'} - {leave.type} (Statut: {STATUS_MAP[leave.status]})"
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
                </div> 
                <p class="text-sm text-gray-500 dark:text-gray-400 pt-4 border-t dark:border-gray-700/50">
                    *Les demandes de congés **approuvées** (couleur pleine) et **en attente/refusées** (opacité réduite) sont affichées sur le calendrier. L'icône 🎂 indique les anniversaires.
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
                    placeholder="Ex: CN,JC, Long terme..."
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