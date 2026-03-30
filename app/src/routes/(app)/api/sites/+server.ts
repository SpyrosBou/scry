import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { project_id, url, name } = await request.json();

	if (!project_id?.trim()) return json({ error: 'Project ID is required' }, { status: 400 });
	if (!url?.trim()) return json({ error: 'URL is required' }, { status: 400 });

	// Derive name from URL if not provided
	let siteName = name?.trim();
	if (!siteName) {
		try {
			const parsed = new URL(url.trim());
			siteName = parsed.hostname.replace(/^www\./, '');
		} catch {
			return json({ error: 'Invalid URL' }, { status: 400 });
		}
	}

	const slug = siteName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	// Verify the project belongs to this user before inserting
	const { data: project, error: projectError } = await locals.supabase
		.from('projects')
		.select('id')
		.eq('id', project_id)
		.eq('user_id', user.id)
		.single();

	if (projectError || !project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const { data, error } = await locals.supabase
		.from('sites')
		.insert({ project_id, url: url.trim(), name: siteName, slug })
		.select()
		.single();

	if (error) {
		if (error.code === '23505')
			return json({ error: 'A site with this name already exists in this project' }, { status: 409 });
		return json({ error: error.message }, { status: 500 });
	}

	return json(data, { status: 201 });
};
