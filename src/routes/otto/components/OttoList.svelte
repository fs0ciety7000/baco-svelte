<script>
    import { fly, fade } from 'svelte/transition';
    import { Search, Calendar, X, Download, Printer, Plus, Building2, CheckCircle, Mail, UserCheck, FileText, ClipboardCopy, Trash2, Bus, Clock, ArrowRightLeft, School } from 'lucide-svelte';
    import { OttoReportsService } from '$lib/services/ottoReports.service.js';

    // --- PROPS (Runes) ---
    let { 
        commandes = [], 
        currentUser,
        onEdit,
        onDuplicate,
        onDelete,
        onNew,
        onTutorial
    } = $props();

    // --- LOCAL STATE ---
    let searchTerm = $state("");
    let statusFilter = $state("all");
    let dateFilter = $state("");

    // --- DERIVED ---
    let filteredCommandes = $derived(commandes.filter(cmd => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = (
            (cmd.relation || '').toLowerCase().includes(term) ||
            (cmd.motif || '').toLowerCase().includes(term) ||
            (cmd.societes_bus?.nom || '').toLowerCase().includes(term) ||
            (cmd.origine || '').toLowerCase().includes(term) ||
            (cmd.destination || '').toLowerCase().includes(term)
        );
        const matchesStatus = statusFilter === 'all' || cmd.status === statusFilter;
        const matchesDate = !dateFilter || cmd.date_commande === dateFilter;
        return matchesSearch && matchesStatus && matchesDate;
    }));

    // --- ACTIONS ---
    function handleExcel() {
        OttoReportsService.generateExcel(filteredCommandes);
    }

    function handlePDFList() {
        OttoReportsService.generateListPDF(filteredCommandes);
    }
</script>

<div class="space-y-6" in:fade>
    <div class="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col xl:flex-row gap-4 justify-between items-center" in:fly={{ y: 10 }}>
        <div class="relative w-full xl:w-96 group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-orange-400 transition-colors">
                <Search class="w-5 h-5" />
            </div>
            <input 
                type="text" 
                bind:value={searchTerm} 
                placeholder="Rechercher (Relation, Société...)" 
                class="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all"
            />
        </div>

        <div class="flex flex-col sm:flex-row gap-4 w-full xl:w-auto items-center">
            <div class="relative group w-full sm:w-auto">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-orange-400">
                    <Calendar class="w-4 h-4" />
                </div>
                <input 
                    type="date" 
                    bind:value={dateFilter} 
                    class="w-full sm:w-40 bg-black/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:[color-scheme:dark]"
                />
                {#if dateFilter}
                    <button onclick={() => dateFilter = ""} class="absolute right-2 top-2.5 text-gray-500 hover:text-white"><X size={14}/></button>
                {/if}
            </div>

            <button onclick={handleExcel} class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                <Download size={14} /> Excel
            </button>
            <button onclick={handlePDFList} class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center gap-2">
                <Printer size={14} /> PDF
            </button>

            <div class="w-px h-8 bg-white/10 hidden sm:block"></div>
            <div class="flex gap-2 w-full sm:w-auto">
                <button onclick={() => statusFilter = 'all'} class="flex-1 px-4 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'all' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Tous</button>
                <button onclick={() => statusFilter = 'brouillon'} class="flex-1 px-4 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'brouillon' ? 'bg-gray-500/20 text-gray-300 border-gray-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Brouillons</button>
                <button onclick={() => statusFilter = 'envoye'} class="flex-1 px-4 py-2 rounded-xl text-sm font-bold border transition-all {statusFilter === 'envoye' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}">Clôturés</button>
            </div>
        </div>
    </div>

    <div class="flex justify-end gap-2">
         <button onclick={onTutorial} class="btn-themed px-4 py-2 rounded-xl font-bold flex items-center gap-2 border bg-orange-500/10 border-orange-500/20 text-orange-400">
              <School class="w-4 h-4" /> Tuto
         </button>
         <button onclick={onNew} class="btn-themed px-4 py-2 rounded-xl font-bold flex items-center gap-2 border bg-blue-500/10 border-blue-500/20 text-blue-400">
              <Plus class="w-4 h-4" /> Nouveau
         </button>
    </div>

    <div class="grid grid-cols-1 gap-4" in:fly={{ y: 20, duration: 400 }}>
        {#if filteredCommandes.length === 0}
            <div class="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-black/20">
                <p class="text-gray-500">Aucune commande trouvée.</p>
            </div>
        {:else}
            {#each filteredCommandes as cmd (cmd.id)}
                <div class="bg-black/20 border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4 transition-all group {cmd.status === 'envoye' ? 'opacity-60 grayscale-[30%] hover:opacity-100 hover:grayscale-0' : 'hover:border-orange-500/30'}">
                    <div class="flex-grow min-w-0 w-full">
                        <div class="flex items-center gap-3 mb-3 flex-wrap">
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
                        </div>

                        <div class="flex flex-wrap gap-4 text-sm text-gray-400 bg-black/20 p-3 rounded-xl border border-white/5 mb-3">
                            <div class="flex items-center gap-2"><Calendar size={14} class="text-orange-400"/> <span class="text-gray-200 font-medium">{new Date(cmd.date_commande).toLocaleDateString()}</span></div>
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
</div>