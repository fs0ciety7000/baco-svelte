<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { supabase } from '$lib/supabase';

    let lines = $state([]);
    let currentLine = $state(0);
    let showCursor = $state(true);
    let glitchActive = $state(false);
    let matrixChars = $state([]);

    const terminalLines = [
        { text: '> Initializing system check...', delay: 0 },
        { text: '> Connecting to BACO mainframe...', delay: 800 },
        { text: '> ERROR: Service temporarily unavailable', delay: 1600, class: 'text-red-500' },
        { text: '> Running diagnostics...', delay: 2400 },
        { text: '> [################] 100%', delay: 3200 },
        { text: '> Status: MAINTENANCE MODE ACTIVE', delay: 4000, class: 'text-yellow-500' },
        { text: '', delay: 4800 },
        { text: '═══════════════════════════════════════════════════════', delay: 5000, class: 'text-gray-600' },
        { text: '', delay: 5200 },
        { text: "  ████████╗██╗  ██╗ █████╗ ████████╗███████╗", delay: 5400, class: 'text-orange-500 text-xs md:text-sm' },
        { text: "  ╚══██╔══╝██║  ██║██╔══██╗╚══██╔══╝██╔════╝", delay: 5500, class: 'text-orange-500 text-xs md:text-sm' },
        { text: "     ██║   ███████║███████║   ██║   ███████╗", delay: 5600, class: 'text-orange-500 text-xs md:text-sm' },
        { text: "     ██║   ██╔══██║██╔══██║   ██║   ╚════██║", delay: 5700, class: 'text-orange-500 text-xs md:text-sm' },
        { text: "     ██║   ██║  ██║██║  ██║   ██║   ███████║", delay: 5800, class: 'text-orange-500 text-xs md:text-sm' },
        { text: "     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝", delay: 5900, class: 'text-orange-500 text-xs md:text-sm' },
        { text: '', delay: 6000 },
        { text: "   █████╗ ██╗     ██╗         ███████╗ ██████╗ ██╗     ██╗  ██╗███████╗██╗", delay: 6100, class: 'text-orange-400 text-xs md:text-sm' },
        { text: "  ██╔══██╗██║     ██║         ██╔════╝██╔═══██╗██║     ██║ ██╔╝██╔════╝██║", delay: 6200, class: 'text-orange-400 text-xs md:text-sm' },
        { text: "  ███████║██║     ██║         █████╗  ██║   ██║██║     █████╔╝ ███████╗██║", delay: 6300, class: 'text-orange-400 text-xs md:text-sm' },
        { text: "  ██╔══██║██║     ██║         ██╔══╝  ██║   ██║██║     ██╔═██╗ ╚════██║╚═╝", delay: 6400, class: 'text-orange-400 text-xs md:text-sm' },
        { text: "  ██║  ██║███████╗███████╗    ██║     ╚██████╔╝███████╗██║  ██╗███████║██╗", delay: 6500, class: 'text-orange-400 text-xs md:text-sm' },
        { text: "  ╚═╝  ╚═╝╚══════╝╚══════╝    ╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝", delay: 6600, class: 'text-orange-400 text-xs md:text-sm' },
        { text: '', delay: 6800 },
        { text: '═══════════════════════════════════════════════════════', delay: 7000, class: 'text-gray-600' },
        { text: '', delay: 7200 },
        { text: '> Le système est actuellement en maintenance.', delay: 7400 },
        { text: '> Nos équipes travaillent pour rétablir le service.', delay: 8000 },
        { text: '', delay: 8600 },
        { text: '> Merci de votre patience, cher opérateur.', delay: 9200, class: 'text-green-500' },
        { text: '', delay: 9800 },
        { text: '> _', delay: 10400, class: 'animate-pulse' }
    ];

    onMount(() => {
        // Vérifier si maintenance est toujours active
        checkMaintenanceStatus();

        // Animation du curseur
        const cursorInterval = setInterval(() => {
            showCursor = !showCursor;
        }, 530);

        // Animation des lignes du terminal
        terminalLines.forEach((line, index) => {
            setTimeout(() => {
                lines = [...lines, line];
            }, line.delay);
        });

        // Effet glitch aléatoire
        const glitchInterval = setInterval(() => {
            if (Math.random() > 0.7) {
                glitchActive = true;
                setTimeout(() => glitchActive = false, 150);
            }
        }, 3000);

        // Générer les caractères matrix en arrière-plan
        generateMatrixChars();
        const matrixInterval = setInterval(generateMatrixChars, 100);

        return () => {
            clearInterval(cursorInterval);
            clearInterval(glitchInterval);
            clearInterval(matrixInterval);
        };
    });

    async function checkMaintenanceStatus() {
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'maintenance_mode')
                .single();

            // Si maintenance désactivée, retourner à l'accueil
            if (data?.value !== 'true' && data?.value !== true) {
                goto('/accueil');
            }
        } catch (e) {
            // En cas d'erreur, rester sur la page
        }
    }

    function generateMatrixChars() {
        const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        const newChars = [];
        for (let i = 0; i < 50; i++) {
            newChars.push({
                char: chars[Math.floor(Math.random() * chars.length)],
                x: Math.random() * 100,
                y: Math.random() * 100,
                opacity: Math.random() * 0.3,
                size: Math.random() * 14 + 8
            });
        }
        matrixChars = newChars;
    }
