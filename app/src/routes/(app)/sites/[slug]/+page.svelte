<script lang="ts">
	import ScoreCards from '$lib/components/ScoreCards.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { SuiteSlug } from '$lib/db';

	let { data }: import('./$types').PageProps = $props();

	const suites: SuiteSlug[] = ['functionality', 'accessibility', 'responsive', 'visual'];

	const statusColors: Record<string, string> = {
		Pass: 'bg-status-green',
		Warn: 'bg-status-yellow',
		Fail: 'bg-status-red',
		Running: 'bg-status-blue'
	};
</script>

<svelte:head>
	<title>{data.site.name} — Scry</title>
</svelte:head>

<div class="flex items-start justify-between mb-6">
	<div>
		<h1 class="mb-1">{data.site.name}</h1>
			<div class="flex items-center gap-2 text-[0.8rem] text-text-secondary">
				<span>Last run: {data.lastRunLabel}</span>
				<span>&middot;</span>
				<span>{data.schedule ? `Scheduled: ${data.schedule}` : 'No schedule'}</span>
			</div>
	</div>
	<Button>Run Audit</Button>
</div>

<ScoreCards scores={data.scores} />

{#if data.recentRuns.length > 0}
	<div class="rounded-md bg-elevated border border-border-subtle p-4 mb-5">
		<div class="text-xs text-text-secondary font-medium mb-3">Score Trend (last {data.recentRuns.length} runs)</div>
		<svg class="w-full h-20" viewBox="0 0 600 80" preserveAspectRatio="none">
			{#each suites as suite (suite)}
				{#if data.trendPoints[suite]}
					<polyline
						fill="none"
						stroke={data.suiteColors[suite]}
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						points={data.trendPoints[suite]}
					/>
				{/if}
			{/each}
		</svg>
	</div>

	<div class="text-xs text-text-secondary font-medium mb-2">Recent Runs</div>
	{#each data.recentRuns as run (run.id)}
		<a href="/reports/{run.id}" class="flex items-center gap-3 rounded-md bg-elevated border border-border-subtle px-4 py-3 mb-2 no-underline text-text-primary transition-all duration-150 hover:-translate-y-px hover:shadow-sm">
			<span class="text-[0.8rem] tabular-nums min-w-[140px]">{run.date}</span>
			<span class="flex items-center gap-1.5 text-xs font-medium">
				<span class="size-2 shrink-0 rounded-full {statusColors[run.status] ?? 'bg-text-tertiary'}"></span>
				{run.status}
			</span>
			<span class="flex items-center gap-3 ml-auto text-xs text-text-tertiary tabular-nums">
				<span>{run.suiteCount} suites</span>
				<span>{run.pageCount} pages</span>
				<span>{run.duration}</span>
			</span>
		</a>
	{/each}
{:else}
	<div class="rounded-md bg-elevated border border-border-subtle p-8 text-center">
		<div class="text-text-secondary text-sm mb-3">No runs yet</div>
		<p class="text-text-tertiary text-xs mb-4">Run your first audit to see scores, trends, and results here.</p>
		<Button>Run Audit</Button>
	</div>
{/if}
