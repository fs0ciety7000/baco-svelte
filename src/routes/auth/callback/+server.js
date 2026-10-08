import { redirect } from '@sveltejs/kit';

/** Retour des liens e-mail Supabase (réinitialisation de mot de passe, PKCE). */
export async function GET({ url, locals }) {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/accueil';
	const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/accueil';

	if (code) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) redirect(303, safeNext);
	}
	redirect(303, '/login?error=lien');
}
