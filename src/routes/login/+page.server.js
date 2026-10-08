import { fail, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/redirect';

export const actions = {
	login: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const redirectTo = String(form.get('redirectTo') ?? '');

		if (!email || !password) {
			return fail(400, { email, error: 'Email et mot de passe requis.' });
		}

		const { data, error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error || !data.user) {
			return fail(400, { email, error: 'Email ou mot de passe incorrect.' });
		}

		const { data: profile } = await locals.supabase
			.from('profiles')
			.select('banned_until')
			.eq('id', data.user.id)
			.single();

		if (profile?.banned_until && new Date(profile.banned_until) > new Date()) {
			await locals.supabase.auth.signOut();
			return fail(403, { email, error: 'Ce compte est suspendu.' });
		}

		redirect(303, safeRedirect(redirectTo, url.origin));
	},

	reset: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { email, error: "Saisissez d'abord votre email." });

		await locals.supabase.auth.resetPasswordForEmail(email, {
			// Le modèle d'e-mail Supabase doit pointer vers /auth/callback?token_hash=…
			// (voir docs/DEPLOIEMENT.md) : supabase.co est bloqué sur le réseau de l'entreprise.
			redirectTo: `${url.origin}/auth/callback?next=/profil`
		});
		// Réponse identique que le compte existe ou non (pas d'énumération d'emails).
		return { email, success: 'Si ce compte existe, un email de réinitialisation a été envoyé.' };
	}
};
