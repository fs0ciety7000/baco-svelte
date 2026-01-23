<script>
    import { onMount } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { toast } from '$lib/stores/toast';
    import { CalendarDays, Plus, Loader2, FileText, Edit, Trash2 } from 'lucide-svelte';
    
    // Auth & Logic
    import { supabase } from '$lib/supabase';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { PlanningService } from '$lib/services/planning.service.js';
    import { generateCalendarDays } from '$lib/utils/calendar.helpers.js';

    // Components
    import PlanningSidebar from './components/PlanningSidebar.svelte';
    import PlanningCalendar from './components/PlanningCalendar.svelte';
    import PlanningLeaveModal from './components/PlanningLeaveModal.svelte';

    // --- STATE (Runes) ---
    let isLoading = $state(true);
    let isSubmitting = $state(false);
    let currentUser = $state(null);
    let isAuthorized = $state(false);

    // Data
    let leaveRequests = $state([]);
    let allProfiles = $state([]);
    let planningMap = $state({}); // { "2024-01-01_A": [user1, user2] }
    
    // Calendar State
    let currentDate = $state(new Date());
    let displayedMonth = $derived(currentDate.getMonth());
    let displayedYear = $derived(currentDate.getFullYear());
    
    // Modal State
    let modalState = $state({ isOpen: false, isEditing: false, leaveId: null });
    let currentLeave = $state(getInitialLeave());

    // --- DERIVED ---
    // Calendrier recalculé automatiquement quand date ou congés changent
    let days = $derived(generateCalendarDays(displayedYear, displayedMonth, leaveRequests));

    // Mes demandes
    let myLeaveRequests = $derived(
        currentUser ? leaveRequests.filter(l => l.user_id === currentUser.id) : []
    );

    // Effectifs pour Sidebar (copie pour DND)
    let availableStaff = $state([]);

    // --- CONSTANTS ---
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const STATUS_OPTIONS = [
        { value: 'PENDING', label: 'En attente', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
        { value: 'APPROVED', label: 'Accepté par TS', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
        { value: 'REJECTED', label: 'Refusé', color: 'text-red-400 bg-red-400/10 border-red-400/20' }
    ];

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.PLANNING_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        await loadAllData();
        isLoading = false;
    });

    // --- DATA LOADING ---
    async function loadAllData() {
        try {
            const [profiles, leaves, planning] = await Promise.all([
                PlanningService.loadProfiles(),
                PlanningService.loadLeaves(),
                PlanningService.loadPlanning()
            ]);

            allProfiles = profiles;
            leaveRequests = leaves;
            
            // Initialisation Sidebar
            resetSidebar();

            // Mapping du Planning
            const newMap = {};
            // Init empty zones for displayed month to ensure reactivity
            // (Note: Optimisation possible, mais on garde la logique d'origine qui charge tout pour l'instant)
            
            if (planning) {
                planning.forEach(p => {
                    const key = `${p.date}_${p.shift}`;
                    if (!newMap[key]) newMap[key] = [];
                    const userProfile = allProfiles.find(u => u.id === p.user_id);
                    if (userProfile) {
                        newMap[key].push({ ...userProfile, planningId: p.id, id: p.id }); // Attention: DND a besoin d'un ID unique pour l'item draggable
                        // Note: Ici l'ID pour le DND doit être unique. Si on utilise l'ID profile, on ne peut pas mettre le même user 2 fois le même jour (ce qui est logique)
                        // Mais dans la map, on stocke des objets qui ont besoin d'une clé 'id' pour svelte-dnd-action. 
                        // L'ID du planning 'p.id' est parfait.
                    }
                });
            }
            planningMap = newMap;

        } catch(e) {
            console.error(e);
            toast.error("Erreur chargement données");
        }
    }

    function resetSidebar() {
        // Pour la sidebar, l'ID doit être l'ID du profil
        availableStaff = allProfiles.map(p => ({...p, id: p.id})); 
    }

    // --- ACTIONS CALENDRIER ---
    function prevMonth() {
        currentDate = new Date(displayedYear, displayedMonth - 1, 1);
    }
    
    function nextMonth() {
        currentDate = new Date(displayedYear, displayedMonth + 1, 1);
    }

    // --- ACTIONS DND ---
    // Update local sidebar list (visual only)
    function handleSidebarUpdate(items) {
        availableStaff = items;
        // Si drop fini, on reset pour remettre tout le monde
        // (Optionnel : dépend de si on veut que l'user disparaisse de la liste quand il est planifié)
        // Dans le code original : resetSidebar() est appelé sur finalize.
    }

    // Update Zone (Planning)
    async function handleZoneChange(dateKey, shift, items, info) {
        const key = `${dateKey}_${shift}`;
        
        // Optimistic UI Update
        const oldItems = planningMap[key];
        planningMap[key] = items; 
        
        // Si c'est juste un survol (consider), on s'arrête là
        if (info.trigger !== 'dropped' && info.trigger !== 'droppedIntoZone') return;

        // Validation Permission
        if (!hasPermission(currentUser, ACTIONS.PLANNING_WRITE)) {
            toast.error("Non autorisé.");
            planningMap[key] = oldItems; // Revert
            return;
        }

        // Sauvegarde (Upsert)
        // On cherche quel item a été dropé
        // info.id contient l'ID de l'élément déplacé. 
        // Si ça vient de la sidebar, c'est un UserID. Si ça vient d'une autre zone, c'est un PlanningID.
        // C'est là que ça se complique. Pour simplifier, on regarde le dernier item ajouté ou on déduit.
        
        // Simplification robuste : On regarde quel item n'a pas de 'planningId' ou si on peut identifier le drop
        // Dans le code original, on cherchait l'item dans 'items' qui correspond à info.id
        
        const droppedItem = items.find(i => String(i.id) === String(info.id));
        if (!droppedItem) return; // Bizarre

        // Si l'item vient de la sidebar, son ID est un UserID (uuid).
        // S'il vient d'une autre zone, son ID est un PlanningID (int).
        // Mais attendez, dans la sidebar j'ai mis id: p.id (uuid).
        
        const userId = droppedItem.user_id || droppedItem.id; // Fallback si structure différente

        try {
            const savedData = await PlanningService.upsertShift({
                user_id: userId,
                date: dateKey,
                shift: shift
            });
            
            // Mise à jour de l'ID avec le vrai ID de planning retourné par la DB
            // Pour que le prochain drag de cet item ait le bon ID
            if (savedData && savedData.length > 0) {
                const realId = savedData[0].id;
                // On met à jour l'item dans la map pour lui donner son vrai ID de planning (pour qu'on puisse le supprimer/bouger après)
                const index = items.indexOf(droppedItem);
                if (index !== -1) {
                    const newItems = [...items];
                    newItems[index] = { ...droppedItem, id: realId, planningId: realId }; // On remplace l'ID temporaire par l'ID planning
                    planningMap[key] = newItems;
                }
            }
            
            // Refresh sidebar pour remettre le staff dispo (si voulu)
            resetSidebar();
            
        } catch(e) {
            toast.error("Erreur sauvegarde: " + e.message);
            planningMap[key] = oldItems; // Revert
        }
    }

    async function handleRemoveShift(dateKey, shift, planningId) {
        if (!hasPermission(currentUser, ACTIONS.PLANNING_DELETE)) {
            return toast.error("Suppression non autorisée.");
        }

        // Note: planningId est l'ID de la ligne dans la table 'planning'
        // Mais `deleteShift` du service attend un userId pour le match()...
        // Dans le code original: .match({ user_id: userId, date: dateKey, shift: shift });
        // Il faut donc retrouver le userId à partir du planningId dans la map
        
        const key = `${dateKey}_${shift}`;
        const itemToRemove = planningMap[key]?.find(p => p.id === planningId);
        
        if (!itemToRemove) return;

        try {
            // On supprime par UserID + Date + Shift car c'est la clé unique logique
            // Mais on pourrait supprimer par ID direct si le service le permettait. Gardons la logique originale.
            const userId = itemToRemove.user_id || itemToRemove.id; // Attention aux structures mixées

            await PlanningService.deleteShift(userId, dateKey, shift);
            
            // UI Update
            planningMap[key] = planningMap[key].filter(p => p.id !== planningId);
            toast.success("Retiré");
        } catch(e) {
            toast.error("Erreur suppression");
        }
    }

    // --- ACTIONS CONGÉS ---
    function getInitialLeave() {
        return { start_date: '', end_date: '', type: 'CN', reason: '', status: 'PENDING' };
    }

    function openNewRequest() {
        if (!hasPermission(currentUser, ACTIONS.PLANNING_WRITE)) return;
        currentLeave = getInitialLeave();
        modalState = { isOpen: true, isEditing: false, leaveId: null };
    }

    function openEditRequest(req) {
        if (!hasPermission(currentUser, ACTIONS.PLANNING_WRITE)) return;
        currentLeave = { ...req }; // Clone
        modalState = { isOpen: true, isEditing: true, leaveId: req.id };
    }

    async function handleSaveLeave() {
        if (!hasPermission(currentUser, ACTIONS.PLANNING_WRITE)) return toast.error("Non autorisé");
        
        isSubmitting = true;
        try {
            const payload = { ...currentLeave };
            if (!modalState.isEditing) payload.user_id = currentUser.id;

            await PlanningService.saveLeave(payload, modalState.leaveId);
            
            toast.success(modalState.isEditing ? "Modifié !" : "Créé !");
            leaveRequests = await PlanningService.loadLeaves(); // Refresh
            modalState.isOpen = false;
        } catch(e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSubmitting = false;
        }
    }

    async function handleDeleteLeave(id) {
        if (!hasPermission(currentUser, ACTIONS.PLANNING_DELETE)) return toast.error("Non autorisé");
        if (!confirm("Supprimer ?")) return;

        try {
            await PlanningService.deleteLeave(id);
            leaveRequests = leaveRequests.filter(l => l.id !== id);
            toast.success("Supprimé");
        } catch(e) {
            toast.error("Erreur suppression");
        }
    }

    async function handleStatusChange(leaveId, newStatus) {
        if (!hasPermission(currentUser, ACTIONS.PLANNING_WRITE)) return toast.error("Non autorisé");
        try {
            await PlanningService.updateLeaveStatus(leaveId, newStatus);
            // Optimistic update
            leaveRequests = leaveRequests.map(l => l.id === leaveId ? {...l, status: newStatus} : l);
            toast.success("Statut mis à jour");
        } catch(e) {
            toast.error("Erreur update statut");
        }
    }

