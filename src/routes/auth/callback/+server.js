import { redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/redirect';

/**
 * Retour des liens e-mail Supabase (réinitialisation de mot de passe, invitation).
 * - `token_hash` + `type` : modèle d'e-mail recommandé (aucun appel du navigateur à
 *   supabase.co, fonctionne même si le lien est ouvert dans un autre navigateur) ;
 * - `code` : flux PKCE par défaut (même navigateur que la demande).
 */
export async function GET({ url, locals }) {
	const next = safeRedirect(url.searchParams.get('next'), url.origin);
	const tokenHash = url.searchParams.get('token_hash');
	const type = /** @type {import('@supabase/supabase-js').EmailOtpType | null} */ (
		url.searchParams.get('type')
	);
	const code = url.searchParams.get('code');

	if (tokenHash && type) {
		const { error } = await locals.supabase.auth.verifyOtp({ token_hash: tokenHash, type });
		if (!error) redirect(303, next);
	} else if (code) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) redirect(303, next);
	}
	redirect(303, '/login?error=lien');
}
