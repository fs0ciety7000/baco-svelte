/**
 * Dépend de l'URL : relancé à chaque navigation, ce qui fait repasser la requête
 * de données (__data.json) par hooks.server.js et donc par les gardes de route,
 * y compris lors des navigations côté client.
 */
export async function load({ locals, url }) {
	void url.pathname;
	return {
		user: locals.user ? { id: locals.user.id, email: locals.user.email } : null,
		profile: locals.profile ?? null
	};
}
