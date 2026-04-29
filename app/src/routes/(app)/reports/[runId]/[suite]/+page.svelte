<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	let { params }: import('./$types').PageProps = $props();

	const runId = $derived(params.runId);
	const suite = $derived(params.suite);
	const suiteName = $derived(suite.charAt(0).toUpperCase() + suite.slice(1));
</script>

<svelte:head>
	<title>{suiteName} Report — Scry</title>
</svelte:head>

<div class="mb-4">
	<a href="/reports/{runId}" class="text-[0.8rem]">&larr; Back to Report Overview</a>
</div>

<div class="flex items-start justify-between mb-6">
	<div>
		<h1 class="mb-1">{suiteName}</h1>
		<div class="flex items-center gap-2 text-[0.8rem] text-text-secondary">
			<span>acme.com</span>
			<span>&middot;</span>
			<span>Mar 29, 2026</span>
			<span>&middot;</span>
			<span>Score: <strong class="text-status-yellow">74</strong></span>
		</div>
	</div>
	<Button variant="secondary" size="sm">Export Suite Report</Button>
</div>

<div class="rounded-md bg-elevated border border-border-subtle p-5">
	<p class="text-text-tertiary text-sm">
		Detailed {suite} findings with per-page breakdowns, culprit elements, and screenshots will be available in sub-project #6.
	</p>
</div>
