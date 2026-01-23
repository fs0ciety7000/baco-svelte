<script>
    import { onMount } from 'svelte';
    import { fly, fade, scale } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { 
        Car, MapPin, Phone, Search, Plus, FileText, Pencil, Trash2, X, 
        CheckSquare, Square, Loader2, RefreshCw, Info, Home, Mail 
    } from 'lucide-svelte';
    
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    
    // Libs & Stores
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { TaxiService } from '$lib/services/taxi.service.js';
    import { openConfirmModal } from '$lib/stores/modal.js';

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let isLoading = $state(true);
    let isModalOpen = $state(false);
    let isSubmitting = $state(false);

    // Données
    let taxis = $state([]);
    let lieuxDisponibles = $state([]);
    
    // Filtres
    let selectedLieux = $state([]);
    let searchTerm = $state("");

    // Formulaire Modal
    let form = $state(getInitialForm());
    let isEditMode = $state(false);

    // --- DERIVED ---
    let filteredTaxis = $derived(
        taxis.filter(t => {
            const matchesSearch = (
                (t.societe || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.contacts.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
            );
            const matchesLieu = selectedLieux.length === 0 || t.lieux.some(l => selectedLieux.includes(l));
            return matchesSearch && matchesLieu;
        })
    );

    // --- INIT ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.TAXI_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        
        // Gestion URL search
        const urlQuery = $page.url.searchParams.get('search');
        if (urlQuery) searchTerm = urlQuery;

        await loadData();
    });

    async function loadData() {
        isLoading = true;
        try {
            const [taxisData, lieuxData] = await Promise.all([
                TaxiService.getAllTaxis(),
                TaxiService.getLieux()
            ]);
            taxis = taxisData;
            lieuxDisponibles = lieuxData;
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement données");
        } finally {
            isLoading = false;
        }
    }

    // --- ACTIONS UI ---
    function getInitialForm() {
        return { id: null, societe: '', lieux: '', contacts: '', mail: '', adresse: '', remarques: '' };
    }

    function toggleLieu(lieu) {
        if (selectedLieux.includes(lieu)) {
            selectedLieux = selectedLieux.filter(l => l !== lieu);
        } else {
            selectedLieux = [...selectedLieux, lieu];
        }
    }

    function openModal(taxi = null) {
        if (!hasPermission(currentUser, ACTIONS.TAXI_WRITE)) return;
        isEditMode = !!taxi;
        
        if (taxi) {
            // Conversion des tableaux en strings pour les textareas
            form = {
                id: taxi.id,
                societe: taxi.societe,
                lieux: (taxi.lieux || []).join(', '),
                contacts: (taxi.contacts || []).join('\n'),
                mail: (taxi.mail || []).join('\n'),
                adresse: (taxi.adresse || []).join('\n'),
                remarques: (taxi.remarques || []).join('\n')
            };
        } else {
            form = getInitialForm();
        }
        isModalOpen = true;
    }

    async function handleSubmit() {
        if (!form.societe) return toast.warning("Nom requis");
        
        const lieuxArray = form.lieux.split(',').map(l => l.trim()).filter(Boolean);
        if (lieuxArray.length === 0) return toast.warning("Au moins un secteur requis");

        const splitString = (str) => (str || '').split('\n').map(s => s.trim()).filter(Boolean);

        const payload = {
            id: form.id,
            societe: form.societe,
            lieux: lieuxArray,
            contacts: splitString(form.contacts),
            mail: splitString(form.mail),
            adresse: splitString(form.adresse),
            remarques: splitString(form.remarques)
        };

        isSubmitting = true;
        try {
            await TaxiService.saveTaxi(payload);
            toast.success(isEditMode ? "Modifié !" : "Ajouté !");
            await loadData(); // Refresh complet pour mettre à jour les filtres si nouveaux lieux
            isModalOpen = false;
        } catch(e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSubmitting = false;
        }
    }

    function handleDelete(taxi) {
        if (!hasPermission(currentUser, ACTIONS.TAXI_DELETE)) return;
        openConfirmModal(`Supprimer ${taxi.societe} ?`, async () => {
            try {
                await TaxiService.deleteTaxi(taxi.id);
                toast.success("Supprimé");
                await loadData();
            } catch(e) {
                toast.error("Erreur suppression");
            }
        });
    }

    function handleExportPDF() {
        if (filteredTaxis.length === 0) return toast.warning("Rien à exporter");
        const doc = new jsPDF();
        doc.text(`Répertoire Taxis - ${new Date().toLocaleDateString()}`, 14, 15);
        
        const rows = filteredTaxis.map(t => [
            t.societe,
            t.lieux.join(', '),
            t.contacts.join('\n'),
            t.mail.join('\n'),
            t.adresse.join('\n')
        ]);

        autoTable(doc, {
            startY: 25,
            head: [['Société', 'Secteurs', 'Contacts', 'Emails', 'Adresse']],
            body: rows,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 }
        });
        doc.save('Repertoire_Taxis.pdf');
    }

    // Helpers d'affichage
    const cleanPhone = (tel) => tel ? tel.replace(/[^0-9]/g, '') : '';
    
    // Classes CSS partagées
    const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-yellow-500/50 outline-none transition-all placeholder-gray-600";
    const labelClass = "block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1";

