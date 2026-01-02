<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { 
    Bus, FileText, LayoutDashboard, Edit3, Route, Send, 
    Info, ArrowRight, Mail, Lock, X, School
  } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  // --- ÉTAT ---
  let currentStep = 0;
  let showTooltipData = { visible: false, x: 0, y: 0, title: '', desc: '' };

  const steps = [
    { id: 0, title: "Vue d'ensemble", icon: LayoutDashboard },
    { id: 1, title: "Mission & Lignes", icon: FileText },
    { id: 2, title: "Parcours & Arrêts", icon: Route },
    { id: 3, title: "Véhicules", icon: Bus },
    { id: 4, title: "Finalisation", icon: Send }
  ];

  function setStep(index) {
    currentStep = index;
    showTooltipData.visible = false;
  }

  function close() {
    dispatch('close');
  }

  function handleHotspotClick(event, title, desc) {
    event.stopPropagation();
    const rect = event.target.getBoundingClientRect();
    showTooltipData = {
      visible: true,
      x: rect.left + (rect.width / 2),
      y: rect.top - 10,
      title,
      desc
    };
  }
</script>

<div class="fixed inset-0 z-50 flex bg-[#0f1115] text-gray-200" transition:fade={{ duration: 200 }} on:click={() => showTooltipData.visible = false}>
  
  <aside class="w-20 md:w-64 bg-[#16181d] border-r border-white/5 flex flex-col shadow-xl z-20">
    <div class="p-6 border-b border-white/5 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
          <School size={24} />
        </div>
        <div class="hidden md:block">
          <h1 class="text-lg font-bold text-white tracking-tight">Formation</h1>
          <p class="text-xs text-gray-500">Module Otto</p>
        </div>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto p-2 md:p-4 space-y-2">
      {#each steps as step}
        <button 
          on:click={() => setStep(step.id)}
          class="w-full text-left px-2 py-3 md:px-4 rounded-xl flex items-center gap-3 transition-all text-sm font-medium border
          {currentStep === step.id 
            ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-md' 
            : 'text-gray-400 border-transparent hover:bg-white/5 hover:text-white'}"
          title={step.title}
        >
          <svelte:component this={step.icon} size={20} class="shrink-0" />
          <span class="hidden md:inline">{step.title}</span>
        </button>
      {/each}
    </nav>

    <div class="p-4 border-t border-white/5 hidden md:block">
      <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <h4 class="text-blue-400 font-bold text-xs uppercase mb-1 flex items-center gap-1">
          <Info size={14} /> Astuce
        </h4>
        <p class="text-xs text-gray-400">Cliquez sur les points <span class="text-orange-400 font-bold">oranges</span>.</p>
      </div>
    </div>
  </aside>

  <main class="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-br from-[#0f1115] to-[#13151a]">
    
    <button on:click={close} class="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
      <X size={24} />
    </button>

    <div class="flex-1 overflow-y-auto p-4 md:p-8 relative">
      {#key currentStep}
        <div in:fly={{ y: 20, duration: 400, delay: 100 }} class="max-w-5xl mx-auto h-full flex flex-col pt-8 md:pt-0">
          
          {#if currentStep === 0}
            <div class="flex flex-col items-center justify-center h-full text-center space-y-8">
              <div class="p-6 rounded-3xl bg-gradient-to-br from-orange-500/20 to-purple-600/20 border border-white/10 shadow-[0_0_50px_rgba(249,115,22,0.2)]">
                <Bus size={64} class="text-orange-400" />
              </div>
              <div>
                <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Tutoriel Otto (C3)</h2>
                <p class="text-lg text-gray-400 max-w-2xl mx-auto">Apprenez à gérer les commandes de bus de remplacement.</p>
              </div>
              <button on:click={() => setStep(1)} class="mt-8 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all flex items-center gap-2">
                Commencer <ArrowRight size={20} />
              </button>
            </div>

         {:else}
            <div class="flex flex-col h-full">
              <h2 class="text-2xl font-bold text-white mb-1">{steps[currentStep].title}</h2>
              <p class="text-gray-400 text-sm mb-4">
                 Guide interactif : cliquez sur les puces oranges.
              </p>

              <div class="relative flex-1 flex items-start justify-center overflow-hidden pb-4">
                
                <div class="relative w-full max-w-7xl h-auto max-h-[calc(100vh-200px)] aspect-video rounded-xl border border-white/10 shadow-2xl bg-black/40 overflow-hidden">
                   
                   <img 
                     src="/tuto/step{currentStep}.png" 
                     alt="Tutoriel Etape {currentStep}"
                     class="w-full h-full object-contain pointer-events-none select-none"
                   />

                   <div class="absolute inset-0">
                       {#if currentStep === 1}
                         <button class="hotspot" style="top: 40%; left: 15%;" on:click={(e) => handleHotspotClick(e, 'Motif & Date', 'Indiquez le motif et la date.')}>1</button>
                         <button class="hotspot" style="top: 65%; left: 15%;" on:click={(e) => handleHotspotClick(e, 'Réf. TC', 'Obligatoire pour SAP (ex: TC_123).')}>2</button>
                         <button class="hotspot" style="top: 30%; right: 15%;" on:click={(e) => handleHotspotClick(e, 'Lignes', 'Filtre les gares disponibles.')}>3</button>
                       
                       {:else if currentStep === 2}
                         <button class="hotspot" style="top: 37%; right: 45%;" on:click={(e) => handleHotspotClick(e, 'Switch Direct', 'Active ou désactive les arrêts.')}>1</button>
                         <button class="hotspot" style="top: 37%; left: 20%;" on:click={(e) => handleHotspotClick(e, 'Trajet', 'Origine et Destination.')}>2</button>
                         <button class="hotspot" style="top: 50%; right: 5%;" on:click={(e) => handleHotspotClick(e, 'Arrêts', 'Cochez les gares intermédiaires.')}>3</button>

                       {:else if currentStep === 3}
                          <button class="hotspot" style="top: 35%; right: 10%;" on:click={(e) => handleHotspotClick(e, 'Ajout Bus', 'Ajoutez un autre véhicule.')}>1</button>
                          <button class="hotspot" style="top: 50%; left: 45%;" on:click={(e) => handleHotspotClick(e, 'Horaires', 'Prévue vs Confirmée (Vert).')}>2</button>

                       {:else if currentStep === 4}
                          <button class="hotspot" style="bottom: 50%; right: 280px;" on:click={(e) => handleHotspotClick(e, 'PDF', 'Télécharger le bon.')}>1</button>
                          <button class="hotspot" style="bottom: 50%; right: 50px;" on:click={(e) => handleHotspotClick(e, 'Clôturer', 'Verrouille la commande.')}>2</button>
                       {/if}
                   </div>
                   
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/key}
    </div>

    {#if showTooltipData.visible}
      <div class="fixed z-[60] w-64 bg-[#1f2937] border border-orange-500/30 rounded-xl shadow-2xl p-4 pointer-events-none"
           style="top: {showTooltipData.y}px; left: {showTooltipData.x}px; transform: translate(-50%, -100%) translateY(-15px);">
        <h4 class="text-orange-400 font-bold text-sm uppercase mb-1 flex items-center gap-2">
            <Info size={16} /> {showTooltipData.title}
        </h4>
        <p class="text-gray-300 text-xs leading-relaxed">{@html showTooltipData.desc}</p>
        <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#1f2937] border-r border-b border-orange-500/30 transform rotate-45"></div>
      </div>
    {/if}
  </main>
</div>

<style>
  .hotspot {
    position: absolute;
    width: 24px;
    height: 24px;
    background-color: rgba(249, 115, 22, 0.9);
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    color: white;
    transition: transform 0.2s;
    box-shadow: 0 0 15px rgba(249, 115, 22, 0.6);
  }
  .hotspot:hover { transform: scale(1.25); background-color: #fb923c; }
  .hotspot::after {
    content: ''; position: absolute; inset: 0; border-radius: 50%;
    background-color: rgba(249, 115, 22, 0.6); z-index: -1;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { transform: scale(0.8); opacity: 0.8; }
    100% { transform: scale(2.5); opacity: 0; }
  }
</style>