<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ProjectWithSites } from '$lib/db';
	import Topbar from './Topbar.svelte';
	import Sidebar from './Sidebar.svelte';

	const { activePage = 'dashboard', projects = [], children }: { activePage?: 'dashboard' | 'reports'; projects?: ProjectWithSites[]; children: Snippet } = $props();
</script>

<div class="flex flex-col h-screen overflow-hidden">
	<Topbar {activePage} />
	<div class="flex flex-1 overflow-hidden mt-14">
		<Sidebar {projects} />
		<main class="flex-1 overflow-y-auto overflow-x-hidden px-8 py-6 overscroll-contain" id="main-content">
			{@render children()}
		</main>
	</div>
</div>
