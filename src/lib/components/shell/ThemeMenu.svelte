<script>
	import { Popover } from 'bits-ui';
	import { Palette, Check, Monitor, Rows3, Rows4 } from 'lucide-svelte';
	import {
		THEMES,
		AUTO_THEME,
		currentThemeId,
		applyTheme,
		density,
		applyDensity
	} from '$lib/stores/theme';
	import { supabase } from '$lib/supabase';

	/** @type {{ userId?: string }} */
	let { userId } = $props();

	/** @param {string} id */
	async function choose(id) {
		applyTheme(id);
		// Préférence suivie d'un poste à l'autre
		if (userId) await supabase.from('profiles').update({ theme: id }).eq('id', userId);
	}
</script>

<Popover.Root>
	<Popover.Trigger class="csm-icon-btn" aria-label="Apparence">
		<Palette class="size-[18px]" strokeWidth={1.75} />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			sideOffset={8}
			align="end"
			class="csm-pop z-[80] w-72 rounded-lg border border-line bg-surface p-2 shadow-e3"
		>
			<p class="px-2 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.08em] text-subtle uppercase">
				Thème
			</p>
			<div class="space-y-0.5">
				<button
					type="button"
					class="csm-menu-item w-full"
					aria-pressed={$currentThemeId === AUTO_THEME}
					onclick={() => choose(AUTO_THEME)}
				>
					<Monitor class="size-4 text-subtle" strokeWidth={1.75} />
					<span class="flex-1 text-left">
						<span class="block text-fg">Automatique</span>
						<span class="block text-xs text-muted">Suit le réglage clair/sombre du système</span>
					</span>
					{#if $currentThemeId === AUTO_THEME}<Check class="size-4 text-accent" />{/if}
				</button>
				{#each THEMES as theme (theme.id)}
					<button
						type="button"
						class="csm-menu-item w-full"
						aria-pressed={$currentThemeId === theme.id}
						onclick={() => choose(theme.id)}
					>
						<span
							class="grid size-6 shrink-0 place-items-center overflow-hidden rounded-md border border-line"
							style:background={theme.swatch[0]}
							aria-hidden="true"
						>
							<span class="size-2.5 rounded-full" style:background={theme.swatch[2]}></span>
						</span>
						<span class="flex-1 text-left">
							<span class="block text-fg">{theme.name}</span>
							<span class="block text-xs text-muted">{theme.description}</span>
						</span>
						{#if $currentThemeId === theme.id}<Check class="size-4 text-accent" />{/if}
					</button>
				{/each}
			</div>

			<div class="my-2 h-px bg-line"></div>
			<p class="px-2 pb-2 text-[10.5px] font-semibold tracking-[0.08em] text-subtle uppercase">
				Densité
			</p>
			<div class="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1">
				{#each [{ id: 'comfortable', label: 'Confort', icon: Rows3 }, { id: 'compact', label: 'Compacte', icon: Rows4 }] as d (d.id)}
					<button
						type="button"
						onclick={() => applyDensity(/** @type {any} */ (d.id))}
						aria-pressed={$density === d.id}
						class="flex h-8 items-center justify-center gap-2 rounded text-[13px] transition-colors {$density ===
						d.id
							? 'bg-surface text-fg shadow-e1'
							: 'text-muted hover:text-fg'}"
					>
						<d.icon class="size-4" strokeWidth={1.75} />{d.label}
					</button>
				{/each}
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
