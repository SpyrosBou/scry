import { redirect } from '@sveltejs/kit';
import { getUserProjects } from '$lib/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		const redirectTo = url.pathname + url.search;
		const params = new URLSearchParams({ redirectTo });
		redirect(303, `/login?${params}`);
	}

	const projects = await getUserProjects(locals.supabase, user.id);

	return { session, user, projects };
};
