<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';

    // Code secret : ↑ ↑ ↓ ↓ ← → ← → B A (Konami Code)
    const SECRET_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

    // Alternative : taper "BACO" rapidement
    const SECRET_WORD = 'baco';

    let inputSequence = $state([]);
    let wordBuffer = $state('');
    let wordTimeout;
    let showHint = $state(false);
    let attempts = $state(0);

    onMount(() => {
        // Vérifier si déjà authentifié via le gate
        if (browser) {
            const gatePass = localStorage.getItem('baco_gate_pass');
            if (gatePass && isValidGatePass(gatePass)) {
                goto('/');
            }
        }

        function handleKeyDown(e) {
            // Konami code detection
            inputSequence = [...inputSequence, e.key].slice(-SECRET_CODE.length);

            if (JSON.stringify(inputSequence) === JSON.stringify(SECRET_CODE)) {
                unlockGate();
                return;
            }

            // Word detection (BACO)
            clearTimeout(wordTimeout);
            wordBuffer += e.key.toLowerCase();

            if (wordBuffer.includes(SECRET_WORD)) {
                unlockGate();
                return;
            }

            // Reset word buffer after 2 seconds of inactivity
            wordTimeout = setTimeout(() => {
                wordBuffer = '';
            }, 2000);

            // Easter egg : après 10 tentatives, montrer un indice subtil
            attempts++;
            if (attempts > 20 && !showHint) {
                showHint = true;
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            clearTimeout(wordTimeout);
        };
    });

    function isValidGatePass(pass) {
        // Le pass est valide pendant 30 jours
        try {
            const data = JSON.parse(atob(pass));
            return data.exp > Date.now();
        } catch {
            return false;
        }
    }

    function unlockGate() {
        // Créer un pass valide 30 jours
        const pass = btoa(JSON.stringify({
            ts: Date.now(),
            exp: Date.now() + (30 * 24 * 60 * 60 * 1000)
        }));

        if (browser) {
            // Stocker dans localStorage ET dans un cookie (pour le serveur)
            localStorage.setItem('baco_gate_pass', pass);

            // Cookie accessible côté serveur (30 jours)
            document.cookie = `baco_gate_pass=${pass}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
        }

        // Petit effet avant redirect
        document.body.classList.add('gate-unlock');
        setTimeout(() => goto('/'), 500);
    }

    // Génération de données aléatoires pour le faux contenu
    const fakeStats = [
        { label: 'Visitors', value: Math.floor(Math.random() * 10000) },
        { label: 'Countries', value: Math.floor(Math.random() * 50) + 10 },
        { label: 'Downloads', value: Math.floor(Math.random() * 5000) }
    ];
</script>

<svelte:head>
    <title>Coming Soon</title>
    <meta name="robots" content="noindex, nofollow">
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
    <div class="max-w-2xl w-full text-center">
        <!-- Fake Logo -->
        <div class="mb-8">
            <div class="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20">
                <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
        </div>

        <!-- Fake Title -->
        <h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
            Something Amazing
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Coming Soon</span>
        </h1>

        <p class="text-slate-400 text-lg mb-8 max-w-md mx-auto">
            We're working hard to bring you something extraordinary. Stay tuned for updates.
        </p>

        <!-- Fake Stats -->
        <div class="grid grid-cols-3 gap-4 mb-8">
            {#each fakeStats as stat}
                <div class="bg-white/5 rounded-xl p-4 backdrop-blur border border-white/10">
                    <div class="text-2xl font-bold text-white">{stat.value.toLocaleString()}</div>
                    <div class="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</div>
                </div>
            {/each}
        </div>

        <!-- Fake Email Signup -->
        <div class="bg-white/5 rounded-2xl p-6 backdrop-blur border border-white/10 mb-8">
            <p class="text-slate-300 text-sm mb-4">Get notified when we launch</p>
            <div class="flex gap-2">
                <input
                    type="email"
                    placeholder="Enter your email"
                    class="flex-grow bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    disabled
                >
                <button class="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors" disabled>
                    Notify Me
                </button>
            </div>
        </div>

        <!-- Fake Social Links -->
        <div class="flex justify-center gap-4 text-slate-500">
            <a href="#" class="hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
            </a>
            <a href="#" class="hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            </a>
        </div>

        <!-- Hint subtil (apparaît après plusieurs tentatives) -->
        {#if showHint}
            <p class="mt-12 text-slate-700 text-xs animate-pulse">
                "The code is in the name..."
            </p>
        {/if}

        <!-- Copyright fake -->
        <p class="mt-12 text-slate-600 text-xs">
            © 2024 Placeholder Inc. All rights reserved.
        </p>
    </div>
</div>

<style>
    :global(.gate-unlock) {
        animation: unlock 0.5s ease-out forwards;
    }

    @keyframes unlock {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.05); }
        100% { opacity: 0; transform: scale(1.1); }
    }
</style>
