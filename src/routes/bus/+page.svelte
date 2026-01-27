<script>
    import { onMount } from 'svelte';
    import { fly, fade, slide } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import {
        Bus, Plus, X, Pencil, Trash2, Phone, Filter, Search, Loader2, Check, FileText
    } from 'lucide-svelte';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';

    // Libs
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { BusService } from '$lib/services/bus.service.js';
    import { openConfirmModal } from '$lib/stores/modal.js';

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    
    // Chargement
    let loadingStructure = $state(true);
    let loadingSocietes = $state(false);
    let loadingDetails = $state(false);
    let isSubmitting = $state(false);

    // Données Structurelles (AJOUT DCE)
    let linesByDistrict = $state({ 'DSE': [], 'DSO': [], 'DCE': [] });
    
    // Sélection & Filtres
    let selectedDistrict = $state(null);
    let selectedLines = $state([]);
    let searchTerm = $state("");
    
    // Résultats
    let societesAffichees = $state([]);
    let selectedSocieteIds = $state([]);
    let details = $state({ contacts: [], chauffeurs: [] });

    // Modal
    let isModalOpen = $state(false);
    let isEditMode = $state(false);
    let form = $state({ id: null, nom: '', lignes: '', contacts: '', chauffeurs: '' });

    // --- EFFECTS ---
    
    // 1. Gestion Recherche Texte (Prioritaire)
    $effect(() => {
        if (searchTerm.length > 2) {
            selectedDistrict = null;
            selectedLines = [];
            loadSocietesBySearch();
        } else if (searchTerm === "" && selectedLines.length === 0) {
            societesAffichees = [];
            selectedSocieteIds = [];
        }
    });

    // 2. Gestion Sélection Lignes
    $effect(() => {
        if (selectedLines.length > 0) {
            searchTerm = "";
            loadSocietesByLines();
        } else if (!searchTerm) {
            societesAffichees = [];
        }
    });

    // 3. Gestion Sélection Sociétés (Pour détails)
    $effect(() => {
        if (selectedSocieteIds.length > 0) {
            loadDetails();
        } else {
            details = { contacts: [], chauffeurs: [] };
        }
    });

    // --- INIT ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.BUS_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        await loadStructure();
        
        // URL Param
        const q = $page.url.searchParams.get('search');
        if (q) searchTerm = q;
    });

    async function loadStructure() {
        loadingStructure = true;
        try {
            const { linesByDistrict: lbd } = await BusService.fetchLinesStructure();
            linesByDistrict = lbd;
        } catch(e) {
            console.error(e);
            toast.error("Erreur chargement structure");
        } finally {
            loadingStructure = false;
        }
    }

    // --- LOADERS ---

    async function loadSocietesBySearch() {
        loadingSocietes = true;
        try {
            societesAffichees = await BusService.searchSocietes(searchTerm);
            selectedSocieteIds = societesAffichees.map(s => s.id);
        } catch(e) { console.error(e); }
        finally { loadingSocietes = false; }
    }

    async function loadSocietesByLines() {
        loadingSocietes = true;
        try {
            societesAffichees = await BusService.getSocietesByLines(selectedLines);
            selectedSocieteIds = [];
        } catch(e) { console.error(e); }
        finally { loadingSocietes = false; }
    }

    async function loadDetails() {
        loadingDetails = true;
        try {
            details = await BusService.getDetails(selectedSocieteIds);
        } catch(e) { console.error(e); }
        finally { loadingDetails = false; }
    }

    // --- INTERACTION ---

    function selectDistrict(d) {
        if (selectedDistrict === d) {
            selectedDistrict = null;
        } else {
            selectedDistrict = d;
            selectedLines = [];
        }
    }

    function toggleLine(line) {
        if (selectedLines.includes(line)) {
            selectedLines = selectedLines.filter(l => l !== line);
        } else {
            selectedLines = [...selectedLines, line];
        }
    }

    function toggleSociete(id) {
        if (selectedSocieteIds.includes(id)) {
            selectedSocieteIds = selectedSocieteIds.filter(s => s !== id);
        } else {
            selectedSocieteIds = [...selectedSocieteIds, id];
        }
    }

    // --- MODAL ---

    async function openModal(societe = null) {
        if (!hasPermission(currentUser, ACTIONS.BUS_WRITE)) return;
        isEditMode = !!societe;
        
        if (societe) {
            const { data } = await supabase.from('societes_bus')
                .select(`lignes_bus(ligne), contacts_bus(nom, tel), chauffeurs_bus(nom, tel)`)
                .eq('id', societe.id)
                .single();
            
            if (data) {
                form = {
                    id: societe.id,
                    nom: societe.nom,
                    lignes: data.lignes_bus.map(l => l.ligne).join(', '),
                    contacts: data.contacts_bus.map(c => `${c.nom}, ${c.tel}`).join('\n'),
                    chauffeurs: data.chauffeurs_bus.map(c => `${c.nom}, ${c.tel}`).join('\n')
                };
            }
        } else {
            form = { id: null, nom: '', lignes: '', contacts: '', chauffeurs: '' };
        }
        isModalOpen = true;
    }

    async function handleSave() {
        isSubmitting = true;
        try {
            const parseList = (txt) => txt.split('\n').map(l => {
                const [nom, ...rest] = l.split(',');
                return { nom: nom?.trim(), tel: rest.join(',')?.trim() };
            }).filter(x => x.nom);

            const payload = {
                societe_id_to_update: form.id,
                new_nom: form.nom,
                new_lignes: form.lignes.split(',').map(s => s.trim()).filter(Boolean),
                new_contacts: parseList(form.contacts),
                new_chauffeurs: parseList(form.chauffeurs)
            };

            await BusService.upsertSociete(payload);
            toast.success(isEditMode ? "Modifié" : "Créé");
            isModalOpen = false;
            
            if (selectedLines.length > 0) loadSocietesByLines();
            else if (searchTerm) loadSocietesBySearch();
            loadStructure(); 
            
        } catch(e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSubmitting = false;
        }
    }

    function handleDelete(societe) {
        if (!hasPermission(currentUser, ACTIONS.BUS_DELETE)) return;
        openConfirmModal(`Supprimer ${societe.nom} ?`, async () => {
            try {
                await BusService.deleteSociete(societe.id);
                toast.success("Supprimé");
                societesAffichees = societesAffichees.filter(s => s.id !== societe.id);
                selectedSocieteIds = selectedSocieteIds.filter(id => id !== societe.id);
            } catch(e) {
                toast.error("Erreur suppression");
            }
        });
    }

    // --- HELPERS AFFICHAGE ---
    const cleanPhone = (tel) => tel ? tel.replace(/[^0-9]/g, '') : '';
    const formatPhone = (tel) => {
        const cleaned = cleanPhone(tel);
        return cleaned.length >= 9 ? cleaned.replace(/(\d{3,4})(\d{2})(\d{2})(\d{2})/, '$1/$2.$3.$4') : tel;
    };

    const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder-gray-600";
    const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1";

    // --- EXPORT PDF ---
    let exportingPDF = $state(false);

    async function handleExportPDF() {
        if (societesAffichees.length === 0) return toast.warning("Rien à exporter");

        exportingPDF = true;
        try {
            // Charger les détails de toutes les sociétés affichées
            const allIds = societesAffichees.map(s => s.id);
            const exportDetails = await BusService.getDetails(allIds);

            const doc = new jsPDF();

            // Titre principal
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Répertoire Bus', 14, 15);

            // Sous-titre avec filtres
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100);

            let yPos = 22;
            const date = new Date().toLocaleDateString();
            doc.text(`Généré le ${date}`, 14, yPos);

            if (selectedDistrict || selectedLines.length > 0 || searchTerm) {
                yPos += 5;
                let filtre = 'Filtres: ';
                if (selectedDistrict) filtre += `District ${selectedDistrict}`;
                if (selectedLines.length > 0) {
                    if (selectedDistrict) filtre += ' | ';
                    filtre += `Lignes: ${selectedLines.join(', ')}`;
                }
                if (searchTerm) {
                    if (selectedDistrict || selectedLines.length > 0) filtre += ' | ';
                    filtre += `Recherche: "${searchTerm}"`;
                }
                // Tronquer si trop long
                if (filtre.length > 100) filtre = filtre.substring(0, 97) + '...';
                doc.text(filtre, 14, yPos);
            }

            doc.setTextColor(0);

            // Préparer les données
            const rows = societesAffichees.map(soc => {
                const socContacts = exportDetails.contacts.filter(c => c.societes_bus?.id === soc.id || c.societe_id === soc.id);
                const socChauffeurs = exportDetails.chauffeurs.filter(c => c.societes_bus?.id === soc.id || c.societe_id === soc.id);

                return [
                    soc.nom,
                    socContacts.map(c => `${c.nom}: ${formatPhone(c.tel)}`).join('\n') || '-',
                    socChauffeurs.map(c => `${c.nom}: ${formatPhone(c.tel)}`).join('\n') || '-'
                ];
            });

            autoTable(doc, {
                startY: yPos + 8,
                head: [['Société', 'Contacts / Dispatch', 'Chauffeurs']],
                body: rows,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [59, 130, 246] },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 50 },
                    1: { cellWidth: 70 },
                    2: { cellWidth: 70 }
                }
            });

            doc.save('Repertoire_Bus.pdf');
            toast.success("PDF généré");
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors de la génération du PDF");
        } finally {
            exportingPDF = false;
        }
    }