</script>

<svelte:head>
    <title>Maintenance | BACO</title>
</svelte:head>

<div class="min-h-screen bg-black overflow-hidden relative {glitchActive ? 'glitch' : ''}">
    <!-- Matrix rain background -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
        {#each matrixChars as char}
            <span
                class="absolute text-green-500 font-mono transition-all duration-100"
                style="left: {char.x}%; top: {char.y}%; opacity: {char.opacity}; font-size: {char.size}px;"
            >
                {char.char}
            </span>
        {/each}
    </div>

    <!-- Scanlines overlay -->
    <div class="absolute inset-0 pointer-events-none scanlines"></div>

    <!-- CRT glow effect -->
    <div class="absolute inset-0 pointer-events-none crt-glow"></div>

    <!-- Terminal window -->
    <div class="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div class="w-full max-w-4xl">
            <!-- Terminal header -->
            <div class="bg-gray-900 border border-green-900 rounded-t-lg px-4 py-2 flex items-center gap-2">
                <div class="flex gap-2">
                    <div class="w-3 h-3 rounded-full bg-red-500"></div>
                    <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div class="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <span class="text-green-500 text-sm font-mono ml-4">baco@mainframe:~$ maintenance.sh</span>
            </div>

            <!-- Terminal body -->
            <div class="bg-black/90 border border-green-900 border-t-0 rounded-b-lg p-6 font-mono text-sm md:text-base min-h-[500px] overflow-hidden">
                <div class="space-y-1">
                    {#each lines as line, i}
                        <div class="flex">
                            <span class="{line.class || 'text-green-500'} whitespace-pre leading-relaxed">
                                {line.text}
                            </span>
                            {#if i === lines.length - 1 && showCursor}
                                <span class="text-green-500 animate-pulse">█</span>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Footer info -->
            <div class="mt-4 text-center">
                <p class="text-green-900 text-xs font-mono">
                    BACO SYSTEM v2.0 | Secure Connection | {new Date().toLocaleString('fr-BE')}
                </p>
            </div>
        </div>
    </div>

    <!-- Looney Tunes circles (Easter egg) -->
    <div class="absolute bottom-8 right-8 opacity-10 hover:opacity-30 transition-opacity">
        <div class="relative w-32 h-32">
            <div class="absolute inset-0 rounded-full border-4 border-red-500"></div>
            <div class="absolute inset-2 rounded-full border-4 border-orange-500"></div>
            <div class="absolute inset-4 rounded-full border-4 border-yellow-500"></div>
            <div class="absolute inset-6 rounded-full border-4 border-green-500"></div>
            <div class="absolute inset-8 rounded-full border-4 border-blue-500"></div>
        </div>
    </div>
</div>

<style>
    .scanlines {
        background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.15),
            rgba(0, 0, 0, 0.15) 1px,
            transparent 1px,
            transparent 2px
        );
    }

    .crt-glow {
        box-shadow: inset 0 0 100px rgba(0, 255, 0, 0.05);
    }

    .glitch {
        animation: glitch 0.15s infinite;
    }

    @keyframes glitch {
        0% {
            transform: translate(0);
            filter: hue-rotate(0deg);
        }
        20% {
            transform: translate(-2px, 2px);
            filter: hue-rotate(90deg);
        }
        40% {
            transform: translate(-2px, -2px);
            filter: hue-rotate(180deg);
        }
        60% {
            transform: translate(2px, 2px);
            filter: hue-rotate(270deg);
        }
        80% {
            transform: translate(2px, -2px);
            filter: hue-rotate(360deg);
        }
        100% {
            transform: translate(0);
            filter: hue-rotate(0deg);
        }
    }

    /* Animation du texte typing */
    @keyframes typing {
        from { width: 0; }
        to { width: 100%; }
    }
</style>
