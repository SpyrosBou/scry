import { json } from '@sveltejs/kit';
import { validateProjectPayload } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON' }, { status: 400 });
	}

	const validated = validateProjectPayload(body);
	if (!validated.ok) return json({ error: validated.error }, { status: 400 });

	const { name, slug } = validated.value;

	const { data, error } = await locals.supabase
		.from('projects')
		.insert({ user_id: user.id, name, slug })
		.select()
		.single();

	if (error) {
		if (error.code === '23505')
			return json({ error: 'A project with this name already exists' }, { status: 409 });
		console.error('Failed to create project', { error, userId: user.id });
		return json({ error: 'Failed to create project' }, { status: 500 });
	}

	return json(data, { status: 201 });
};
