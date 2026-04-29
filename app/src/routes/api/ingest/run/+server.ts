import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import {
	isAuthorizedIngestRequest,
	validateNormalizedRunImport,
	writeNormalizedRunImport
} from '$lib/server/ingestion';
import { createSupabaseAdminClient } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!isAuthorizedIngestRequest(request.headers.get('authorization'), env.SCRY_INGEST_TOKEN)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON' }, { status: 400 });
	}

	const validated = validateNormalizedRunImport(body);
	if (!validated.ok) return json({ error: validated.error }, { status: 400 });

	try {
		const result = await writeNormalizedRunImport(createSupabaseAdminClient(), validated.value);
		return json(result, { status: 201 });
	} catch (error) {
		console.error('Failed to ingest audit run', { error });
		return json({ error: 'Failed to ingest audit run' }, { status: 500 });
	}
};
