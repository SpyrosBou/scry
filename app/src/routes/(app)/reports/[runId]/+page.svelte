<script lang="ts">
	import ScoreCards from '$lib/components/ScoreCards.svelte';
	import Button from '$lib/components/Button.svelte';

	let { data } = $props();

	let blockersOpen = $state(true);
	let warningsOpen = $state(true);
</script>

<svelte:head>
	<title>{data.site.name} Report — Scry</title>
</svelte:head>

<div class="mb-4">
	<a href="/sites/{data.site.slug}" class="text-[0.8rem]">&larr; All Runs</a>
</div>

<div class="flex items-start justify-between mb-6">
	<div>
		<h1 class="mb-1">{data.site.name}</h1>
		<div class="text-[0.8rem] text-text-secondary">
			{data.meta}
		</div>
	</div>
	<Button variant="secondary" size="sm">Export Report</Button>
</div>

<ScoreCards scores={data.scores} />

<h2 class="text-[1.1rem] mb-3">Findings</h2>

{#if data.blockers.length === 0 && data.warnings.length === 0 && data.passedCount === 0}
	<p class="text-text-tertiary text-sm px-3">No issues found.</p>
{/if}

{#if data.blockers.length > 0}
	<div class="mb-4">
		<button
			class="findings-section__header flex items-center gap-2 py-2 text-sm font-semibold text-text-primary w-full text-left bg-transparent border-0 cursor-pointer"
			aria-expanded={blockersOpen}
			onclick={() => (blockersOpen = !blockersOpen)}
		>
			<span class="size-2 shrink-0 rounded-full bg-status-red"></span>
			<span>Blockers</span>
			<span class="inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase bg-[rgba(220,50,47,0.15)] text-status-red">{data.blockers.length}</span>
		</button>
		{#if blockersOpen}
			{#each data.blockers as finding}
				<a href="/reports/{data.run.id}/{finding.suite}" class="finding-row finding-row--blocker flex items-center gap-3 rounded-r-sm px-3 py-2.5 no-underline text-text-primary transition-colors duration-100 hover:bg-white/[0.03]" style="border-left: 3px solid var(--color-status-red);">
					<span class="flex-1 text-[0.85rem] min-w-0 truncate">{finding.rule}</span>
					<span class="text-[0.7rem] text-text-tertiary tabular-nums whitespace-nowrap">{finding.page_count} {finding.page_count === 1 ? 'page' : 'pages'}</span>
					<span class="inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase bg-[rgba(133,153,0,0.15)] text-status-green">{finding.suite}</span>
				</a>
			{/each}
		{/if}
	</div>
{/if}

{#if data.warnings.length > 0}
	<div class="mb-4">
		<button
			class="findings-section__header flex items-center gap-2 py-2 text-sm font-semibold text-text-primary w-full text-left bg-transparent border-0 cursor-pointer"
			aria-expanded={warningsOpen}
			onclick={() => (warningsOpen = !warningsOpen)}
		>
			<span class="size-2 shrink-0 rounded-full bg-status-yellow"></span>
			<span>Warnings</span>
			<span class="inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase bg-[rgba(181,137,0,0.15)] text-status-yellow">{data.warnings.length}</span>
		</button>
		{#if warningsOpen}
			{#each data.warnings as finding}
				<a href="/reports/{data.run.id}/{finding.suite}" class="finding-row finding-row--warning flex items-center gap-3 rounded-r-sm px-3 py-2.5 no-underline text-text-primary transition-colors duration-100 hover:bg-white/[0.03]" style="border-left: 3px solid var(--color-status-yellow);">
					<span class="flex-1 text-[0.85rem] min-w-0 truncate">{finding.rule}</span>
					<span class="text-[0.7rem] text-text-tertiary tabular-nums whitespace-nowrap">{finding.page_count} {finding.page_count === 1 ? 'page' : 'pages'}</span>
					<span class="inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase bg-[rgba(133,153,0,0.15)] text-status-green">{finding.suite}</span>
				</a>
			{/each}
		{/if}
	</div>
{/if}

{#if data.passedCount > 0}
	<div class="mb-4">
		<div class="flex items-center gap-2 py-2 text-sm font-semibold text-text-primary">
			<span class="size-2 shrink-0 rounded-full bg-status-green"></span>
			<span>Passed</span>
			<span class="inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase bg-[rgba(133,153,0,0.15)] text-status-green">{data.passedCount}</span>
		</div>
	</div>
{/if}
