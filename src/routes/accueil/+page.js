import { supabase } from '$lib/supabase';

export const ssr = false;

export async function load({ parent }) {
	const { user } = await parent();

	let savedConfig = [];
	let savedTheme = 'default';

	if (user) {
		const { data, error } = await supabase
			.from('user_preferences')
			.select('dashboard_config, theme')
			.eq('user_id', user.id)
			.maybeSingle();

		if (!error && data) {
			savedConfig = data.dashboard_config || [];
			savedTheme = data.theme || 'default';
		}
	}

	const {
		data: { session }
	} = await supabase.auth.getSession();

	return { savedConfig, savedTheme, session };
}
