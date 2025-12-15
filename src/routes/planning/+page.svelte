// src/routes/planning/+page.svelte (À créer)

<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { CalendarDays, Plus, Loader2, ListTodo } from 'lucide-svelte';
  
  // Importer les fonctions du calendrier (si vous voulez réutiliser celles de Nav.svelte,
  // elles devraient être déplacées dans un fichier .js utilitaire,
  // ou recopiées ici, comme celles-ci sont assez lourdes, je propose de les recopier pour l'exemple)
  
  // NOTE: Les fonctions getWeekNumber et generateCalendarDays de Nav.svelte 
  // devront être rendues disponibles ici pour que le calendrier fonctionne.
  // ... (Recopier le script des fonctions calendrier ici) ...
  
  let isLoading = true;
  let user = null;
  let leaveRequests = []; // Pour stocker les demandes de congés
  
  // États pour le calendrier (comme dans Nav.svelte)
  let currentDate = new Date();
  currentDate.setDate(1); 
  $: displayedMonth = currentDate.getMonth();
  $: displayedYear = currentDate.getFullYear();
  let days = [];
  $: {
    // Si vous copiez les fonctions calendrier, assurez-vous de les appeler ici
    // days = generateCalendarDays(displayedYear, displayedMonth);
  }
  
  onMount(async () => {
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    user = sessionUser;
    
    // Charger les demandes de congés
    await loadLeaveRequests();
    
    isLoading = false;
  });

  async function loadLeaveRequests() {
    // Adapter cette requête pour charger les congés de l'année/mois en cours
    const { data, error } = await supabase
        .from('leave_requests')
        .select(`
            id, start_date, end_date, type, status, reason,
            profiles(full_name) // Pour afficher qui a fait la demande
        `)
        .order('start_date', { ascending: true });
        
    if (data) {
        leaveRequests = data;
    }
    if (error) {
        console.error("Erreur chargement congés:", error);
    }
  }

  // Fonctions pour gérer les congés (ouvrir modal de demande, etc.)
  function handleNewRequest() {
    alert("Ouvrir la modale de nouvelle demande de congé");
    // Implémenter une modale pour soumettre le formulaire à la table 'leave_requests'
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
            <CalendarDays class="w-6 h-6 text-blue-500" />
            Planning Annuel & Demandes de Congé
        </h1>
        <button on:click={handleNewRequest} class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors flex items-center gap-2">
            <Plus class="w-4 h-4" /> Nouvelle Demande
        </button>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-blue-600" /></div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
                <ListTodo class="w-5 h-5 text-yellow-500" /> Demandes en cours
            </h2>
            
            <ul class="space-y-2">
                {#each leaveRequests.filter(r => r.status === 'PENDING') as request}
                    <li class="p-3 bg-yellow-500/10 rounded-lg flex justify-between items-center text-sm">
                        <span>
                            {request.profiles.full_name || 'Moi'} : 
                            Du {new Date(request.start_date).toLocaleDateString('fr-FR')} 
                            au {new Date(request.end_date).toLocaleDateString('fr-FR')} 
                            ({request.type})
                        </span>
                        <span class="font-semibold text-yellow-600">En attente</span>
                    </li>
                {:else}
                    <li class="text-gray-500 italic text-center py-4">
                        Aucune demande de congé en attente.
                    </li>
                {/each}
            </ul>

            <h2 class="text-xl font-semibold mt-8 mb-4">Calendrier de l'année</h2>
            <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                Zone du calendrier annuel...
            </div>
        </div>
    {/if}
</div>