<script>
	/** Monogramme CSM : un tracé de voie reliant deux arrêts. */
	let { size = 28, withText = false, class: klass = '' } = $props();
</script>

<span class="inline-flex items-center gap-2.5 {klass}">
	<svg
		width={size}
		height={size}
		viewBox="0 0 32 32"
		fill="none"
		aria-hidden={withText ? 'true' : undefined}
		role={withText ? undefined : 'img'}
		aria-label={withText ? undefined : 'CSM'}
	>
		<rect width="32" height="32" rx="9" fill="var(--accent)" />
		<path
			d="M22 9.5h-7.5a4.5 4.5 0 0 0 0 9h3a4.5 4.5 0 0 1 0 9H10"
			stroke="var(--accent-ink)"
			stroke-width="2.6"
			stroke-linecap="round"
			transform="translate(0 -2.5)"
		/>
		<circle cx="22.5" cy="7" r="2.4" fill="var(--accent-ink)" />
		<circle cx="9.5" cy="25" r="2.4" fill="var(--accent-ink)" />
	</svg>
	{#if withText}
		<span class="flex flex-col leading-none">
			<span class="font-display text-[15px] font-semibold tracking-tight text-fg">CSM</span>
			<span class="mt-0.5 text-[10px] font-medium tracking-wide text-subtle uppercase">
				Client Solutions
			</span>
		</span>
	{/if}
</span>
