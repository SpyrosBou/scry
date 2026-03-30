import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const {
		url,
		locals: { supabase }
	} = event;

	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/';

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			redirect(303, `/${next.slice(1)}`);
		}
	}

	redirect(303, '/login?error=auth-code-error');
};
