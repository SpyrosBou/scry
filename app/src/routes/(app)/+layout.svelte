<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '$lib/components/AppShell.svelte';

	let { data, children }: import('./$types').LayoutProps = $props();

	const activePage = $derived(
		page.url.pathname.startsWith('/reports') ? 'reports' as const : 'dashboard' as const
	);
</script>

<AppShell {activePage} projects={data.projects}>
	{@render children()}
</AppShell>
