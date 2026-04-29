import { json } from '@sveltejs/kit';
import { validateSitePayload } from '$lib/server/validation';
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

	const validated = validateSitePayload(body);
	if (!validated.ok) return json({ error: validated.error }, { status: 400 });

	const { projectId, url, name, slug } = validated.value;

	// Verify the project belongs to this user before inserting
	const { data: project, error: projectError } = await locals.supabase
		.from('projects')
		.select('id')
		.eq('id', projectId)
		.eq('user_id', user.id)
		.single();

	if (projectError || !project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const { data, error } = await locals.supabase
		.from('sites')
		.insert({ project_id: projectId, url, name, slug })
		.select()
		.single();

	if (error) {
		if (error.code === '23505')
			return json({ error: 'A site with this name already exists in this project' }, { status: 409 });
		console.error('Failed to create site', { error, projectId, userId: user.id });
		return json({ error: 'Failed to create site' }, { status: 500 });
	}

	return json(data, { status: 201 });
};
