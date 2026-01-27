<script>
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Mail, Lock, LogIn, Loader2, ArrowRight } from 'lucide-svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { elasticOut } from 'svelte/easing';

  let email = '';
  let password = '';
  let loading = false;
  let errorMessage = '';
  let successMessage = '';
  let checkingGate = true;

  // Vérifier si le gate est activé au chargement
  onMount(async () => {
    if (!browser) return;

    try {
      // Vérifier si gate_mode est activé
      const { data: gateSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'gate_mode')
        .single();

      const gateActive = gateSetting?.value === 'true' || gateSetting?.value === true;

      if (gateActive) {
        // Vérifier si on a un pass valide
        const gatePass = document.cookie
          .split('; ')
          .find(row => row.startsWith('baco_gate_pass='))
          ?.split('=')[1];

        if (!gatePass || !isValidGatePass(gatePass)) {
          // Rediriger vers /gate
          goto('/gate');
          return;
        }
      }
    } catch (e) {
      console.error('Erreur vérification gate:', e);
    }

    checkingGate = false;
  });

  function isValidGatePass(pass) {
    try {
      const data = JSON.parse(atob(pass));
      return data.exp > Date.now();
    } catch {
      return false;
    }
  }

  async function handleLogin() {
    loading = true;
    errorMessage = '';
    successMessage = '';

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      errorMessage = "Email ou mot de passe incorrect.";
      loading = false;
      return;
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('banned_until')
        .eq('id', data.user.id)
        .single();

      if (profile && profile.banned_until) {
        await supabase.auth.signOut();
        errorMessage = "Ce compte a été banni.";
        loading = false;
        return;
      }
      
      goto('/accueil');

    } catch (err) {
      console.error(err);
      errorMessage = "Erreur de vérification du profil.";
      await supabase.auth.signOut();
      loading = false;
    }
  }

  async function handleResetPassword() {
    if (!email) {
      errorMessage = "Veuillez d'abord saisir votre email.";
      return;
    }

    loading = true;
    errorMessage = '';
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/profil` 
    });

    if (error) {
      errorMessage = "Erreur lors de l'envoi : " + error.message;
    } else {
      successMessage = "Email de réinitialisation envoyé !";
    }
    loading = false;
  }
</script>

<svelte:head>
  <title>Connexion | BACO</title>
</svelte:head>

{#if checkingGate}
  <div class="min-h-screen flex items-center justify-center bg-[#080a0f]">
    <Loader2 class="w-8 h-8 text-blue-400 animate-spin" />
  </div>
{:else}
  <div class="min-h-screen flex items-center justify-center bg-[#080a0f] font-sans p-4 relative overflow-hidden">
    
    <div class="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/30 blur-[120px] pointer-events-none animate-pulse-slow"></div>
    <div class="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] rounded-full bg-indigo-600/20 blur-[150px] pointer-events-none"></div>
    <div class="absolute top-[40%] left-[30%] w-[30%] h-[30%] rounded-full bg-cyan-500/20 blur-[100px] pointer-events-none animate-pulse-slow delay-700"></div>

    <div 
      class="w-full max-w-[400px] p-10 rounded-[2.5rem] 
             bg-white/10 backdrop-blur-3xl 
             border border-white/10 border-t-white/30 border-l-white/20
             shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]
             relative z-10 overflow-hidden group/card"
      in:fly={{ y: 30, duration: 1000, easing: elasticOut }}
    >
      <div class="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

      <div class="mb-12 flex flex-col items-center justify-center relative">
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-blue-500/30 rounded-full blur-[50px] -z-10"></div>
        <div class="relative transition-transform duration-300 hover:scale-105">
          <img src="/logobaco.png" alt="Logo BACO" class="relative w-36 h-auto object-contain drop-shadow-2xl">
        </div>
        <h2 class="text-blue-200/70 text-[10px] tracking-[0.3em] uppercase mt-6 font-bold">Portail Interne</h2>
      </div>
      
      <form on:submit|preventDefault={handleLogin} class="space-y-7">
        
        <div class="space-y-1 group/input">
          <label for="email" class="sr-only">Email</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <Mail class="w-5 h-5 text-gray-400 group-focus-within/input:text-blue-300 transition-colors duration-300" />
            </div>
            <input 
              type="email" 
              id="email" 
              bind:value={email}
              required
              class="w-full bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-2xl py-3.5 pl-14 pr-4 
                     focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent focus:bg-white/10
                     placeholder-gray-500 transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]" 
              placeholder="votre@email.com"
            >
          </div>
        </div>
        
        <div class="space-y-1 group/input">
          <label for="password" class="sr-only">Mot de passe</label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <Lock class="w-5 h-5 text-gray-400 group-focus-within/input:text-blue-300 transition-colors duration-300" />
            </div>
            <input 
              type="password" 
              id="password" 
              bind:value={password}
              required
              class="w-full bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-2xl py-3.5 pl-14 pr-4 
                     focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent focus:bg-white/10
                     placeholder-gray-500 transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]" 
              placeholder="••••••••••••"
            >
          </div>
        </div>
        
        <div class="min-h-[28px] text-sm text-center font-medium flex justify-center items-center">
          {#if errorMessage}
            <p class="text-red-300 bg-red-500/20 backdrop-blur-sm py-1.5 px-4 rounded-full border border-red-500/30 inline-flex items-center shadow-sm" in:scale={{duration:300, start:0.95}}>{errorMessage}</p>
          {:else if successMessage}
            <p class="text-green-300 bg-green-500/20 backdrop-blur-sm py-1.5 px-4 rounded-full border border-green-500/30 inline-flex items-center shadow-sm" in:scale={{duration:300, start:0.95}}>{successMessage}</p>
          {/if}
        </div>
        
        <button 
          type="submit" 
          disabled={loading}
          class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-3
                 transition-all duration-300 transform active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(37,99,235,0.5)] hover:shadow-[0_15px_35px_-5px_rgba(37,99,235,0.6)]
                 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none group/btn relative overflow-hidden"
        >
          <div class="absolute inset-0 h-full w-1/2 bg-white/20 skew-x-12 -translate-x-[150%] group-hover/btn:animate-shimmer z-0"></div>

          <div class="relative z-10 flex items-center gap-2">
              {#if loading}
              <Loader2 class="w-5 h-5 animate-spin" />
              <span>Connexion en cours...</span>
              {:else}
              <span class="tracking-wide">Se connecter</span>
              <ArrowRight class="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
              {/if}
          </div>
        </button>
        
        <div class="text-center mt-4">
          <button 
            type="button" 
            on:click={handleResetPassword}
            class="text-xs text-blue-300/70 hover:text-blue-200 transition-colors focus:outline-none hover:underline underline-offset-4"
          >
            Mot de passe oublié ?
          </button>
        </div>

      </form>
    </div>
    
    <div class="absolute bottom-6 text-center w-full text-blue-200/40 text-[10px] font-medium tracking-widest uppercase">
      &copy; {new Date().getFullYear()} BACO. Tous droits réservés.
    </div>

  </div>
{/if}

<style>
    /* Nécessaire si tu n'as pas configuré cette animation dans tailwind.config.cjs */
    @keyframes shimmer {
        from { transform: translateX(-150%) skewX(12deg); }
        to { transform: translateX(250%) skewX(12deg); }
    }
    .animate-shimmer {
        animation: shimmer 1.5s infinite;
    }
    /* Animation de pulsation plus lente pour le fond */
    .animate-pulse-slow {
        animation: pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
</style>