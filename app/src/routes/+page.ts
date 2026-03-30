import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const { session } = await parent();

	if (session) {
		redirect(307, '/sites/acme-com');
	} else {
		redirect(307, '/login');
	}
};
