<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { ProjectWithSites } from '$lib/db';
	import HealthDot from './HealthDot.svelte';

	const { projects = [] }: { projects: ProjectWithSites[] } = $props();

	function handleKeydown(e: KeyboardEvent) {
		const tree = (e.currentTarget as HTMLElement).closest('[role="tree"]');
		if (!tree) return;
		const items = Array.from(tree.querySelectorAll<HTMLElement>('a[role="treeitem"]'));
		const idx = items.indexOf(document.activeElement as HTMLElement);
		if (idx === -1) return;

		let next = -1;
		switch (e.key) {
			case 'ArrowDown': next = Math.min(idx + 1, items.length - 1); break;
			case 'ArrowUp': next = Math.max(idx - 1, 0); break;
			case 'Home': next = 0; break;
			case 'End': next = items.length - 1; break;
			default: return;
		}
		if (next >= 0) {
			e.preventDefault();
			items[next].focus();
		}
	}
</script>

<aside
	class="w-[220px] min-w-[220px] h-full bg-primary border-r border-border-subtle overflow-y-auto overflow-x-hidden overscroll-contain py-3 flex flex-col"
	aria-label="Site navigation"
>
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<ul role="tree" aria-label="Projects and sites" onkeydown={handleKeydown}>
		{#each projects as project}
			<li>
				<span class="px-4 pt-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-text-tertiary font-body block">
					{project.name}
				</span>
				<ul role="group">
					{#each project.sites as site}
						{@const isActive = $page.params.slug === site.slug}
						<li>
							<a
								role="treeitem"
								aria-selected={isActive}
								href="/sites/{site.slug}"
								tabindex={isActive ? 0 : -1}
								class="group flex items-center gap-2 w-full py-1.5 px-4 text-sm font-body no-underline cursor-pointer transition-all duration-100 min-h-[36px] border-l-3 border-transparent {isActive ? 'bg-gold-bg text-text-primary !border-l-gold' : 'text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'}"
							>
								<HealthDot status={site.health} />
								<span class="flex-1 min-w-0 truncate">{site.name}</span>
								<button
									class="flex items-center justify-center size-6 rounded-[4px] border-none bg-transparent text-text-tertiary p-0 text-[0.7rem] cursor-pointer transition-all duration-100 opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] hover:text-text-primary"
									aria-label="{site.name} settings"
									onclick={(e) => { e.preventDefault(); e.stopPropagation(); goto(`/sites/${site.slug}/settings`); }}
								>
									<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3">
										<circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
									</svg>
								</button>
							</a>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>

	<button class="flex items-center gap-1.5 px-4 py-3 mt-auto text-[0.8rem] font-medium text-gold cursor-pointer border-none bg-transparent w-full text-left font-body transition-all duration-100 hover:bg-gold-bg">
		+ New Project
	</button>
</aside>
