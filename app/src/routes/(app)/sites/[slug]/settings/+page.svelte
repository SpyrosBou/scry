<script lang="ts">
	let { params }: import('./$types').PageProps = $props();

	const slug = $derived(params.slug);
	const siteName = $derived(slug.replace(/-/g, '.').replace(/\.com$/, '.com'));
</script>

<svelte:head>
	<title>{siteName} Settings — Scry</title>
</svelte:head>

<div class="mb-4">
	<a href="/sites/{slug}" class="text-[0.8rem]">&larr; Back to Dashboard</a>
</div>

<h1 class="mb-6">{siteName} &middot; Settings</h1>

<div class="rounded-md bg-elevated border border-border-subtle p-5 mb-4">
	<div class="text-[0.85rem] font-semibold text-text-primary font-body mb-4">General</div>
	<p class="text-text-tertiary text-sm">Site configuration will be available in sub-project #3 (data layer).</p>
</div>

<div class="rounded-md bg-elevated border border-border-subtle p-5 mb-4">
	<div class="text-[0.85rem] font-semibold text-text-primary font-body mb-4">Scheduled Audits</div>
	<p class="text-text-tertiary text-sm">Schedule management will be available in sub-project #7.</p>
</div>

<div class="rounded-md bg-elevated border border-border-subtle p-5 mb-4" style="border-left: 3px solid var(--color-status-red);">
	<div class="text-[0.85rem] font-semibold text-status-red font-body mb-4">Danger Zone</div>
	<p class="text-text-tertiary text-sm">Site removal will be available in sub-project #3.</p>
</div>
