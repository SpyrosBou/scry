import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { SuiteSlug, SuiteStatus } from '$lib/db';

const SUITES: SuiteSlug[] = ['functionality', 'accessibility', 'responsive', 'visual'];

const SUITE_COLORS: Record<SuiteSlug, string> = {
	functionality: '#268bd2',
	accessibility: '#859900',
	responsive: '#b58900',
	visual: '#dc322f'
};

const SVG_WIDTH = 600;
const SVG_HEIGHT = 80;

interface ScoreEntry {
	suite: SuiteSlug;
	value: number | null;
	status: SuiteStatus | 'pass';
	href: string;
}

interface RecentRun {
	id: string;
	date: string;
	status: string;
	suiteCount: number;
	pageCount: number;
	duration: string;
}

function formatDuration(startedAt: string, completedAt: string | null): string {
	if (!completedAt) return 'running';
	const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	}) + ', ' + d.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

/** Map score (0-100) to SVG y-coordinate (top = high score, bottom = low). */
function scoreToY(score: number | null): number {
	if (score === null) return SVG_HEIGHT;
	// Clamp to 0-100, map to SVG_HEIGHT..0 (inverted y-axis)
	const clamped = Math.max(0, Math.min(100, score));
	return SVG_HEIGHT - (clamped / 100) * SVG_HEIGHT;
}

function buildTrendPoints(
	runs: Array<{ run_suites: Array<{ suite: SuiteSlug; score: number | null }> }>
): Record<SuiteSlug, string> {
	const result: Record<SuiteSlug, string> = {
		functionality: '',
		accessibility: '',
		responsive: '',
		visual: ''
	};

	// Runs come in newest-first order; reverse so oldest is index 0 (left side)
	const chronological = [...runs].reverse();
	const count = chronological.length;

	if (count === 0) return result;

	for (const suite of SUITES) {
		const points: string[] = [];
		for (let i = 0; i < count; i++) {
			const x = count === 1 ? SVG_WIDTH : Math.round((i / (count - 1)) * SVG_WIDTH);
			const suiteData = chronological[i].run_suites.find((rs) => rs.suite === suite);
			const y = scoreToY(suiteData?.score ?? null);
			points.push(`${x},${y}`);
		}
		result[suite] = points.join(' ');
	}

	return result;
}

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { user } = await parent();

	// Fetch site by slug, ensuring ownership via the project join
	const { data: site } = await locals.supabase
		.from('sites')
		.select('id, slug, name, url, project:projects!inner(user_id, name)')
		.eq('slug', params.slug)
		.eq('project.user_id', user.id)
		.single();

	if (!site) {
		error(404, 'Site not found');
	}

	// Fetch last 10 runs with their suite scores
	const { data: runs } = await locals.supabase
		.from('runs')
		.select('id, status, started_at, completed_at, pages_tested, suites_run, run_suites(suite, score, status)')
		.eq('site_id', site.id)
		.order('started_at', { ascending: false })
		.limit(10);

	const safeRuns = runs ?? [];

	// Derive scores from latest run's run_suites
	const latestRun = safeRuns[0];
	const scores: ScoreEntry[] = SUITES.map((suite) => {
		if (!latestRun) {
			return { suite, value: null, status: 'pass' as const, href: '#' };
		}
		const rs = latestRun.run_suites.find((s) => s.suite === suite);
		return {
			suite,
			value: rs?.score ?? null,
			status: (rs?.status ?? 'pass') as SuiteStatus,
			href: `/reports/${latestRun.id}/${suite}`
		};
	});

	// Build recent runs list
	const recentRuns: RecentRun[] = safeRuns.map((run) => ({
		id: run.id,
		date: formatDate(run.started_at),
		status: run.status === 'pass' ? 'Pass' : run.status === 'warn' ? 'Warn' : run.status === 'fail' ? 'Fail' : 'Running',
		suiteCount: run.suites_run.length,
		pageCount: run.pages_tested,
		duration: formatDuration(run.started_at, run.completed_at)
	}));

	// Build trend chart data
	const trendPoints = buildTrendPoints(
		safeRuns.map((r) => ({
			run_suites: r.run_suites as Array<{ suite: SuiteSlug; score: number | null }>
		}))
	);

	// Compute "last run" relative time
	let lastRunLabel = 'No runs yet';
	if (latestRun) {
		const ago = Date.now() - new Date(latestRun.started_at).getTime();
		const minutes = Math.round(ago / 60_000);
		if (minutes < 1) lastRunLabel = 'Just now';
		else if (minutes < 60) lastRunLabel = `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
		else {
			const hours = Math.round(minutes / 60);
			if (hours < 24) lastRunLabel = `${hours} hour${hours === 1 ? '' : 's'} ago`;
			else {
				const days = Math.round(hours / 24);
				lastRunLabel = `${days} day${days === 1 ? '' : 's'} ago`;
			}
		}
	}

	return {
		site: {
			id: site.id,
			slug: site.slug,
			name: site.name,
			url: site.url,
			projectName: Array.isArray(site.project) ? site.project[0]?.name : site.project.name
		},
		scores,
		recentRuns,
		trendPoints,
		suiteColors: SUITE_COLORS,
		lastRunLabel,
		schedule: 'Daily at 6:00 AM'
	};
};
