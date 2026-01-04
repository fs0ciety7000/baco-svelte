<script>
    import { currentThemeId } from '$lib/stores/theme';
    import { fade } from 'svelte/transition';
</script>

<div class="fixed inset-0 pointer-events-none z-[1] overflow-hidden select-none">
    
    {#if $currentThemeId === 'christmas'}
        <div transition:fade>
            {#each Array(50) as _, i}
                <div class="snowflake" style="--delay: {Math.random() * 5}s; --left: {Math.random() * 100}%; --duration: {5 + Math.random() * 5}s; --size: {Math.random() * 5 + 2}px;"></div>
            {/each}
            
            <div class="absolute top-0 w-full h-10">
                <div class="glass-elf left-[15%]" style="--delay: 0s; --tint: rgba(50, 205, 50, 0.2);">
                    <div class="elf-pompon"></div><div class="elf-hat"></div><div class="elf-head"><div class="elf-eyes"></div></div>
                </div>
                <div class="glass-elf right-[15%]" style="--delay: 2.5s; --tint: rgba(220, 20, 60, 0.2);">
                    <div class="elf-pompon"></div><div class="elf-hat"></div><div class="elf-head"><div class="elf-eyes"></div></div>
                </div>
            </div>
        </div>
    {/if}

    {#if $currentThemeId === 'halloween'}
        <div transition:fade>
            <div class="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-purple-900/20 to-transparent fog-anim"></div>
            
            {#each Array(8) as _, i}
                <div class="bat" style="--left: {Math.random() * 100}%; --delay: {Math.random() * 10}s; --scale: {0.5 + Math.random() * 0.5}">
                    <svg viewBox="0 0 100 50" class="w-12 h-6 fill-black/60 drop-shadow-[0_0_5px_rgba(255,165,0,0.4)]">
                        <path d="M50 25 C 20 25 20 0 0 20 C 20 30 20 50 50 40 C 80 50 80 30 100 20 C 80 0 80 25 50 25 z" />
                    </svg>
                </div>
            {/each}

            <div class="absolute top-0 right-0 w-64 h-64 opacity-30">
                <svg viewBox="0 0 100 100" class="stroke-gray-500 fill-none stroke-[0.5]">
                    <path d="M100 0 L0 100 M100 50 L50 100 M50 0 L100 100 M0 0 L100 0 L100 100" />
                    <path d="M90 10 Q95 5 100 10 M80 20 Q90 10 100 20 M70 30 Q85 15 100 30" />
                </svg>
                <div class="spider-container">
                    <div class="thread"></div>
                    <div class="spider">🕷️</div>
                </div>
            </div>
        </div>
    {/if}

    {#if $currentThemeId === 'easter'}
        <div transition:fade>
            {#each Array(30) as _, i}
                <div class="petal" 
                     style="
                        --left: {Math.random() * 100}%; 
                        --delay: {Math.random() * 10}s;
                        --color: {['#FFB7B2', '#B5EAD7', '#E2F0CB', '#FFDAC1'][Math.floor(Math.random() * 4)]}
                     ">
                </div>
            {/each}
            
            <div class="hidden-egg absolute bottom-10 right-20 text-4xl opacity-80 hover:scale-110 transition-transform cursor-pointer" title="Joyeuses Pâques !">
                🥚
            </div>
        </div>
    {/if}
</div>

<style>
    /* --- NOËL (Adapté de votre Nav) --- */
    .snowflake { position: absolute; top: -10px; left: var(--left); background: white; border-radius: 50%; opacity: 0.5; width: var(--size); height: var(--size); animation: fall var(--duration) linear infinite; animation-delay: var(--delay); }
    @keyframes fall { to { transform: translateY(110vh) translateX(20px); opacity: 0; } }
    
    .glass-elf { position: absolute; display: flex; flex-direction: column; align-items: center; animation: peek 8s ease-in-out infinite; animation-delay: var(--delay); opacity: 0; }
    .elf-hat { width: 30px; height: 25px; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); background: var(--tint); backdrop-filter: blur(4px); }
    .elf-head { width: 24px; height: 24px; background: rgba(255,255,255,0.1); border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); }
    .elf-eyes { display: flex; gap: 4px; margin-top: 8px; justify-content: center; }
    .elf-eyes::before, .elf-eyes::after { content: ''; width: 3px; height: 3px; background: white; border-radius: 50%; }
    @keyframes peek { 0%, 100% { transform: translateY(10px); opacity: 0; } 10%, 25% { transform: translateY(-35px); opacity: 1; } }

    /* --- HALLOWEEN --- */
    .fog-anim { animation: fogPulse 8s infinite alternate ease-in-out; }
    @keyframes fogPulse { from { opacity: 0.2; transform: scaleY(1); } to { opacity: 0.5; transform: scaleY(1.2); } }

    .bat { position: absolute; top: 10%; left: var(--left); transform: scale(var(--scale)); animation: batFly 15s linear infinite; animation-delay: var(--delay); opacity: 0; }
    @keyframes batFly { 
        0% { transform: translateX(0) translateY(0) scale(var(--scale)) rotate(0deg); opacity: 0; }
        10% { opacity: 0.8; }
        90% { opacity: 0.8; }
        100% { transform: translateX(-50vw) translateY(20vh) scale(var(--scale)) rotate(-10deg); opacity: 0; }
    }

    .spider-container { position: absolute; top: 0; right: 20%; animation: spiderDrop 10s ease-in-out infinite; }
    .spider-container .thread { width: 1px; height: 100px; background: rgba(255,255,255,0.2); margin: 0 auto; }
    .spider-container .spider { font-size: 20px; margin-top: -5px; filter: drop-shadow(0 0 5px red); }
    @keyframes spiderDrop { 0%, 100% { transform: translateY(-50px); } 50% { transform: translateY(0); } }

    /* --- PÂQUES --- */
    .petal { 
        position: absolute; top: -10px; left: var(--left); 
        width: 15px; height: 15px; 
        background: var(--color); 
        border-radius: 10px 0 10px 0; 
        opacity: 0.6; 
        animation: petalFall 12s linear infinite; 
        animation-delay: var(--delay); 
    }
    @keyframes petalFall { 
        0% { transform: translateY(-10px) rotate(0deg); opacity: 0; }
        10% { opacity: 0.8; }
        100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
    }
    
    .hidden-egg { animation: eggBounce 2s infinite; }
    @keyframes eggBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
</style>