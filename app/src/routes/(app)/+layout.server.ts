import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session) {
		const redirectTo = url.pathname + url.search;
		const params = new URLSearchParams({ redirectTo });
		redirect(303, `/login?${params}`);
	}

	return { session, user };
};
