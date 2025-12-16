<script>
    import { createEventDispatcher } from 'svelte';
    import { Target } from 'lucide-svelte';

    export let disabled = false;

    const dispatch = createEventDispatcher();
    
    // Segments par ordre (de la petite zone au centre jusqu'au Single)
    const ZONES = [
        // { radius: 16, segment: 50, type: 'Bull' },
        // ... (Trop complexe à modéliser sans une librairie de dessin)
        // Simplification: Nous allons utiliser des zones cliquables simplifiées
    ];

    // Simuler des zones cliquables (pour l'intention de l'utilisateur)
    const clickZones = [
        { name: 'Bullseye (50)', score: 50, type: 'Bull', x: 250, y: 250, r: 25, color: '#FF0000' },
        { name: 'Double 20', score: 20, type: 'Double', x: 250, y: 25, r: 15, color: '#FFD700' },
        { name: 'Triple 20', score: 20, type: 'Triple', x: 250, y: 100, r: 10, color: '#00FF00' },
        { name: 'Single 1', score: 1, type: 'Single', x: 300, y: 30, r: 15, color: '#FFFFFF' },
        // Ajoutons quelques segments pour la démonstration
        { name: 'Single 18', score: 18, type: 'Single', x: 200, y: 30, r: 15, color: '#000000' },
    ];
    
    // Fonction appelée par le click sur une zone simulée
    function handleDartThrow(score, type) {
        if (!disabled) {
            dispatch('throw', { segment: score, type });
        }
    }
</script>

<div class="flex flex-col items-center justify-center p-4">
    <h3 class="text-lg font-semibold mb-2 dark:text-gray-300">Cliquez sur une zone pour simuler le tir (Basé sur le segment visé)</h3>
    <svg viewBox="0 0 500 500" class="w-full max-w-xl h-auto border-4 border-gray-600 rounded-full bg-gray-100 dark:bg-gray-900 shadow-2xl transition-opacity duration-300" 
         class:opacity-50={disabled}
         class:cursor-not-allowed={disabled}>
        
        <circle cx="250" cy="250" r="240" fill="#222" stroke="#444" stroke-width="5"/>
        <circle cx="250" cy="250" r="16" fill="red" />
        <circle cx="250" cy="250" r="32" fill="green" />

        {#each Array(20) as _, i}
            <g transform="rotate({i * 18 + 9}, 250, 250)">
                <path 
                    d="M 250 240 L 250 480 A 240 240 0 0 1 250 240 Z" 
                    fill={i % 2 === 0 ? '#F0E68C' : '#101010'} 
                    transform="rotate({i * 18 - 9}, 250, 250)"
                />
            </g>
        {/each}

        <circle cx="250" cy="250" r="108" fill="none" stroke="#222" stroke-width="10"/>
        <circle cx="250" cy="250" r="120" fill="none" stroke="#222" stroke-width="10"/>
        <circle cx="250" cy="250" r="228" fill="none" stroke="#222" stroke-width="10"/>
        <circle cx="250" cy="250" r="240" fill="none" stroke="#222" stroke-width="10"/>
        
        {#each clickZones as zone}
            <circle 
                cx={zone.x} 
                cy={zone.y} 
                r={zone.r} 
                fill={zone.color} 
                opacity="0.2" 
                stroke="#FFF"
                stroke-width="1"
                on:click={() => handleDartThrow(zone.score, zone.type)}
                class="hover:opacity-100 cursor-pointer transition-opacity duration-100"
                class:pointer-events-none={disabled}
            >
                <title>Vise: {zone.name} (Score: {zone.score})</title>
            </circle>
        {/each}
        
        <text x="250" y="250" text-anchor="middle" fill="#FFF" font-size="20" dy=".3em">CIBLE</text>
        <text x="250" y="280" text-anchor="middle" fill="#FFF" font-size="12" dy=".3em">CLIQUEZ</text>

    </svg>
    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400 italic">
        *Attention : Cliquer simule votre intention. Le résultat réel dépend de la difficulté sélectionnée.
    </p>
</div>