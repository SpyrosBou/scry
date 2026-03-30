import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		redirect(307, '/login');
	}

	// Find the user's first site (ordered by project then site creation date)
	const { data: firstSite } = await locals.supabase
		.from('sites')
		.select('slug, projects!inner(user_id)')
		.eq('projects.user_id', user.id)
		.order('created_at')
		.limit(1)
		.single();

	if (firstSite?.slug) {
		redirect(307, `/sites/${firstSite.slug}`);
	}

	redirect(307, '/onboarding');
};
