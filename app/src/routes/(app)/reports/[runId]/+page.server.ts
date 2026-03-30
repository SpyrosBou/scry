import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { SuiteSlug, SuiteStatus } from '$lib/db';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { user } = await parent();

	const { data: run } = await locals.supabase
		.from('runs')
		.select(`
			*,
			site:sites!inner(id, name, slug, project:projects!inner(user_id)),
			run_suites(*),
			findings(*)
		`)
		.eq('id', params.runId)
		.eq('site.project.user_id', user.id)
		.single();

	if (!run) {
		error(404, 'Run not found');
	}

	const site = { name: run.site.name, slug: run.site.slug };

	const scores = (run.run_suites as Array<{ suite: SuiteSlug; score: number | null; status: SuiteStatus }>).map(
		(rs) => ({
			suite: rs.suite,
			value: rs.score,
			status: rs.status,
			href: `/reports/${run.id}/${rs.suite}`
		})
	);

	const blockers = (run.findings as Array<{ id: string; suite: string; rule: string; severity: string; page_count: number }>).filter(
		(f) => f.severity === 'blocker'
	);
	const warnings = (run.findings as Array<{ id: string; suite: string; rule: string; severity: string; page_count: number }>).filter(
		(f) => f.severity === 'warning'
	);
	const passedCount = (run.findings as Array<{ severity: string }>).filter(
		(f) => f.severity === 'passed'
	).length;

	// Format meta string
	const startedDate = new Date(run.started_at);
	const formattedDate = startedDate.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const formattedTime = startedDate.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});

	let duration = '';
	if (run.completed_at) {
		const ms = new Date(run.completed_at).getTime() - startedDate.getTime();
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
	}

	const suiteCount = run.run_suites.length;
	const meta = [
		`${formattedDate} \u00b7 ${formattedTime}`,
		`${run.pages_tested} page${run.pages_tested === 1 ? '' : 's'}`,
		`${suiteCount} suite${suiteCount === 1 ? '' : 's'}`,
		...(duration ? [duration] : [])
	].join(' \u00b7 ');

	return {
		run: {
			id: run.id,
			status: run.status,
			started_at: run.started_at,
			completed_at: run.completed_at,
			pages_tested: run.pages_tested
		},
		site,
		scores,
		blockers,
		warnings,
		passedCount,
		meta
	};
};
