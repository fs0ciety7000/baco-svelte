<script>
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Mail, Lock, LogIn, Loader2 } from 'lucide-svelte';
	import { APP_NAME, APP_FULL_NAME } from '$lib/config';

	let { form } = $props();
	let submitting = $state(false);

	const banned = $derived(page.url.searchParams.get('banned') === '1');
	const linkError = $derived(page.url.searchParams.get('error') === 'lien');

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		submitting = true;
		return async ({ update }) => {
			await update({ reset: false });
			submitting = false;
		};
	};
</script>

<svelte:head>
	<title>Connexion · {APP_NAME}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
		<div class="mb-8 text-center">
			<p class="text-3xl font-bold tracking-tight">{APP_NAME}</p>
			<p class="mt-1 text-sm opacity-60">{APP_FULL_NAME}</p>
		</div>

		{#if banned}
			<p class="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400" role="alert">
				Ce compte est suspendu.
			</p>
		{/if}
		{#if linkError}
			<p class="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400" role="alert">
				Lien invalide ou expiré. Recommencez la réinitialisation.
			</p>
		{/if}
		{#if form?.error}
			<p class="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400" role="alert">
				{form.error}
			</p>
		{/if}
		{#if form?.success}
			<p class="mb-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400" role="status">
				{form.success}
			</p>
		{/if}

		<form method="POST" action="?/login" use:enhance={submit} class="space-y-4">
			<label class="block">
				<span class="mb-1 block text-xs font-medium opacity-70">Email</span>
				<span class="relative block">
					<Mail
						class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50"
					/>
					<input
						name="email"
						type="email"
						autocomplete="username"
						required
						value={form?.email ?? ''}
						class="w-full rounded-lg border border-white/10 bg-black/20 py-2.5 pr-3 pl-9 text-sm outline-none focus:border-blue-400"
					/>
				</span>
			</label>
			<label class="block">
				<span class="mb-1 block text-xs font-medium opacity-70">Mot de passe</span>
				<span class="relative block">
					<Lock
						class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50"
					/>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						class="w-full rounded-lg border border-white/10 bg-black/20 py-2.5 pr-3 pl-9 text-sm outline-none focus:border-blue-400"
					/>
				</span>
			</label>

			<button
				type="submit"
				disabled={submitting}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
			>
				{#if submitting}<Loader2 class="h-4 w-4 animate-spin" />{:else}<LogIn
						class="h-4 w-4"
					/>{/if}
				Se connecter
			</button>
			<button
				formaction="?/reset"
				formnovalidate
				class="w-full text-center text-xs opacity-60 hover:opacity-100"
			>
				Mot de passe oublié ?
			</button>
		</form>
	</div>
</div>
