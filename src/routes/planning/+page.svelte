<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { fade, fly, scale } from 'svelte/transition';
    import { flip } from 'svelte/animate';
    import { toast } from '$lib/stores/toast'; 
    import { dndzone } from 'svelte-dnd-action';
    
    import { 
        CalendarDays, Calendar, Plus, Loader2, ChevronLeft, ChevronRight, 
        Edit, Trash2, X, Save, Check, Ban, FileText, Briefcase, 
        AlertCircle, MoreHorizontal, Eye
    } from 'lucide-svelte';
    
    // --- ÉTATS GLOBAUX ---
    let isLoading = true;
    let isSubmitting = false;
    let currentUser = null; 
    
    // Données
    let leaveRequests = []; 
    let myLeaveRequests = []; 
    let allProfiles = []; 
    let availableStaff = []; 
    let planningMap = {}; 
    
    // Filtres
    let filterRole = 'TOUS';
    const EXCLUDED_NAMES = ['Michaël Rousseau', 'Michael Rousseau', 'test', 'bloup'];

    // --- DRAG & DROP CONFIG ---
    const flipDurationMs = 200;

    // --- MODALE ---
    let modalState = { isOpen: false, isEditing: false, leaveId: null };
    let currentLeave = { start_date: '', end_date: '', type: 'CN', reason: '' };
    let confirmDeleteId = null; 

    const LEAVE_TYPES = [
        { value: 'CN', label: 'Congé Normal (CN)' },
        { value: 'JC', label: 'Jour de Compensation (JC)' },
        { value: 'ZM', label: 'Zone Maladie (ZM)' },
        { value: 'BT', label: 'Bons Temps (BT)' },
    ];
    
    const STATUS_OPTIONS = [
        { value: 'PENDING', label: 'En attente', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
        { value: 'APPROVED', label: 'Approuvée', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
        { value: 'REJECTED', label: 'Refusée', color: 'text-red-400 bg-red-400/10 border-red-400/20' }
    ];

    // --- COULEURS ---
    const USER_PALETTE = [
        'bg-emerald-500 border-emerald-400', 'bg-cyan-500 border-cyan-400', 
        'bg-indigo-500 border-indigo-400', 'bg-violet-500 border-violet-400',
        'bg-fuchsia-500 border-fuchsia-400', 'bg-lime-600 border-lime-500', 
        'bg-teal-500 border-teal-400', 'bg-sky-500 border-sky-400',
        'bg-rose-500 border-rose-400', 'bg-amber-500 border-amber-400'
    ];

    function getUserLeaveColor(userId) {
        if (!userId) return 'bg-gray-500 border-gray-400';
        let hash = 0;
        for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        return USER_PALETTE[Math.abs(hash) % USER_PALETTE.length];
    }

    function getShiftStyle(shift) {
        if (shift === 'A') return 'bg-pink-500 text-white border-pink-600 shadow-pink-500/20';     
        if (shift === 'P') return 'bg-blue-500 text-white border-blue-600 shadow-blue-500/20';     
        if (shift === 'N') return 'bg-orange-500 text-white border-orange-600 shadow-orange-500/20'; 
        return 'bg-gray-600 text-gray-300';
    }

    function getRoleStyle(fonction) {
        const f = (fonction || '').toUpperCase();
        if (f === 'PACO') return 'bg-blue-600/20 text-blue-300 border-blue-500/30';
        if (f === 'RCCA') return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30';
        return 'bg-gray-600/20 text-gray-300 border-gray-500/30';
    }

    // --- CALENDRIER ---
    let currentDate = new Date();
    currentDate.setDate(1); 
    $: displayedMonth = currentDate.getMonth();
    $: displayedYear = currentDate.getFullYear();
    let days = [];
    
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const shifts = ['A', 'P', 'N'];

    const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const isDateInRange = (checkDate, startStr, endStr) => {
        const check = new Date(checkDate).setHours(12,0,0,0);
        const start = new Date(startStr).setHours(0,0,0,0);
        const end = new Date(endStr).setHours(23,59,59,999);
        return check >= start && check <= end;
    };
    
    function generateCalendarDays(year, month) {
        const calendarDays = [];
        const firstDayOfMonth = new Date(year, month, 1);
        const today = new Date();
        const getISOWeekday = (d) => (d.getDay() === 0 ? 7 : d.getDay());
        let startDayOfWeek = getISOWeekday(firstDayOfMonth);
        let day = new Date(firstDayOfMonth);
        day.setDate(day.getDate() - (startDayOfWeek - 1));

        let loops = 0;
        while (loops < 42) { 
            const dateKey = formatDateKey(day);
            const currentDayObj = new Date(day);
            
            // Tous les congés (sauf refusés) pour le calendrier
            const dayLeaves = leaveRequests.filter(req => {
                if (req.status === 'REJECTED') return false; 
                return isDateInRange(currentDayObj, req.start_date, req.end_date);
            });

            calendarDays.push({
                date: currentDayObj,
                dateKey: dateKey,
                dayOfMonth: day.getDate(),
                isCurrentMonth: day.getMonth() === month,
                isToday: day.toDateString() === today.toDateString(),
                leaves: dayLeaves
            });
            day.setDate(day.getDate() + 1);
            loops++;
        }
        return calendarDays;
    }
    
    function goToPreviousMonth() { currentDate = new Date(displayedYear, displayedMonth - 1, 1); }
    function goToNextMonth() { currentDate = new Date(displayedYear, displayedMonth + 1, 1); }

    // --- DATA LOADING ---
    onMount(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;
        await loadAllData();
        isLoading = false;
    });

    async function loadAllData() {
        // 1. Profils
        const { data: profiles } = await supabase.from('profiles').select('*');
        if (profiles) allProfiles = profiles.filter(p => !EXCLUDED_NAMES.includes(p.full_name));

        // 2. Congés
        const { data: leaves } = await supabase
            .from('leave_requests')
            .select(`id, user_id, start_date, end_date, type, status, reason, profiles(full_name)`)
            .order('start_date', { ascending: false });

        if (leaves) {
            leaveRequests = leaves; // Tous pour le calendrier
            if (currentUser) {
                myLeaveRequests = leaves.filter(l => l.user_id === currentUser.id); // Perso pour le haut
            }
        }

        // 3. Planning
        const { data: planning } = await supabase.from('planning').select('*');
        planningMap = {};
        
        if (planning) {
            planning.forEach(p => {
                const key = `${p.date}_${p.shift}`;
                if (!planningMap[key]) planningMap[key] = [];
                const userProfile = allProfiles.find(u => u.id === p.user_id);
                if (userProfile) {
                    planningMap[key].push({ ...userProfile, planningId: p.id });
                }
            });
        }

        resetSidebar();
        days = generateCalendarDays(displayedYear, displayedMonth);
        initEmptyZones();
    }

    function resetSidebar() {
        availableStaff = allProfiles.map(p => ({...p, id: p.id})); 
    }

    function initEmptyZones() {
        days.forEach(d => {
            shifts.forEach(shift => {
                const key = `${d.dateKey}_${shift}`;
                if (!planningMap[key]) planningMap[key] = [];
            });
        });
    }

    $: {
        days = generateCalendarDays(displayedYear, displayedMonth);
        initEmptyZones();
        planningMap = {...planningMap}; 
    }

    // --- DRAG & DROP LOGIC ---
    function handleSidebarConsider(e) { availableStaff = e.detail.items; }
    function handleSidebarFinalize(e) { resetSidebar(); }

    function handleZoneConsider(dateKey, shift, e) {
        const key = `${dateKey}_${shift}`;
        planningMap[key] = e.detail.items;
        planningMap = { ...planningMap };
    }

    async function handleZoneFinalize(dateKey, shift, e) {
        // 1. Mise à jour visuelle (Indispensable pour que l'élément reste à l'écran)
        const key = `${dateKey}_${shift}`;
        planningMap[key] = e.detail.items;
        planningMap = { ...planningMap }; 

        const { items, info } = e.detail;

        

        // --- CORRECTION MAJEURE ICI ---
        // On accepte 'dropped', 'droppedIntoZone' ou tout trigger contenant 'dropped'
        if (info.trigger === 'dropped' || info.trigger === 'droppedIntoZone') {
            
            // Sécurité : Conversion en String pour être sûr de trouver l'ID (ex: 123 vs "123")
            const droppedUser = items.find(i => String(i.id) === String(info.id));
            
            
            // 2. Sauvegarde en Base de Données
            const { data, error } = await supabase
                .from('planning')
                .upsert({ 
                    user_id: droppedUser.id, 
                    date: dateKey, 
                    shift: shift 
                }, { onConflict: 'user_id, date, shift' }) // S'assure de remplacer si existant
                .select();

            if (error) {
               
                toast.error("Erreur sauvegarde : " + error.message);
            } else {
                
                // toast.success("Enregistré"); // Optionnel si vous trouvez ça trop verbeux
            }
        }
    }
    
    async function removeShift(dateKey, shift, userId) {
        try {
            const { error } = await supabase
                .from('planning')
                .delete()
                .match({ user_id: userId, date: dateKey, shift: shift });
                
            if (error) throw error;
            
            const key = `${dateKey}_${shift}`;
            planningMap[key] = planningMap[key].filter(u => u.id !== userId);
            planningMap = {...planningMap};
            toast.success("Retiré");
        } catch (err) {
            toast.error("Erreur suppression");
        }
    }

    // --- STATUS UPDATE ---
    async function updateLeaveStatus(leaveId, newStatus) {
        try {
            const { error } = await supabase
                .from('leave_requests')
                .update({ status: newStatus })
                .eq('id', leaveId);

            if (error) throw error;

            // Mise à jour locale
            leaveRequests = leaveRequests.map(l => l.id === leaveId ? {...l, status: newStatus} : l);
            if (currentUser) myLeaveRequests = leaveRequests.filter(l => l.user_id === currentUser.id);
            
            days = generateCalendarDays(displayedYear, displayedMonth); // Refresh calendrier
            toast.success(`Statut mis à jour`);
        } catch (err) {
            toast.error("Erreur mise à jour");
        }
    }

    // --- FILTERS ---
    $: filteredStaff = availableStaff.filter(u => {
        if (EXCLUDED_NAMES.includes(u.full_name)) return false;
        const role = (u.fonction || '').toUpperCase();
        if (filterRole === 'TOUS') return true;
        return role === filterRole;
    });

    // --- CRUD ---
    function handleNewRequest() {
        currentLeave = { start_date: '', end_date: '', type: 'CN', reason: '' };
        modalState = { isOpen: true, isEditing: false, leaveId: null };
    }
    function closeModal() { modalState = { isOpen: false, isEditing: false, leaveId: null }; }
    
    async function saveLeave() {
        if (!currentUser || !currentLeave.start_date || !currentLeave.end_date) {
            toast.error("Champs requis."); return;
        }
        isSubmitting = true;
        try {
            const payload = {
                user_id: currentUser.id,
                start_date: currentLeave.start_date,
                end_date: currentLeave.end_date,
                type: currentLeave.type,
                reason: currentLeave.reason,
                status: 'PENDING'
            };
            const { error } = await supabase.from('leave_requests').insert(payload);
            if (error) throw error;
            toast.success("Demande enregistrée !");
            await loadAllData();
            closeModal();
        } catch (e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSubmitting = false;
        }
    }
    
    async function deleteLeave(id) {
        if (!confirm('Supprimer cette demande ?')) return;
        const { error } = await supabase.from('leave_requests').delete().eq('id', id);
        if (error) toast.error("Erreur suppression");
        else {
            toast.success("Supprimé");
            await loadAllData();
        }
    }

    const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none";
</script>

<div class="container mx-auto p-4 md:p-6 space-y-6 min-h-screen flex flex-col">
    
    <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-4" in:fly={{ y: -20, duration: 600 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                <CalendarDays size={32} />
            </div>
            <div>
                <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Planning</h1>
                <p class="text-gray-500 text-sm mt-1">Planification & Gestion des Congés</p>
            </div>
        </div>
        <button on:click={handleNewRequest} class="px-5 py-2 bg-green-600/80 hover:bg-green-500 text-white rounded-xl font-bold border border-green-500/30 transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95">
            <Plus class="w-5 h-5" /> Nouvelle Demande
        </button>
    </header>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin w-10 h-10 text-blue-500/50" /></div>
    {:else}
        
        <div class="bg-black/20 border border-white/5 rounded-3xl p-6 shadow-sm mb-4" in:fly={{ y: 20, duration: 600 }}>
            <h2 class="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                <FileText class="w-5 h-5 text-blue-400" /> Mes Demandes ({myLeaveRequests.length})
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
                                on:change={(e) => updateLeaveStatus(request.id, e.target.value)}
                                class="text-[10px] font-bold rounded px-2 py-1 cursor-pointer outline-none appearance-none text-center
                                {STATUS_OPTIONS.find(s => s.value === request.status)?.color}"
                            >
                                {#each STATUS_OPTIONS as opt}
                                    <option value={opt.value} class="bg-gray-900 text-gray-300">{opt.label}</option>
                                {/each}
                            </select>
                        </div>
                        <button on:click={() => deleteLeave(request.id)} class="absolute top-2 right-2 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={14} />
                        </button>
                    </div>
                {:else}
                    <div class="col-span-full text-center py-6 text-gray-500 border border-dashed border-white/10 rounded-2xl bg-black/10 italic">Aucune demande perso.</div>
                {/each}
            </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-6 h-full flex-grow">
            
            <aside class="w-full lg:w-64 flex flex-col gap-4" in:fly={{ x: -20, duration: 600, delay: 100 }}>
                <div class="bg-black/20 border border-white/5 rounded-3xl p-4 shadow-sm flex-grow flex flex-col h-[600px] lg:h-auto lg:sticky lg:top-4">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-sm font-bold text-gray-200 uppercase tracking-wider">Effectifs</h2>
                        <span class="text-xs bg-white/10 px-2 py-1 rounded-full text-gray-400">{filteredStaff.length}</span>
                    </div>

                    <div class="flex gap-1 mb-4 bg-black/40 p-1 rounded-lg">
                        {#each ['TOUS', 'PACO', 'RCCA'] as r}
                            <button class="flex-1 py-1 text-[10px] font-bold rounded transition-colors {filterRole===r?'bg-blue-600 text-white shadow':'text-gray-500 hover:text-white hover:bg-white/5'}" on:click={() => filterRole=r}>{r}</button>
                        {/each}
                    </div>

                    <div 
                        class="flex-grow overflow-y-auto pr-1 space-y-2 custom-scrollbar"
                        use:dndzone={{items: filteredStaff, flipDurationMs, dropFromOthersDisabled: true}} 
                        on:consider={handleSidebarConsider} 
                        on:finalize={handleSidebarFinalize}
                    >
                        {#each filteredStaff as staff (staff.id)}
                            <div 
                                class="p-3 rounded-xl border cursor-grab active:cursor-grabbing shadow-sm group transition-all {getRoleStyle(staff.fonction)} hover:brightness-110"
                                animate:flip={{duration: flipDurationMs}}
                            >
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-black/20 shadow-inner">
                                        {staff.full_name?.charAt(0)}
                                    </div>
                                    <div>
                                        <div class="text-sm font-bold">{staff.full_name}</div>
                                        <div class="text-[10px] opacity-70 font-mono">{staff.fonction || 'N/A'}</div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </aside>

            <div class="flex-grow bg-black/20 border border-white/5 rounded-3xl p-4 shadow-sm overflow-hidden flex flex-col" in:fly={{ y: 20, duration: 600, delay: 200 }}>
                
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-4 bg-black/30 border border-white/10 rounded-xl p-1 shadow-inner">
                        <button on:click={goToPreviousMonth} class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><ChevronLeft class="w-5 h-5" /></button>
                        <span class="text-gray-200 font-bold text-sm min-w-[140px] text-center uppercase tracking-wide">{monthNames[displayedMonth]} {displayedYear}</span>
                        <button on:click={goToNextMonth} class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><ChevronRight class="w-5 h-5" /></button>
                    </div>
                </div>
                
                <div class="grid grid-cols-7 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    {#each dayNames as day}
                        <div class="py-2 text-[10px] font-bold text-center text-gray-400 uppercase tracking-widest bg-black/60 backdrop-blur-sm">{day}</div>
                    {/each}

                    {#each days as day}
                        <div class="min-h-[160px] bg-gray-900/80 relative flex flex-col border-t border-white/5 group/day
                            {day.isCurrentMonth ? '' : 'bg-black/60 opacity-50'}
                            {day.isToday ? 'bg-blue-900/10 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]' : ''}"
                        >
                            <div class="flex justify-between items-start p-2">
                                <span class="text-xs font-bold {day.isToday ? 'text-blue-400' : 'text-gray-500'}">{day.dayOfMonth}</span>
                            </div>

                            {#if day.leaves.length > 0}
                                <div class="px-1 flex flex-col gap-1 mb-2 relative z-10 group/leaves">
                                    {#each day.leaves.slice(0, 2) as leave}
                                        <div 
                                            class="w-full text-white text-[9px] px-2 py-0.5 rounded shadow-sm border flex items-center justify-between
                                            {getUserLeaveColor(leave.user_id)} {leave.status === 'PENDING' ? 'opacity-70 border-dashed' : 'opacity-100'}"
                                        >
                                            <span class="font-bold truncate max-w-[50px]">{leave.profiles?.full_name?.split(' ')[0]}</span>
                                            <span class="text-[8px] bg-black/20 px-1 rounded opacity-80">{leave.type}</span>
                                        </div>
                                    {/each}
                                    
                                    {#if day.leaves.length > 2}
                                        <div class="text-[9px] text-center bg-gray-700 text-gray-300 rounded py-0.5 cursor-help">
                                            +{day.leaves.length - 2} autres
                                        </div>
                                    {/if}

                                    <div class="absolute left-0 top-full w-full bg-gray-800 border border-white/10 p-2 rounded-lg shadow-xl z-50 hidden group-hover/leaves:block">
                                        <p class="text-[10px] font-bold text-gray-400 mb-1 border-b border-white/10 pb-1">Absents ({day.leaves.length})</p>
                                        {#each day.leaves as leave}
                                             <div class="text-[9px] text-gray-300 flex justify-between mb-1">
                                                <span>{leave.profiles?.full_name}</span>
                                                <span class="{leave.status === 'APPROVED' ? 'text-green-400' : 'text-yellow-400'}">{leave.type}</span>
                                             </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}

                            <div class="flex-grow flex flex-col gap-px bg-white/5 mt-auto">
                                {#each shifts as shift}
                                    <div class="flex-1 bg-gray-900/50 hover:bg-white/5 transition-colors relative group min-h-[35px] border-t border-white/5">
                                        <div class="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-600 group-hover:text-gray-400 select-none w-4 text-center">{shift}</div>
                                        <div 
                                            class="h-full w-full pl-6 pr-1 py-0.5 flex flex-wrap content-center gap-1"
                                            use:dndzone={{items: planningMap[`${day.dateKey}_${shift}`] || [], flipDurationMs}} 
                                            on:consider={(e) => handleZoneConsider(day.dateKey, shift, e)} 
                                            on:finalize={(e) => handleZoneFinalize(day.dateKey, shift, e)}
                                        >
                                            {#each planningMap[`${day.dateKey}_${shift}`] || [] as p (p.id)}
                                                <div 
                                                    class="text-[9px] px-1.5 py-0.5 rounded cursor-grab active:cursor-grabbing border shadow-sm truncate max-w-[90px] font-bold transition-transform hover:scale-105
                                                    {getShiftStyle(shift)}" 
                                                    animate:flip={{duration: flipDurationMs}} 
                                                    on:contextmenu|preventDefault={() => removeShift(day.dateKey, shift, p.id)}
                                                    title="Clic droit pour retirer {p.full_name}"
                                                >
                                                    {p.full_name?.split(' ')[0]}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
</div>

{#if modalState.isOpen}
    <div class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" transition:fade>
        <div class="w-full max-w-lg rounded-2xl shadow-2xl bg-gray-900 border border-white/10" transition:fly={{ y: 20 }}>
            <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/5">
                <h3 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Calendar class="w-5 h-5 text-blue-400" /> Nouvelle Demande
                </h3>
                <button on:click={closeModal} class="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <X class="w-5 h-5" />
                </button>
            </div>
            <form on:submit|preventDefault={saveLeave} class="p-6 space-y-5">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Début</label>
                        <input type="date" bind:value={currentLeave.start_date} required class="{inputClass} dark:[color-scheme:dark]">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Fin</label>
                        <input type="date" bind:value={currentLeave.end_date} required class="{inputClass} dark:[color-scheme:dark]">
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Type</label>
                    <select bind:value={currentLeave.type} class="{inputClass} appearance-none">
                        {#each LEAVE_TYPES as type} <option value={type.value} class="bg-gray-900">{type.label}</option> {/each}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Motif</label>
                    <textarea bind:value={currentLeave.reason} rows="3" class="{inputClass} resize-none"></textarea>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t border-white/10 mt-2">
                    <button type="button" on:click={closeModal} class="px-4 py-2 text-sm font-medium text-gray-400 border border-white/10 rounded-xl hover:bg-white/5">Annuler</button>
                    <button type="submit" disabled={isSubmitting} class="px-4 py-2 text-sm font-bold text-white bg-blue-600/80 hover:bg-blue-500 border border-blue-500/30 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all flex items-center gap-2">
                        {#if isSubmitting}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" /> Enregistrer{/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
</style>