</script>

<svelte:head>
  <title>Bus | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-blue-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
              <Bus class="w-8 h-8" />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire Bus</h1>
              <p class="text-gray-500 text-sm mt-1">Lignes de substitution et contacts.</p>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
            {#if societesAffichees.length > 0}
                <button onclick={handleExportPDF} disabled={exportingPDF} class="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl transition-all font-bold text-sm hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">
                    {#if exportingPDF}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {:else}
                        <FileText class="w-4 h-4" />
                    {/if}
                    PDF
                </button>
            {/if}
            {#if hasPermission(currentUser, ACTIONS.BUS_WRITE)}
                <button onclick={() => openModal()} class="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all hover:scale-105">
                    <Plus class="w-5 h-5" />
                    <span class="hidden sm:inline">Ajouter Société</span>
                </button>
            {/if}
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6" in:fly={{ y: 20, delay: 100 }}>
        
        <div class="lg:col-span-3 space-y-4">
            <div class="bg-black/20 border border-white/5 rounded-2xl p-5 h-full flex flex-col">
                <div class="relative mb-6">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input 
                        type="text" 
                        bind:value={searchTerm} 
                        placeholder="Recherche..." 
                        class="w-full pl-10 pr-4 py-2 rounded-xl bg-black/40 border border-white/10 text-white focus:ring-1 focus:ring-blue-500/50 outline-none"
                    >
                </div>

                <h3 class="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2"><Filter class="w-3 h-3" /> Districts</h3>
                
                {#if loadingStructure}
                    <div class="flex justify-center py-4"><Loader2 class="animate-spin text-gray-600"/></div>
                {:else}
                    <div class="flex flex-col gap-2">
                        {#each ['DSE', 'DSO', 'DCE'] as dist}
                            <button 
                                onclick={() => selectDistrict(dist)} 
                                class="w-full text-left px-4 py-3 rounded-xl border transition-all flex justify-between items-center {selectedDistrict === dist ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 font-bold' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}"
                            >
                                <span>{dist}</span>
                                {#if selectedDistrict === dist}<div class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_currentColor]"></div>{/if}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <div class="lg:col-span-9 space-y-6">
            <div class="bg-black/20 border border-white/5 rounded-2xl p-5 min-h-[120px]">
                <h3 class="text-xs font-bold uppercase text-gray-500 mb-4 flex items-center gap-2">
                    <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Lignes Disponibles {#if selectedDistrict}({selectedDistrict}){/if}
                </h3>
                
                {#if !selectedDistrict}
                    <div class="text-center py-6 text-gray-600 italic">Sélectionnez un district pour voir les lignes.</div>
                {:else}
                    <div class="flex flex-wrap gap-2" in:slide>
                        {#each linesByDistrict[selectedDistrict] || [] as line}
                            <button 
                                onclick={() => toggleLine(line)} 
                                class="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 {selectedLines.includes(line) ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'}"
                            >
                                {#if selectedLines.includes(line)}<Check class="w-3 h-3" />{/if}
                                {line}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[300px]">
                
                <div class="space-y-4">
                    <h3 class="text-sm font-bold text-gray-300 flex items-center gap-2">
                        <div class="w-1 h-4 bg-blue-500 rounded-full"></div> Sociétés ({societesAffichees.length})
                    </h3>
                    
                    {#if loadingSocietes}
                        <div class="flex justify-center py-10"><Loader2 class="w-8 h-8 animate-spin text-blue-500/50"/></div>
                    {:else if societesAffichees.length === 0}
                        <div class="text-gray-600 text-sm italic pl-4">Aucune société sélectionnée.</div>
                    {:else}
                        <div class="space-y-2">
                            {#each societesAffichees as soc (soc.id)}
                                <div class="group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer {selectedSocieteIds.includes(soc.id) ? 'bg-blue-500/10 border-blue-500/30' : 'bg-black/20 border-white/5 hover:border-white/20'}"
                                     onclick={() => toggleSociete(soc.id)}
                                     onkeydown={(e) => e.key === 'Enter' && toggleSociete(soc.id)}
                                     role="checkbox"
                                     aria-checked={selectedSocieteIds.includes(soc.id)}
                                     tabindex="0"
                                >
                                    <div class="flex items-center gap-3 pointer-events-none">
                                        <div class="w-5 h-5 rounded border flex items-center justify-center transition-colors {selectedSocieteIds.includes(soc.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}">
                                            {#if selectedSocieteIds.includes(soc.id)}<Check class="w-3.5 h-3.5 text-white" />{/if}
                                        </div>
                                        <span class="font-bold text-gray-200">{soc.nom}</span>
                                    </div>
                                    
                                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {#if hasPermission(currentUser, ACTIONS.BUS_WRITE)}
                                            <button 
                                                onclick={(e) => { e.stopPropagation(); openModal(soc); }} 
                                                class="p-1.5 text-gray-400 hover:text-blue-400 rounded hover:bg-white/10"
                                            >
                                                <Pencil class="w-4 h-4"/>
                                            </button>
                                        {/if}
                                        {#if hasPermission(currentUser, ACTIONS.BUS_DELETE)}
                                            <button 
                                                onclick={(e) => { e.stopPropagation(); handleDelete(soc); }} 
                                                class="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-white/10"
                                            >
                                                <Trash2 class="w-4 h-4"/>
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="space-y-6">
                    {#if loadingDetails}
                        <div class="flex justify-center py-20"><Loader2 class="w-8 h-8 animate-spin text-blue-500/50"/></div>
                    {:else if selectedSocieteIds.length > 0}
                        {#if details.contacts.length > 0}
                            <div class="bg-black/20 border border-white/5 rounded-2xl p-5" in:slide>
                                <h3 class="text-xs font-bold uppercase text-gray-500 mb-3">Bureaux / Dispatch</h3>
                                <div class="space-y-2">
                                    {#each details.contacts as c}
                                        <div class="flex justify-between items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                            <div>
                                                <div class="text-sm font-bold text-gray-200">{c.nom}</div>
                                                <div class="text-[10px] text-gray-500">{c.societes_bus?.nom}</div>
                                            </div>
                                            <a href="etrali:{cleanPhone(c.tel)}" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono hover:bg-blue-500/20 transition-colors">
                                                <Phone class="w-3 h-3" /> {formatPhone(c.tel)}
                                            </a>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        {#if details.chauffeurs.length > 0}
                            <div class="bg-black/20 border border-white/5 rounded-2xl p-5" in:slide>
                                <h3 class="text-xs font-bold uppercase text-gray-500 mb-3">Chauffeurs</h3>
                                <div class="space-y-2">
                                    {#each details.chauffeurs as c}
                                        <div class="flex justify-between items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                            <div>
                                                <div class="text-sm font-bold text-gray-200">{c.nom}</div>
                                                <div class="text-[10px] text-gray-500">{c.societes_bus?.nom}</div>
                                            </div>
                                            <a href="etrali:{cleanPhone(c.tel)}" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-mono hover:bg-green-500/20 transition-colors">
                                                <Phone class="w-3 h-3" /> {formatPhone(c.tel)}
                                            </a>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    {/if}
                </div>

            </div>
        </div>
      </div>
    </div>

    {#if isModalOpen}
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
            <div class="bg-[#1a1d24] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10" transition:fly={{ y: 20 }}>
                <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/[0.02]">
                    <h3 class="text-lg font-bold text-gray-200">{isEditMode ? 'Modifier' : 'Ajouter'} Société</h3>
                    <button onclick={() => isModalOpen = false} class="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"><X class="w-5 h-5" /></button>
                </div>
                
                <div class="p-6 overflow-y-auto space-y-5 custom-scrollbar">
                    <div>
                        <label class={labelClass}>Nom de la société</label>
                        <input type="text" bind:value={form.nom} class={inputClass} placeholder="Ex: Tec Hainaut">
                    </div>
                    <div>
                        <label class={labelClass}>Lignes (séparées par virgules)</label>
                        <input type="text" bind:value={form.lignes} class={inputClass} placeholder="L.82, L.134...">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class={labelClass}>Contacts (Nom, Tel)</label>
                            <textarea rows="4" bind:value={form.contacts} class="{inputClass} resize-none font-mono text-xs" placeholder="Dispath, 047..."></textarea>
                        </div>
                        <div>
                            <label class={labelClass}>Chauffeurs (Nom, Tel)</label>
                            <textarea rows="4" bind:value={form.chauffeurs} class="{inputClass} resize-none font-mono text-xs" placeholder="Jean, 049..."></textarea>
                        </div>
                    </div>
                </div>

                <div class="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end gap-3">
                    <button onclick={() => isModalOpen = false} class="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl transition-all font-bold text-sm">Annuler</button>
                    <button onclick={handleSave} disabled={isSubmitting} class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        {#if isSubmitting}<Loader2 class="w-4 h-4 animate-spin"/>{/if} Enregistrer
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}