<script>
    import { fade, fly } from 'svelte/transition';
    import { ArrowRight, ArrowLeft, Building2, Bus, Calendar, ArrowRightLeft, Clock, CheckCircle, Mail } from 'lucide-svelte';
    import { FileText, ClipboardCopy, Trash2 } from 'lucide-svelte';

    let {
        commandes = [],
        onEdit,
        onDuplicate,
        onDelete,
        onStatusChange
    } = $props();

    const COLUMNS = [
        { id: 'commande',    label: 'Commandé',    color: 'blue',    border: 'border-blue-500/40',    bg: 'bg-blue-500/10',    text: 'text-blue-300' },
        { id: 'en_approche', label: 'En approche', color: 'yellow',  border: 'border-yellow-500/40',  bg: 'bg-yellow-500/10',  text: 'text-yellow-300' },
        { id: 'sur_place',   label: 'Sur place',   color: 'orange',  border: 'border-orange-500/40',  bg: 'bg-orange-500/10',  text: 'text-orange-300' },
        { id: 'termine',     label: 'Terminé',     color: 'emerald', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
    ];

    const COLUMN_IDS = COLUMNS.map(c => c.id);

    function getCards(columnId) {
        return commandes.filter(cmd => (cmd.kanban_status || 'commande') === columnId);
    }

    function getPrevColumn(columnId) {
        const idx = COLUMN_IDS.indexOf(columnId);
        return idx > 0 ? COLUMN_IDS[idx - 1] : null;
    }

    function getNextColumn(columnId) {
        const idx = COLUMN_IDS.indexOf(columnId);
        return idx < COLUMN_IDS.length - 1 ? COLUMN_IDS[idx + 1] : null;
    }

    function moveCard(cmd, targetStatus) {
        onStatusChange(cmd.id, targetStatus);
    }

    // Drag & drop state
    let draggedId = $state(null);

    function onDragStart(e, cmdId) {
        draggedId = cmdId;
        e.dataTransfer.effectAllowed = 'move';
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function onDrop(e, targetStatus) {
        e.preventDefault();
        if (draggedId) {
            const cmd = commandes.find(c => c.id === draggedId);
            if (cmd && (cmd.kanban_status || 'commande') !== targetStatus) {
                moveCard(cmd, targetStatus);
            }
            draggedId = null;
        }
    }

    function onDragEnd() {
        draggedId = null;
    }
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" in:fade>
    {#each COLUMNS as col}
        {@const cards = getCards(col.id)}
        <div
            class="rounded-2xl border {col.border} bg-black/20 flex flex-col min-h-[200px] transition-all"
            ondragover={onDragOver}
            ondrop={(e) => onDrop(e, col.id)}
            role="region"
            aria-label="Colonne {col.label}"
        >
            <!-- Column header -->
            <div class="p-3 border-b {col.border} flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full {col.bg} border {col.border}"></span>
                    <span class="font-bold text-sm {col.text} uppercase tracking-wider">{col.label}</span>
                </div>
                <span class="text-xs font-bold px-2 py-0.5 rounded-full {col.bg} {col.text} border {col.border}">
                    {cards.length}
                </span>
            </div>

            <!-- Cards -->
            <div class="p-2 flex flex-col gap-2 flex-1">
                {#if cards.length === 0}
                    <div class="flex-1 flex items-center justify-center py-8 text-center">
                        <p class="text-gray-600 text-xs">Aucune commande</p>
                    </div>
                {:else}
                    {#each cards as cmd (cmd.id)}
                        <div
                            class="bg-black/40 border rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all group
                                   {draggedId === cmd.id ? 'opacity-40 scale-95' : 'hover:border-white/20'}
                                   {cmd.status === 'envoye' ? 'border-white/5' : 'border-white/10'}"
                            draggable="true"
                            ondragstart={(e) => onDragStart(e, cmd.id)}
                            ondragend={onDragEnd}
                            in:fly={{ y: 10, duration: 200 }}
                        >
                            <!-- Card top -->
                            <div class="flex items-start justify-between gap-2 mb-2">
                                <span class="font-extrabold text-white text-sm tracking-tight">{cmd.relation}</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0
                                    {cmd.status === 'envoye' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}">
                                    {cmd.status === 'envoye' ? 'Clôt.' : 'Brouil.'}
                                </span>
                            </div>

                            <!-- Society -->
                            <div class="flex items-center gap-1.5 text-xs text-blue-300 mb-1.5">
                                <Building2 size={10} />
                                <span class="truncate">{cmd.societes_bus?.nom || 'Inconnu'}</span>
                            </div>

                            <!-- Route -->
                            <div class="flex items-center gap-1 text-xs text-gray-400 mb-1.5 truncate">
                                <ArrowRightLeft size={10} class="text-orange-500/50 shrink-0" />
                                <span class="truncate">{cmd.origine || '?'} → {cmd.destination || '?'}</span>
                            </div>

                            <!-- Meta row -->
                            <div class="flex items-center gap-3 text-[10px] text-gray-500 mb-2">
                                <span class="flex items-center gap-1">
                                    <Calendar size={9} class="text-orange-400" />
                                    {new Date(cmd.date_commande).toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit' })}
                                </span>
                                <span class="flex items-center gap-1">
                                    <Bus size={9} class="text-orange-400" />
                                    {cmd.bus_data?.length || 1}
                                </span>
                                {#if cmd.heure_appel}
                                    <span class="flex items-center gap-1">
                                        <Clock size={9} class="text-orange-400" />
                                        {cmd.heure_appel.slice(0,5)}
                                    </span>
                                {/if}
                                {#if cmd.is_mail_sent}
                                    <CheckCircle size={9} class="text-emerald-400 ml-auto" />
                                {/if}
                            </div>

                            <!-- Actions -->
                            <div class="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                                <!-- Move buttons -->
                                <div class="flex gap-1">
                                    {#if getPrevColumn(cmd.kanban_status || 'commande')}
                                        <button
                                            onclick={() => moveCard(cmd, getPrevColumn(cmd.kanban_status || 'commande'))}
                                            class="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                            title="Reculer"
                                        >
                                            <ArrowLeft size={12} />
                                        </button>
                                    {/if}
                                    {#if getNextColumn(cmd.kanban_status || 'commande')}
                                        <button
                                            onclick={() => moveCard(cmd, getNextColumn(cmd.kanban_status || 'commande'))}
                                            class="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                            title="Avancer"
                                        >
                                            <ArrowRight size={12} />
                                        </button>
                                    {/if}
                                </div>

                                <!-- Edit / Duplicate / Delete -->
                                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onclick={() => onEdit(cmd)} class="p-1 hover:bg-blue-500/10 rounded text-blue-400" title="Éditer">
                                        <FileText size={12} />
                                    </button>
                                    <button onclick={() => onDuplicate(cmd)} class="p-1 hover:bg-green-500/10 rounded text-green-400" title="Dupliquer">
                                        <ClipboardCopy size={12} />
                                    </button>
                                    <button onclick={() => onDelete(cmd.id)} class="p-1 hover:bg-red-500/10 rounded text-red-400" title="Supprimer">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    {/each}
</div>
