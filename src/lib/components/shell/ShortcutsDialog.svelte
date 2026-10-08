<script>
	import { Dialog } from 'bits-ui';
	import { X } from 'lucide-svelte';
	import { NAVIGATION } from '$lib/navigation';

	/** @type {{ open?: boolean }} */
	let { open = $bindable(false) } = $props();

	const goShortcuts = NAVIGATION.flatMap((g) => g.items).filter((i) => i.shortcut);
	const GENERAL = [
		{ keys: ['Ctrl', 'K'], label: 'Palette de commandes / recherche' },
		{ keys: ['/'], label: 'Rechercher' },
		{ keys: ['N'], label: 'Nouveau bon de commande bus' },
		{ keys: ['['], label: 'Replier / déplier la barre latérale' },
		{ keys: ['?'], label: 'Afficher cette aide' }
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="csm-overlay fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px]" />
		<Dialog.Content
			class="csm-pop fixed top-1/2 left-1/2 z-[100] max-h-[85dvh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-e3"
		>
			<div class="mb-4 flex items-center justify-between">
				<Dialog.Title class="text-base font-semibold text-fg">Raccourcis clavier</Dialog.Title>
				<Dialog.Close class="csm-icon-btn" aria-label="Fermer"><X class="size-4" /></Dialog.Close>
			</div>
			<div class="grid gap-6 sm:grid-cols-2">
				<section>
					<h3 class="mb-2 text-[10.5px] font-semibold tracking-[0.08em] text-subtle uppercase">
						Général
					</h3>
					<ul class="space-y-2">
						{#each GENERAL as s (s.label)}
							<li class="flex items-center justify-between gap-3 text-[13px] text-muted">
								{s.label}
								<span class="flex gap-1"
									>{#each s.keys as k (k)}<kbd>{k}</kbd>{/each}</span
								>
							</li>
						{/each}
					</ul>
				</section>
				<section>
					<h3 class="mb-2 text-[10.5px] font-semibold tracking-[0.08em] text-subtle uppercase">
						Aller à (G puis…)
					</h3>
					<ul class="space-y-2">
						{#each goShortcuts as s (s.href)}
							<li class="flex items-center justify-between gap-3 text-[13px] text-muted">
								{s.label}
								<span class="flex gap-1"><kbd>G</kbd><kbd>{s.shortcut?.toUpperCase()}</kbd></span>
							</li>
						{/each}
					</ul>
				</section>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
