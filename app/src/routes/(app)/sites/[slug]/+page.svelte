<script lang="ts">
	import { page } from '$app/stores';
	import ScoreCards from '$lib/components/ScoreCards.svelte';
	import Button from '$lib/components/Button.svelte';

	const slug = $derived($page.params.slug);
	const siteName = $derived(slug.replace(/-/g, '.').replace(/\.com$/, '.com').replace(/\.co$/, '.co'));

	const sampleScores = [
		{ suite: 'functionality' as const, value: 98, status: 'pass' as const, href: '/reports/run-1/functionality' },
		{ suite: 'accessibility' as const, value: 74, status: 'warn' as const, href: '/reports/run-1/accessibility' },
		{ suite: 'responsive' as const, value: 91, status: 'pass' as const, href: '/reports/run-1/responsive' },
		{ suite: 'visual' as const, value: 100, status: 'pass' as const, href: '/reports/run-1/visual' }
	];
</script>

<svelte:head>
	<title>{siteName} — Scry</title>
</svelte:head>

<div class="flex items-start justify-between mb-6">
	<div>
		<h1 class="mb-1">{siteName}</h1>
		<div class="flex items-center gap-2 text-[0.8rem] text-text-secondary">
			<span>Last run: 2 hours ago</span>
			<span>&middot;</span>
			<span>Scheduled: Daily at 6:00 AM</span>
		</div>
	</div>
	<Button>Run Audit</Button>
</div>

<ScoreCards scores={sampleScores} />

<div class="rounded-md bg-elevated border border-border-subtle p-4 mb-5">
	<div class="text-xs text-text-secondary font-medium mb-3">Score Trend (30 days)</div>
	<svg class="w-full h-20" viewBox="0 0 600 80" preserveAspectRatio="none">
		<polyline fill="none" stroke="#268bd2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
			points="0,12 40,14 80,10 120,16 160,8 200,12 240,10 280,14 320,8 360,6 400,10 440,8 480,6 520,8 560,4 600,4" />
		<polyline fill="none" stroke="#859900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
			points="0,40 40,42 80,38 120,44 160,36 200,34 240,32 280,30 320,28 360,32 400,28 440,24 480,22 520,20 560,22 600,20" />
		<polyline fill="none" stroke="#b58900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
			points="0,20 40,18 80,22 120,16 160,20 200,18 240,14 280,16 320,12 360,10 400,12 440,10 480,8 520,10 560,8 600,8" />
		<polyline fill="none" stroke="#dc322f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
			points="0,2 40,2 80,2 120,2 160,2 200,2 240,2 280,2 320,2 360,2 400,2 440,2 480,2 520,2 560,2 600,2" />
	</svg>
</div>

<div class="text-xs text-text-secondary font-medium mb-2">Recent Runs</div>
{#each [
	{ date: 'Mar 29, 6:00 AM', status: 'Pass', color: 'green', suites: 4, pages: 12, time: '2m 14s' },
	{ date: 'Mar 28, 6:00 AM', status: 'Warn', color: 'yellow', suites: 4, pages: 12, time: '2m 31s' },
	{ date: 'Mar 27, 6:00 AM', status: 'Pass', color: 'green', suites: 4, pages: 12, time: '2m 08s' }
] as run}
	<a href="/reports/run-1" class="flex items-center gap-3 rounded-md bg-elevated border border-border-subtle px-4 py-3 mb-2 no-underline text-text-primary transition-all duration-150 hover:-translate-y-px hover:shadow-sm">
		<span class="text-[0.8rem] tabular-nums min-w-[140px]">{run.date}</span>
		<span class="flex items-center gap-1.5 text-xs font-medium">
			<span class="size-2 shrink-0 rounded-full {run.color === 'green' ? 'bg-status-green' : 'bg-status-yellow'}"></span>
			{run.status}
		</span>
		<span class="flex items-center gap-3 ml-auto text-xs text-text-tertiary tabular-nums">
			<span>{run.suites} suites</span>
			<span>{run.pages} pages</span>
			<span>{run.time}</span>
		</span>
	</a>
{/each}
