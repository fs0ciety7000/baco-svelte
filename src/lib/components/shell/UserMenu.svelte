<script>
	import { DropdownMenu } from 'bits-ui';
	import { goto, invalidateAll } from '$app/navigation';
	import { UserRound, LogOut, Eye, Keyboard, Sparkles, Check, Palette } from 'lucide-svelte';
	import { THEMES, AUTO_THEME, currentThemeId, applyTheme } from '$lib/stores/theme';
	import { supabase } from '$lib/supabase';
	import { PREVIEW_ROLE_KEY, getPreviewRole } from '$lib/permissions';

	/** @type {{ profile: any, email?: string, onshortcuts?: () => void }} */
	let { profile, email, onshortcuts } = $props();

	const ROLE_LABELS = {
		admin: 'Administrateur',
		sysop: 'Sysop',
		moderator: 'Coordinateur',
		otto_agent: 'Agent Otto',
		user: 'Agent',
		reader: 'Lecteur'
	};
	const PREVIEW_ROLES = ['reader', 'user', 'otto_agent', 'moderator'];

	const name = $derived(profile?.full_name || profile?.username || email || 'Utilisateur');
	const initials = $derived(
		name
			.split(/[\s.@_-]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase())
			.join('')
	);
	const preview = getPreviewRole();

	/** @param {string | null} role */
	function setPreview(role) {
		if (role) sessionStorage.setItem(PREVIEW_ROLE_KEY, role);
		else sessionStorage.removeItem(PREVIEW_ROLE_KEY);
		location.reload();
	}

	async function logout() {
		await supabase.auth.signOut();
		await invalidateAll();
		goto('/login');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="flex h-9 items-center gap-2 rounded-md pr-2 pl-1 text-left transition-colors hover:bg-surface-2"
		aria-label="Menu utilisateur"
	>
		{#if profile?.avatar_url}
			<img
				src={profile.avatar_url}
				alt=""
				class="size-7 rounded-full border border-line object-cover"
			/>
		{:else}
			<span
				class="grid size-7 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg"
				>{initials}</span
			>
		{/if}
		<span class="hidden max-w-36 flex-col leading-tight lg:flex">
			<span class="truncate text-[13px] font-medium text-fg">{name}</span>
			<span class="truncate text-[11px] text-subtle"
				>{ROLE_LABELS[profile?.role] ?? profile?.role}</span
			>
		</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			sideOffset={8}
			align="end"
			class="csm-pop z-[80] w-60 rounded-lg border border-line bg-surface p-1.5 shadow-e3"
		>
			<div class="px-2.5 py-2">
				<p class="truncate text-sm font-medium text-fg">{name}</p>
				{#if email}<p class="truncate text-xs text-muted">{email}</p>{/if}
			</div>
			<DropdownMenu.Separator class="my-1 h-px bg-line" />
			<DropdownMenu.Item class="csm-menu-item" onSelect={() => goto('/profil')}>
				<UserRound class="size-4 text-subtle" strokeWidth={1.75} /> Mon profil
			</DropdownMenu.Item>
			<DropdownMenu.Item class="csm-menu-item" onSelect={() => onshortcuts?.()}>
				<Keyboard class="size-4 text-subtle" strokeWidth={1.75} /> Raccourcis clavier
				<kbd class="ml-auto">?</kbd>
			</DropdownMenu.Item>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger class="csm-menu-item sm:hidden">
					<Palette class="size-4 text-subtle" strokeWidth={1.75} /> Thème
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent
					sideOffset={6}
					class="csm-pop z-[85] w-48 rounded-lg border border-line bg-surface p-1.5 shadow-e3"
				>
					{#each [{ id: AUTO_THEME, name: 'Automatique' }, ...THEMES] as t (t.id)}
						<DropdownMenu.Item class="csm-menu-item" onSelect={() => applyTheme(t.id)}>
							{t.name}
							{#if $currentThemeId === t.id}<Check class="ml-auto size-4 text-accent" />{/if}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Item class="csm-menu-item" onSelect={() => goto('/changelog')}>
				<Sparkles class="size-4 text-subtle" strokeWidth={1.75} /> Nouveautés
			</DropdownMenu.Item>

			{#if profile?.role === 'sysop'}
				<DropdownMenu.Separator class="my-1 h-px bg-line" />
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger class="csm-menu-item">
						<Eye class="size-4 text-subtle" strokeWidth={1.75} /> Voir en tant que…
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent
						sideOffset={6}
						class="csm-pop z-[85] w-48 rounded-lg border border-line bg-surface p-1.5 shadow-e3"
					>
						{#each PREVIEW_ROLES as role (role)}
							<DropdownMenu.Item class="csm-menu-item" onSelect={() => setPreview(role)}>
								{ROLE_LABELS[role]}
								{#if preview === role}<Check class="ml-auto size-4 text-accent" />{/if}
							</DropdownMenu.Item>
						{/each}
						{#if preview}
							<DropdownMenu.Separator class="my-1 h-px bg-line" />
							<DropdownMenu.Item class="csm-menu-item" onSelect={() => setPreview(null)}>
								Quitter l’aperçu
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
			{/if}

			<DropdownMenu.Separator class="my-1 h-px bg-line" />
			<DropdownMenu.Item class="csm-menu-item text-danger" onSelect={logout}>
				<LogOut class="size-4" strokeWidth={1.75} /> Se déconnecter
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