</script>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-blue-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-6 space-y-6 min-h-screen flex flex-col">
        
        <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-4" 
                in:fly={{ y: -20, duration: 600 }}
                style="--primary-rgb: var(--color-primary);">
            <div class="flex items-center gap-3">
                <div class="p-3 rounded-xl border transition-all duration-500 header-icon-box">
                    <CalendarDays size={32} />
                </div>
                <div>
                    <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Planning</h1>
                    <p class="text-gray-500 text-sm mt-1">Planification & Gestion des Congés</p>
                </div>
            </div>
            
            {#if hasPermission(currentUser, ACTIONS.PLANNING_WRITE)}
                <button onclick={openNewRequest} class="btn-themed px-5 py-2 rounded-xl font-bold border transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95">
                    <Plus class="w-5 h-5" /> Nouvelle Demande
                </button>
            {/if}
        </header>

        {#if isLoading}
            <div class="flex justify-center py-20"><Loader2 class="animate-spin w-10 h-10 themed-spinner" /></div>
        {:else}
            
            <div class="bg-black/20 border border-white/5 rounded-3xl p-6 shadow-sm mb-4" 
                 in:fly={{ y: 20, duration: 600 }}
                 style="--primary-rgb: var(--color-primary);">
                <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                    <FileText class="w-5 h-5 themed-text" /> Mes Demandes ({myLeaveRequests.length})
                </h2>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {#each myLeaveRequests as request (request.id)}
                        <div class="flex flex-col p-4 rounded-2xl border transition-all bg-white/5 border-white/10 hover:bg-white/10 relative group">
                            <div class="text-sm font-medium text-gray-400 mb-2">
                                Du <span class="text-white font-bold">{new Date(request.start_date).toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})}</span> 
                                au <span class="text-white font-bold">{new Date(request.end_date).toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'})}</span>
                            </div>
                            
                            <div class="flex justify-between items-center mt-auto">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gray-300 border border-white/5">{request.type}</span>
                                <select 
                                    value={request.status} 
                                    onchange={(e) => handleStatusChange(request.id, e.target.value)}
                                    disabled={!hasPermission(currentUser, ACTIONS.PLANNING_WRITE)} 
                                    class="text-[10px] font-bold rounded px-2 py-1 cursor-pointer outline-none appearance-none text-center {STATUS_OPTIONS.find(s => s.value === request.status)?.color} disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {#each STATUS_OPTIONS as opt}
                                        <option value={opt.value} class="bg-gray-900 text-gray-300">{opt.label}</option>
                                    {/each}
                                </select>
                            </div>
                            
                            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {#if hasPermission(currentUser, ACTIONS.PLANNING_WRITE)}
                                    <button onclick={() => openEditRequest(request)} class="p-1 text-gray-600 hover:text-blue-400"><Edit size={14} /></button>
                                {/if}
                                {#if hasPermission(currentUser, ACTIONS.PLANNING_DELETE)}
                                    <button onclick={() => handleDeleteLeave(request.id)} class="p-1 text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div class="col-span-full text-center py-6 text-gray-500 border border-dashed border-white/10 rounded-2xl bg-black/10 italic">Aucune demande perso.</div>
                    {/each}
                </div>
            </div>

            <div class="flex flex-col lg:flex-row gap-6 h-full flex-grow" style="--primary-rgb: var(--color-primary);">
                
                <PlanningSidebar 
                    {availableStaff} 
                    {currentUser}
                    onUpdate={(items) => handleSidebarUpdate(items)}
                />

                <PlanningCalendar 
                    {days}
                    {planningMap}
                    {monthNames}
                    {displayedMonth}
                    {displayedYear}
                    {currentUser}
                    onPrevMonth={prevMonth}
                    onNextMonth={nextMonth}
                    onZoneChange={handleZoneChange}
                    onRemoveShift={handleRemoveShift}
                />
            </div>

        {/if}
    </div>

    <PlanningLeaveModal 
        isOpen={modalState.isOpen}
        isEditing={modalState.isEditing}
        bind:request={currentLeave}
        {isSubmitting}
        onClose={() => modalState.isOpen = false}
        onSave={handleSaveLeave}
    />
{/if}

<style>
   .custom-scrollbar::-webkit-scrollbar { width: 4px; }
   .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
   .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }

   .header-icon-box {
       background-color: rgba(var(--primary-rgb), 0.1); 
       color: rgb(var(--primary-rgb)); 
       border-color: rgba(var(--primary-rgb), 0.2); 
       box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);
   }

   .btn-themed {
       background-color: rgba(var(--primary-rgb), 0.2);
       border-color: rgba(var(--primary-rgb), 0.3);
       color: rgb(var(--primary-rgb));
   }
   .btn-themed:hover {
       background-color: rgba(var(--primary-rgb), 0.3);
       border-color: rgba(var(--primary-rgb), 0.5);
       box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.2);
       transform: translateY(-1px);
   }
   
   .themed-text { color: rgb(var(--primary-rgb)); }
   .themed-spinner { color: rgba(var(--primary-rgb), 0.5); }
</style>