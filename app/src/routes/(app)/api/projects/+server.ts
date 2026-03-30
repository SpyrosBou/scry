import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { name } = await request.json();
	if (!name?.trim()) return json({ error: 'Name is required' }, { status: 400 });

	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	const { data, error } = await locals.supabase
		.from('projects')
		.insert({ user_id: user.id, name: name.trim(), slug })
		.select()
		.single();

	if (error) {
		if (error.code === '23505')
			return json({ error: 'A project with this name already exists' }, { status: 409 });
		return json({ error: error.message }, { status: 500 });
	}

	return json(data, { status: 201 });
};
