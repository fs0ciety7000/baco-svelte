<script>
    import { fly, fade } from 'svelte/transition';
    import { Search, Calendar, X, Download, Printer, Plus, Building2, CheckCircle, Mail, UserCheck, FileText, ClipboardCopy, Trash2, Bus, Clock, ArrowRightLeft, School, SlidersHorizontal, LayoutList, Kanban, ChevronDown, ArrowUpDown } from 'lucide-svelte';
    import { OttoReportsService } from '$lib/services/ottoReports.service.js';
    import OttoKanban from './OttoKanban.svelte';

    // --- PROPS ---
    let {
        commandes = [],
        currentUser,
        onEdit,
        onDuplicate,
        onDelete,
        onNew,
        onTutorial,
        onKanbanStatusChange
    } = $props();

    // --- LOCAL STATE ---
    let searchTerm = $state("");
    let statusFilter = $state("all");
    let dateFrom = $state("");
    let dateTo = $state("");
    let societeFilter = $state("all");
    let sortBy = $state("date_desc");
    let view = $state("list"); // "list" | "kanban"
    let showFilters = $state(false);

    // --- COMPUTED DATA ---
    let societes = $derived([...new Set(commandes.map(c => c.societes_bus?.nom).filter(Boolean))].sort());

    let activeFilterCount = $derived(
        (statusFilter !== 'all' ? 1 : 0) +
        (dateFrom ? 1 : 0) +
        (dateTo ? 1 : 0) +
        (societeFilter !== 'all' ? 1 : 0) +
        (searchTerm ? 1 : 0)
    );

    let filteredCommandes = $derived.by(() => {
        let result = commandes.filter(cmd => {
            // Search
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const matches =
                    (cmd.relation || '').toLowerCase().includes(term) ||
                    (cmd.motif || '').toLowerCase().includes(term) ||
                    (cmd.societes_bus?.nom || '').toLowerCase().includes(term) ||
                    (cmd.origine || '').toLowerCase().includes(term) ||
                    (cmd.destination || '').toLowerCase().includes(term);
                if (!matches) return false;
            }

            // Status
            if (statusFilter !== 'all' && cmd.status !== statusFilter) return false;

            // Date range
            if (dateFrom && cmd.date_commande < dateFrom) return false;
            if (dateTo && cmd.date_commande > dateTo) return false;

            // Société
            if (societeFilter !== 'all' && cmd.societes_bus?.nom !== societeFilter) return false;

            return true;
        });

        // Sort
        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'date_asc':  return a.date_commande.localeCompare(b.date_commande);
                case 'date_desc': return b.date_commande.localeCompare(a.date_commande);
                case 'relation':  return (a.relation || '').localeCompare(b.relation || '');
                case 'societe':   return (a.societes_bus?.nom || '').localeCompare(b.societes_bus?.nom || '');
                default: return 0;
            }
        });

        return result;
    });

    // Stats
    let stats = $derived({
        total: filteredCommandes.length,
        buses: filteredCommandes.reduce((acc, c) => acc + (c.bus_data?.length || 1), 0),
        societes: new Set(filteredCommandes.map(c => c.societes_bus?.nom).filter(Boolean)).size,
        brouillons: filteredCommandes.filter(c => c.status === 'brouillon').length,
    });

    // --- QUICK DATE PRESETS ---
    function setToday() {
        const today = new Date().toISOString().split('T')[0];
        dateFrom = today;
        dateTo = today;
    }

    function setThisWeek() {
        const now = new Date();
        const day = now.getDay() || 7;
        const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        dateFrom = mon.toISOString().split('T')[0];
        dateTo = sun.toISOString().split('T')[0];
    }

    function setThisMonth() {
        const now = new Date();
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    function clearAllFilters() {
        searchTerm = "";
        statusFilter = "all";
        dateFrom = "";
        dateTo = "";
        societeFilter = "all";
        sortBy = "date_desc";
    }

    // --- C3 TYPE STYLES ---
    const C3_STYLES = {
        1: { borderClass: 'border-l-[3px] border-l-orange-500/70', badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20', label: 'Évacuation' },
        2: { borderClass: 'border-l-[3px] border-l-blue-500/70',   badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',   label: 'Remplacement' },
        3: { borderClass: 'border-l-[3px] border-l-purple-500/70', badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20', label: 'Modif. Service planifié' },
    };

    // --- EXPORTS ---
    function handleExcel() { OttoReportsService.generateExcel(filteredCommandes); }
    function handlePDFList() { OttoReportsService.generateListPDF(filteredCommandes); }
</script>

<div class="space-y-4" in:fade>

    <!-- ─── Top bar ─────────────────────────────────────────────── -->
    <div class="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-3" in:fly={{ y: 10 }}>

        <!-- Row 1: search + view toggle + actions -->
        <div class="flex flex-col xl:flex-row gap-3 justify-between items-center">
            <!-- Search -->
            <div class="relative w-full xl:w-96 group">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-orange-400 transition-colors">
                    <Search class="w-5 h-5" />
                </div>
                <input
                    type="text"
                    bind:value={searchTerm}
                    placeholder="Rechercher (Relation, Société, Motif...)"
                    class="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all"
                />
                {#if searchTerm}
                    <button onclick={() => searchTerm = ""} class="absolute right-2 top-2.5 text-gray-500 hover:text-white"><X size={14}/></button>
                {/if}
            </div>

            <div class="flex items-center gap-2 w-full xl:w-auto flex-wrap justify-end">
                <!-- Advanced filters toggle -->
                <button
                    onclick={() => showFilters = !showFilters}
                    class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-all
                           {showFilters ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}"
                >
                    <SlidersHorizontal size={14} />
                    Filtres
                    {#if activeFilterCount > 0}
                        <span class="bg-orange-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
                    {/if}
                </button>

                <!-- Status pills -->
                <div class="flex gap-1">
                    <button onclick={() => statusFilter = 'all'} class="px-3 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'all' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Tous</button>
                    <button onclick={() => statusFilter = 'brouillon'} class="px-3 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'brouillon' ? 'bg-gray-500/20 text-gray-300 border-gray-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Brouillons</button>
                    <button onclick={() => statusFilter = 'envoye'} class="px-3 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'envoye' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Clôturés</button>
                </div>

                <div class="w-px h-6 bg-white/10 hidden sm:block"></div>

                <!-- View toggle -->
                <div class="flex gap-1 bg-black/30 border border-white/10 rounded-xl p-1">
                    <button
                        onclick={() => view = 'list'}
                        class="p-1.5 rounded-lg transition-all {view === 'list' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'}"
                        title="Vue liste"
                    >
                        <LayoutList size={15} />
                    </button>
                    <button
                        onclick={() => view = 'kanban'}
                        class="p-1.5 rounded-lg transition-all {view === 'kanban' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'}"
                        title="Vue Kanban"
                    >
                        <Kanban size={15} />
                    </button>
                </div>

                <div class="w-px h-6 bg-white/10 hidden sm:block"></div>

                <!-- Exports -->
                <button onclick={handleExcel} class="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5">
                    <Download size={13} /> Excel
                </button>
                <button onclick={handlePDFList} class="px-3 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center gap-1.5">
                    <Printer size={13} /> PDF
                </button>
            </div>
        </div>

        <!-- Row 2: advanced filters (expandable) -->
        {#if showFilters}
            <div class="border-t border-white/5 pt-3 flex flex-col sm:flex-row gap-3 flex-wrap" in:fly={{ y: -5, duration: 150 }}>
                <!-- Date from -->
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Du</label>
                    <div class="relative group">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500"><Calendar class="w-3.5 h-3.5" /></div>
                        <input type="date" bind:value={dateFrom} class="w-36 bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:[color-scheme:dark]" />
                        {#if dateFrom}<button onclick={() => dateFrom = ""} class="absolute right-2 top-2.5 text-gray-500 hover:text-white"><X size={12}/></button>{/if}
                    </div>
                </div>

                <!-- Date to -->
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Au</label>
                    <div class="relative group">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500"><Calendar class="w-3.5 h-3.5" /></div>
                        <input type="date" bind:value={dateTo} class="w-36 bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:[color-scheme:dark]" />
                        {#if dateTo}<button onclick={() => dateTo = ""} class="absolute right-2 top-2.5 text-gray-500 hover:text-white"><X size={12}/></button>{/if}
                    </div>
                </div>

                <!-- Quick presets -->
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Raccourcis</label>
                    <div class="flex gap-1">
                        <button onclick={setToday} class="px-3 py-2 text-xs font-bold rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all">Aujourd'hui</button>
                        <button onclick={setThisWeek} class="px-3 py-2 text-xs font-bold rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all">Semaine</button>
                        <button onclick={setThisMonth} class="px-3 py-2 text-xs font-bold rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all">Mois</button>
                    </div>
                </div>

                <!-- Société filter -->
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Société</label>
                    <div class="relative">
                        <Building2 class="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                        <select bind:value={societeFilter} class="w-44 bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 appearance-none cursor-pointer">
                            <option value="all">Toutes</option>
                            {#each societes as s}
                                <option value={s}>{s}</option>
                            {/each}
                        </select>
                        <ChevronDown class="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                <!-- Sort -->
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Trier par</label>
                    <div class="relative">
                        <ArrowUpDown class="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                        <select bind:value={sortBy} class="w-44 bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 appearance-none cursor-pointer">
                            <option value="date_desc">Date ↓ (récent)</option>
                            <option value="date_asc">Date ↑ (ancien)</option>
                            <option value="relation">Relation A→Z</option>
                            <option value="societe">Société A→Z</option>
                        </select>
                        <ChevronDown class="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                <!-- Clear all -->
                {#if activeFilterCount > 0}
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] text-gray-500 font-bold uppercase tracking-wider opacity-0">·</label>
                        <button onclick={clearAllFilters} class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all">
                            <X size={12} /> Effacer tout
                        </button>
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <!-- ─── Stats bar ─────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" in:fly={{ y: 5, duration: 300 }}>
        <div class="bg-black/20 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <FileText class="w-4 h-4 text-orange-400 shrink-0" />
            <div>
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Commandes</p>
                <p class="text-lg font-extrabold text-white">{stats.total}</p>
            </div>
        </div>
        <div class="bg-black/20 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <Bus class="w-4 h-4 text-blue-400 shrink-0" />
            <div>
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Bus engagés</p>
                <p class="text-lg font-extrabold text-white">{stats.buses}</p>
            </div>
        </div>
        <div class="bg-black/20 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <Building2 class="w-4 h-4 text-yellow-400 shrink-0" />
            <div>
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Sociétés</p>
                <p class="text-lg font-extrabold text-white">{stats.societes}</p>
            </div>
        </div>
        <div class="bg-black/20 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock class="w-4 h-4 text-gray-400 shrink-0" />
            <div>
                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">En cours</p>
                <p class="text-lg font-extrabold text-white">{stats.brouillons}</p>
            </div>
        </div>
    </div>

    <!-- ─── Action row ─────────────────────────────────────────────── -->
    <div class="flex justify-end gap-2">
        <button onclick={onTutorial} class="btn-themed px-4 py-2 rounded-xl font-bold flex items-center gap-2 border bg-orange-500/10 border-orange-500/20 text-orange-400">
            <School class="w-4 h-4" /> Tuto
        </button>
        <button onclick={onNew} class="btn-themed px-4 py-2 rounded-xl font-bold flex items-center gap-2 border bg-blue-500/10 border-blue-500/20 text-blue-400">
            <Plus class="w-4 h-4" /> Nouveau
        </button>
    </div>

    <!-- ─── Content: List or Kanban ─────────────────────────────────── -->
    {#if view === 'kanban'}
        <OttoKanban
            commandes={filteredCommandes}
            {onEdit}
            {onDuplicate}
            {onDelete}
            onStatusChange={onKanbanStatusChange}
        />
    {:else}
        <div class="grid grid-cols-1 gap-4" in:fly={{ y: 20, duration: 400 }}>
            {#if filteredCommandes.length === 0}
                <div class="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-black/20">
                    <p class="text-gray-500">Aucune commande trouvée.</p>
                    {#if activeFilterCount > 0}
                        <button onclick={clearAllFilters} class="mt-3 text-orange-400 text-sm hover:underline">Effacer les filtres</button>
                    {/if}
                </div>
            {:else}
                {#each filteredCommandes as cmd (cmd.id)}
                    {@const c3Style = C3_STYLES[cmd.c3_type ?? 2] ?? C3_STYLES[2]}
                    <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4 transition-all group overflow-hidden {c3Style.borderClass} {cmd.status === 'envoye' ? 'opacity-60 grayscale-[30%] hover:opacity-100 hover:grayscale-0' : 'hover:border-orange-500/30'}">
                        <div class="flex-grow min-w-0 w-full">
                            <div class="flex items-center gap-3 mb-3 flex-wrap">
                                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border {c3Style.badgeClass}">{c3Style.label}</span>
                                <span class="text-xl font-extrabold text-white tracking-tight">{cmd.relation}</span>
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border {cmd.is_direct ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}">
                                    {cmd.is_direct ? 'Direct' : 'Omnibus'}
                                </span>
                                <span class="flex items-center gap-1.5 px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold uppercase">
                                    <Building2 size={12} /> {cmd.societes_bus?.nom || 'Inconnu'}
                                </span>
                                <span class="text-xs px-2 py-0.5 rounded border ml-auto md:ml-0 font-bold {cmd.status === 'envoye' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}">
                                    {cmd.status === 'envoye' ? 'Clôturé' : 'Brouillon'}
                                </span>
                                {#if cmd.is_mail_sent}
                                    <span class="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold uppercase">
                                        <CheckCircle size={12} /> Mail envoyé
                                    </span>
                                {/if}
                                <!-- Kanban status badge -->
                                {#if cmd.kanban_status && cmd.kanban_status !== 'commande'}
                                    {@const kLabels = { en_approche: 'En approche', sur_place: 'Sur place', termine: 'Terminé' }}
                                    {@const kColors = { en_approche: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', sur_place: 'bg-orange-500/10 text-orange-400 border-orange-500/20', termine: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }}
                                    <span class="text-xs px-2 py-0.5 rounded border font-bold {kColors[cmd.kanban_status]}">
                                        {kLabels[cmd.kanban_status]}
                                    </span>
                                {/if}
                            </div>

                            <div class="flex flex-wrap gap-4 text-sm text-gray-400 bg-black/20 p-3 rounded-xl border border-white/5 mb-3">
                                <div class="flex items-center gap-2"><Calendar size={14} class="text-orange-400"/> <span class="text-gray-200 font-medium">{new Date(cmd.date_commande).toLocaleDateString('fr-BE')}</span></div>
                                <div class="flex items-center gap-2"><Clock size={14} class="text-orange-400"/> <span>{cmd.heure_appel?.slice(0,5) || '--:--'}</span></div>
                                <div class="flex items-center gap-2"><Bus size={14} class="text-orange-400"/> <span>{cmd.bus_data?.length || 1} bus</span></div>
                                <div class="flex items-center gap-2 truncate text-gray-500"><span class="w-px h-4 bg-white/10 mx-1"></span>{cmd.motif}</div>
                            </div>

                            <div class="flex items-center gap-2 text-sm text-gray-400 mb-3">
                                <span class="text-gray-500 text-xs font-bold uppercase">Parcours :</span>
                                <span class="text-gray-300">{cmd.origine || '?'}</span>
                                <ArrowRightLeft size={12} class="text-orange-500/50" />
                                <span class="text-gray-300">{cmd.destination || '?'}</span>
                            </div>

                            <div class="flex items-center gap-4 text-xs pt-3 border-t border-white/5">
                                {#if cmd.status === 'envoye' && cmd.sent_at}
                                    <div class="flex items-center gap-1.5 text-emerald-500/80">
                                        <Mail size={12} /> <span class="text-emerald-400">Le {new Date(cmd.sent_at).toLocaleDateString('fr-BE')} par {cmd.sent_by_name || 'Inconnu'}</span>
                                    </div>
                                {:else if cmd.validator}
                                    <div class="flex items-center gap-1.5 text-red-500/70">
                                        <UserCheck size={12} /> <span class="text-red-400">{cmd.validator.full_name}</span>
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <div class="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity self-start mt-2 md:mt-0">
                            <button onclick={() => onEdit(cmd)} class="p-2 hover:bg-white/10 rounded-lg text-blue-400" title="Éditer"><FileText class="w-5 h-5" /></button>
                            <button onclick={() => onDuplicate(cmd)} class="p-2 hover:bg-green-500/10 rounded-lg text-green-400" title="Dupliquer"><ClipboardCopy class="w-5 h-5" /></button>
                            <button onclick={() => onDelete(cmd.id)} class="p-2 hover:bg-red-500/10 rounded-lg text-red-400" title="Supprimer"><Trash2 class="w-5 h-5" /></button>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    {/if}
</div>