</script>

<svelte:head>
  <title>Taxis | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-yellow-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.15)]">
              <Car size={32} />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire Taxis</h1>
              <p class="text-gray-500 text-sm mt-1">Annuaire des transporteurs par secteur.</p>
            </div>
        </div>
        
        <div class="flex gap-2">
          {#if filteredTaxis.length > 0}
            <button onclick={handleExportPDF} class="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl transition-all font-bold text-sm">
              <FileText class="w-4 h-4" /> PDF
            </button>
          {/if}

          {#if hasPermission(currentUser, ACTIONS.TAXI_WRITE)}
            <button 
              onclick={() => openModal()} 
              class="px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold shadow-lg shadow-yellow-500/10"
            >
              <Plus class="w-5 h-5" /> 
              <span class="hidden sm:inline">Ajouter</span>
            </button>
          {/if}
        </div>
      </header>

      <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, delay: 100 }}>
        <div class="flex flex-col md:flex-row justify-between mb-6 gap-4">
          <div class="flex items-center gap-3">
            <h3 class="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Secteurs disponibles
            </h3>
            <button onclick={loadData} class="p-1.5 hover:bg-white/5 rounded-full transition-colors text-gray-500 hover:text-white">
                 <RefreshCw class="w-4 h-4 {isLoading ? 'animate-spin' : ''}" />
            </button>
          </div>

          <div class="relative w-full md:w-72 group">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-yellow-400 transition-colors" />
            <input 
                type="text" 
                bind:value={searchTerm} 
                placeholder="Rechercher..." 
                class="w-full pl-10 pr-4 py-2 rounded-xl border border-white/10 bg-black/40 text-gray-200 placeholder-gray-600 focus:ring-2 focus:ring-yellow-500/30 focus:border-transparent outline-none transition-all"
            >
          </div>
        </div>

        {#if lieuxDisponibles.length > 0}
            <div class="flex flex-wrap gap-2">
            {#each lieuxDisponibles as lieu}
                <button 
                    onclick={() => toggleLieu(lieu)}
                    class="flex items-center space-x-2 px-3 py-1.5 border rounded-lg transition-all duration-300 text-xs font-bold uppercase tracking-wide
                    {selectedLieux.includes(lieu) 
                        ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.15)]' 
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}"
                >
                    {#if selectedLieux.includes(lieu)}<CheckSquare class="w-3.5 h-3.5" />{:else}<Square class="w-3.5 h-3.5" />{/if}
                    <span>{lieu}</span>
                </button>
            {/each}
            </div>
        {/if}
      </div>

      <div>
        {#if isLoading && taxis.length === 0}
             <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-yellow-500/50" /></div>
        {:else if filteredTaxis.length === 0}
          <div class="text-center py-12 bg-black/20 rounded-2xl border border-dashed border-white/10">
            <p class="text-gray-500">Aucun résultat trouvé.</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" in:fly={{ y: 20, duration: 400 }}>
            {#each filteredTaxis as taxi (taxi.id)}
                 <div class="group bg-black/20 rounded-2xl border border-white/5 hover:border-yellow-500/30 p-5 hover:shadow-xl hover:shadow-black/50 transition-all duration-300 relative flex flex-col hover:-translate-y-1">
                    
                    <div class="flex justify-between items-start mb-4 pb-4 border-b border-white/5">
                      <h3 class="font-bold text-xl text-gray-200 group-hover:text-yellow-400 transition-colors">{taxi.societe}</h3>
                      <div class="flex flex-wrap gap-1 justify-end max-w-[50%]">
                          {#each taxi.lieux as l}
                            <span class="bg-yellow-500/10 text-yellow-500/80 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-500/10 {selectedLieux.includes(l) ? 'border-yellow-500/50 text-yellow-400' : ''}">
                                {l}
                            </span>
                          {/each}
                      </div>
                    </div>

                    <div class="space-y-3 flex-grow text-sm">
                      {#each taxi.contacts as contactLine}
                          <div class="flex justify-between items-center group/item hover:bg-white/5 p-1.5 rounded transition-colors -mx-1.5">
                             <span class="text-gray-300 font-medium font-mono">{contactLine}</span>
                             <a href="etrali:{cleanPhone(contactLine)}" class="text-yellow-400/80 hover:text-yellow-300 bg-yellow-500/10 p-1.5 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 transition-all">
                                <Phone class="w-3.5 h-3.5"/>
                             </a>
                          </div>
                      {/each}
                    </div>

                    {#if taxi.mail.length > 0}
                      <div class="mt-4 space-y-2 pt-3 border-t border-white/5">
                        {#each taxi.mail as email}
                          <a href="mailto:{email}" class="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors group/mail">
                            <Mail class="w-3.5 h-3.5 flex-shrink-0 group-hover/mail:text-blue-400 transition-colors" />
                            <span class="truncate">{email}</span>
                          </a>
                        {/each}
                      </div>
                    {/if}

                    {#if taxi.adresse.length > 0}
                      <div class="mt-3 space-y-1">
                        {#each taxi.adresse as addr}
                          <div class="flex items-start gap-2 text-xs text-gray-500 bg-white/5 p-2 rounded border border-white/5">
                            <Home class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-600" />
                            <span>{addr}</span>
                          </div>
                        {/each}
                      </div>
                    {/if}

                    {#if taxi.remarques.length > 0}
                      <div class="mt-3 space-y-1">
                        {#each taxi.remarques as rem}
                           <div class="flex items-start gap-2 text-xs bg-yellow-500/5 p-2 rounded text-yellow-200/70 border border-yellow-500/10">
                            <Info class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-yellow-500/50" />
                            <span>{rem}</span>
                          </div>
                         {/each}
                      </div>
                    {/if}
                    
                    <div class="absolute top-4 right-14 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-black/60 backdrop-blur rounded-lg p-1 border border-white/10">
                        {#if hasPermission(currentUser, ACTIONS.TAXI_WRITE)}
                            <button onclick={() => openModal(taxi)} class="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500/20 rounded transition-colors"><Pencil class="w-3.5 h-3.5" /></button>
                        {/if}
                        {#if hasPermission(currentUser, ACTIONS.TAXI_DELETE)}
                            <button onclick={() => handleDelete(taxi)} class="p-1.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded transition-colors"><Trash2 class="w-3.5 h-3.5" /></button>
                        {/if}
                    </div>
                 </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if isModalOpen}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
        <div 
            class="bg-[#1a1d24] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10"
            transition:fly={{ y: 20 }}
        >
            <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/[0.02]">
                <h3 class="text-lg font-bold text-gray-200 flex items-center gap-2">
                    {isEditMode ? 'Modifier' : 'Ajouter'} Société
                </h3>
                <button onclick={() => isModalOpen = false} class="text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <div class="p-6 overflow-y-auto space-y-5 flex-grow custom-scrollbar">
                <div>
                    <label class={labelClass}>Nom société</label>
                    <input bind:value={form.societe} placeholder="Nom" class={inputClass}>
                </div>
                
                <div>
                    <label class={labelClass}>Secteurs (séparés par virgules)</label>
                    <input bind:value={form.lieux} placeholder="Mons, La Louvière..." class={inputClass}>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class={labelClass}>Contacts (Un/ligne)</label>
                        <textarea bind:value={form.contacts} rows="3" class="{inputClass} font-mono resize-none text-xs"></textarea>
                    </div>
                    <div>
                        <label class={labelClass}>E-mails (Un/ligne)</label>
                        <textarea bind:value={form.mail} rows="3" class="{inputClass} font-mono resize-none text-xs"></textarea>
                    </div>
                </div>

                <div>
                    <label class={labelClass}>Adresses</label>
                    <textarea bind:value={form.adresse} rows="2" class="{inputClass} resize-none"></textarea>
                </div>

                <div>
                    <label class={labelClass}>Remarques</label>
                    <textarea bind:value={form.remarques} rows="2" class="{inputClass} resize-none"></textarea>
                </div>
            </div>
            
            <div class="flex justify-end items-center px-6 py-4 bg-white/[0.02] border-t border-white/10 gap-3">
                <button onclick={() => isModalOpen = false} class="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 hover:text-white transition-all text-sm font-bold">
                    Annuler
                </button>
                <button 
                  onclick={handleSubmit} 
                  disabled={isSubmitting} 
                  class="px-5 py-2 rounded-xl flex items-center gap-2 transition-all bg-yellow-500 hover:bg-yellow-400 text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/20 text-sm"
                >
                  {#if isSubmitting}<Loader2 class="w-4 h-4 animate-spin"/>{/if}
                  Enregistrer
                </button>
            </div>
        </div>
      </div>
    {/if}
{/if}