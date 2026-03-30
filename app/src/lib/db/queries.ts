import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectWithSites, RunStatus, SiteWithHealth } from './types';

/** Map the most-recent run status to a sidebar health indicator. */
function statusToHealth(status: RunStatus | undefined): SiteWithHealth['health'] {
	switch (status) {
		case 'pass':
			return 'green';
		case 'warn':
			return 'yellow';
		case 'fail':
			return 'red';
		default:
			return 'none';
	}
}

/**
 * Fetch all projects (with nested sites) for a given user.
 *
 * Each site's `health` is derived from its most-recent run status.
 * Projects and sites are ordered by `created_at` ascending.
 */
export async function getUserProjects(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<ProjectWithSites[]> {
	const { data: projectRows, error } = await supabase
		.from('projects')
		.select('*, sites(id, slug, name, runs(status, completed_at))')
		.eq('user_id', userId)
		.order('created_at')
		.order('created_at', { referencedTable: 'sites' });

	if (error) {
		console.error('Failed to load projects:', error.message);
		return [];
	}

	if (!projectRows) return [];

	return projectRows.map((project) => ({
		id: project.id,
		name: project.name,
		slug: project.slug,
		sites: (project.sites ?? []).map((site) => {
			// Find the most recent run by completed_at (descending)
			const latestRun = (site.runs ?? [])
				.filter((r): r is typeof r & { completed_at: string } => r.completed_at !== null)
				.sort((a, b) => b.completed_at.localeCompare(a.completed_at))[0];

			return {
				id: site.id,
				slug: site.slug,
				name: site.name,
				health: statusToHealth(latestRun?.status as RunStatus | undefined)
			};
		})
	}));
}
