<script>
	import { Popover } from 'bits-ui';
	import { Bell, BellOff } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { usePolling } from '$lib/utils/poller';

	/** @type {{ userId: string }} */
	let { userId } = $props();

	/** @type {any[]} */
	let items = $state([]);
	let unread = $state(0);
	let open = $state(false);

	async function load() {
		const [{ data }, { count }] = await Promise.all([
			supabase
				.from('notifications')
				.select('id, title, message, is_read, created_at')
				.eq('user_id_target', userId)
				.order('is_read', { ascending: true })
				.order('created_at', { ascending: false })
				.limit(8),
			supabase
				.from('notifications')
				.select('id', { count: 'exact', head: true })
				.eq('user_id_target', userId)
				.eq('is_read', false)
		]);
		items = data ?? [];
		unread = count ?? 0;
	}

	async function markRead() {
		const ids = items.filter((n) => !n.is_read).map((n) => n.id);
		if (!ids.length) return;
		await supabase.from('notifications').update({ is_read: true }).in('id', ids);
		items = items.map((n) => ({ ...n, is_read: true }));
		unread = 0;
	}

	$effect(() => {
		if (open && unread > 0) {
			const t = setTimeout(markRead, 1200);
			return () => clearTimeout(t);
		}
	});

	const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
	/** @param {string} iso */
	function ago(iso) {
		const diff = (new Date(iso).getTime() - Date.now()) / 1000;
		const steps = /** @type {const} */ ([
			['second', 60],
			['minute', 60],
			['hour', 24],
			['day', 7],
			['week', 4.35],
			['month', 12]
		]);
		let value = diff;
		for (const [unit, size] of steps) {
			if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
			value /= size;
		}
		return rtf.format(Math.round(value), 'year');
	}

	// Rafraîchi toutes les 60 s, en pause quand l'onglet est masqué.
	usePolling(load, 60_000);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="csm-icon-btn relative"
		aria-label={unread ? `Notifications (${unread} non lues)` : 'Notifications'}
	>
		<Bell class="size-[18px]" strokeWidth={1.75} />
		{#if unread > 0}
			<span
				class="tabular absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white"
				>{unread > 9 ? '9+' : unread}</span
			>
		{/if}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			sideOffset={8}
			align="end"
			class="csm-pop z-[80] w-[min(360px,calc(100vw-1rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-e3"
		>
			<div class="flex items-center justify-between border-b border-line px-4 py-3">
				<p class="text-sm font-semibold text-fg">Notifications</p>
				{#if unread}<span class="text-xs text-muted">{unread} non lue{unread > 1 ? 's' : ''}</span
					>{/if}
			</div>
			<div class="max-h-80 overflow-y-auto">
				{#each items as n (n.id)}
					<div class="flex gap-3 border-b border-line/60 px-4 py-3 last:border-0">
						<span
							class="mt-1.5 size-2 shrink-0 rounded-full {n.is_read
								? 'bg-transparent'
								: 'bg-accent'}"
							aria-hidden="true"
						></span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[13px] font-medium text-fg">{n.title}</p>
							<p class="line-clamp-2 text-xs text-muted">{n.message}</p>
							<p class="mt-1 text-[11px] text-subtle">{ago(n.created_at)}</p>
						</div>
					</div>
				{:else}
					<div class="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
						<BellOff class="size-6 text-subtle" strokeWidth={1.5} />
						Rien de neuf pour l’instant.
					</div>
				{/each}
			</div>
			<a
				href="/notifications"
				onclick={() => (open = false)}
				class="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-accent hover:bg-surface-2"
				>Tout voir</a
			>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
