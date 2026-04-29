import { redirect } from '@sveltejs/kit';
import { sanitizeAppRedirect } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const {
		url,
		locals: { supabase }
	} = event;

	const code = url.searchParams.get('code');
	const next = sanitizeAppRedirect(url.searchParams.get('next'));

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			redirect(303, next);
		}
	}

	redirect(303, '/login?error=auth-code-error');
};
