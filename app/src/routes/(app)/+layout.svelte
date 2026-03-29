<script lang="ts">
	import { page } from '$app/stores';
	import AppShell from '$lib/components/AppShell.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const activePage = $derived(
		$page.url.pathname.startsWith('/reports') ? 'reports' as const : 'dashboard' as const
	);
</script>

<AppShell {activePage}>
	{@render children()}
</AppShell>
