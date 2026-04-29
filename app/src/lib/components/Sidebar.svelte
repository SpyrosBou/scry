<script lang="ts">
	import { page } from '$app/stores';
	import { goto, invalidate } from '$app/navigation';
	import type { ProjectWithSites } from '$lib/db';
	import HealthDot from './HealthDot.svelte';

	const { projects = [] }: { projects: ProjectWithSites[] } = $props();

	// Project creation state
	let showCreateProject = $state(false);
	let newProjectName = $state('');
	let creatingProject = $state(false);
	let createProjectError = $state('');

	// Site creation state — keyed by project ID
	let addingSiteForProject = $state<string | null>(null);
	let newSiteUrl = $state('');
	let creatingSite = $state(false);
	let createSiteError = $state('');

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

	async function createProject() {
		const name = newProjectName.trim();
		if (!name) return;

		creatingProject = true;
		createProjectError = '';

		try {
			const res = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});

			if (!res.ok) {
				const body = await res.json();
				createProjectError = body.error || 'Failed to create project';
				return;
			}

			// Reset form and refresh sidebar data
			newProjectName = '';
			showCreateProject = false;
			await invalidate('supabase:auth');
		} catch {
			createProjectError = 'Network error. Please try again.';
		} finally {
			creatingProject = false;
		}
	}

	function cancelCreateProject() {
		showCreateProject = false;
		newProjectName = '';
		createProjectError = '';
	}

	async function createSite(projectId: string) {
		const url = newSiteUrl.trim();
		if (!url) return;

		creatingSite = true;
		createSiteError = '';

		try {
			const res = await fetch('/api/sites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project_id: projectId, url })
			});

			if (!res.ok) {
				const body = await res.json();
				createSiteError = body.error || 'Failed to add site';
				return;
			}

			// Reset form and refresh sidebar data
			newSiteUrl = '';
			addingSiteForProject = null;
			await invalidate('supabase:auth');
		} catch {
			createSiteError = 'Network error. Please try again.';
		} finally {
			creatingSite = false;
		}
	}

	function cancelCreateSite() {
		addingSiteForProject = null;
		newSiteUrl = '';
		createSiteError = '';
	}

	/** Focus an input on mount — avoids the Svelte a11y autofocus warning. */
	function autofocusAction(node: HTMLInputElement) {
		node.focus();
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
				<span class="group flex items-center px-4 pt-3 pb-1">
					<span class="flex-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-text-tertiary font-body">
						{project.name}
					</span>
					<button
						class="flex items-center justify-center size-5 rounded-[4px] border-none bg-transparent text-text-tertiary p-0 text-xs cursor-pointer transition-all duration-100 opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] hover:text-gold"
						aria-label="Add site to {project.name}"
						onclick={() => {
							if (addingSiteForProject === project.id) {
								cancelCreateSite();
							} else {
								cancelCreateSite();
								addingSiteForProject = project.id;
							}
						}}
					>+</button>
				</span>
				<ul role="group">
					{#each project.sites as site}
						{@const isActive = $page.params.slug === site.slug}
						<li>
							<div
								class="group flex items-center min-h-[36px] border-l-3 border-transparent transition-all duration-100 {isActive ? 'bg-gold-bg !border-l-gold' : 'hover:bg-white/[0.03]'}"
							>
								<a
									role="treeitem"
									aria-selected={isActive}
									href="/sites/{site.slug}"
									tabindex={isActive ? 0 : -1}
									class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-4 pr-1 text-sm font-body no-underline cursor-pointer transition-colors duration-100 {isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}"
								>
									<HealthDot status={site.health} />
									<span class="flex-1 min-w-0 truncate">{site.name}</span>
								</a>
								<button
									type="button"
									class="mr-2 flex items-center justify-center size-6 rounded-[4px] border-none bg-transparent text-text-tertiary p-0 text-[0.7rem] cursor-pointer transition-all duration-100 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-white/[0.08] hover:text-text-primary"
									aria-label="{site.name} settings"
									onclick={() => { goto(`/sites/${site.slug}/settings`); }}
								>
									<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3">
										<circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
									</svg>
								</button>
							</div>
						</li>
					{/each}

					<!-- Inline add-site form -->
					{#if addingSiteForProject === project.id}
						<li class="px-4 py-1.5">
							<form
								onsubmit={(e) => { e.preventDefault(); createSite(project.id); }}
								class="flex flex-col gap-1.5"
							>
								<input
									bind:value={newSiteUrl}
									use:autofocusAction
									type="url"
									placeholder="https://example.com"
									disabled={creatingSite}
									class="w-full bg-elevated border border-border-subtle rounded-sm px-2 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-muted focus:outline-none disabled:opacity-50"
								/>
								{#if createSiteError}
									<p class="text-[0.7rem] text-red-400 m-0">{createSiteError}</p>
								{/if}
								<div class="flex items-center gap-2">
									<button
										type="submit"
										disabled={creatingSite || !newSiteUrl.trim()}
										class="px-2 py-1 text-[0.7rem] font-medium font-body rounded-sm bg-gold/20 text-gold border border-gold/30 cursor-pointer transition-all duration-100 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{creatingSite ? 'Adding...' : 'Add'}
									</button>
									<button
										type="button"
										onclick={cancelCreateSite}
										class="px-1 py-1 text-[0.7rem] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary"
									>
										Cancel
									</button>
								</div>
							</form>
						</li>
					{/if}
				</ul>
			</li>
		{/each}
	</ul>

	<!-- New Project button / inline form -->
	{#if showCreateProject}
		<div class="px-4 py-3 mt-auto">
			<form
				onsubmit={(e) => { e.preventDefault(); createProject(); }}
				class="flex flex-col gap-1.5"
			>
				<input
					bind:value={newProjectName}
					use:autofocusAction
					type="text"
					placeholder="Project name"
					disabled={creatingProject}
					class="w-full bg-elevated border border-border-subtle rounded-sm px-2 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-muted focus:outline-none disabled:opacity-50"
				/>
				{#if createProjectError}
					<p class="text-[0.7rem] text-red-400 m-0">{createProjectError}</p>
				{/if}
				<div class="flex items-center gap-2">
					<button
						type="submit"
						disabled={creatingProject || !newProjectName.trim()}
						class="px-2.5 py-1 text-[0.7rem] font-medium font-body rounded-sm bg-gold/20 text-gold border border-gold/30 cursor-pointer transition-all duration-100 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{creatingProject ? 'Creating...' : 'Create'}
					</button>
					<button
						type="button"
						onclick={cancelCreateProject}
						class="px-1 py-1 text-[0.7rem] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	{:else}
		<button
			onclick={() => { showCreateProject = true; }}
			class="flex items-center gap-1.5 px-4 py-3 mt-auto text-[0.8rem] font-medium text-gold cursor-pointer border-none bg-transparent w-full text-left font-body transition-all duration-100 hover:bg-gold-bg"
		>
			+ New Project
		</button>
	{/if}
</aside>
