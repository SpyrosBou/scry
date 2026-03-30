<script lang="ts">
	import { page } from '$app/stores';

	const { activePage = 'dashboard' }: { activePage?: 'dashboard' | 'reports' } = $props();

	const session = $derived($page.data.session);
	const userEmail = $derived(session?.user?.email ?? '');
	const userInitial = $derived(userEmail ? userEmail[0].toUpperCase() : '?');
</script>

<header class="fixed top-0 inset-x-0 z-100 h-14 px-5 flex items-center gap-4 bg-primary border-b border-border-subtle">
	<a href="/" class="font-display italic text-[1.35rem] text-text-primary no-underline tracking-tight mr-auto">Scry</a>

	<nav class="flex items-center gap-1" aria-label="Primary">
		<a
			href="/"
			class="px-3 py-1.5 rounded-sm text-[0.85rem] font-medium no-underline transition-all duration-150 {activePage === 'dashboard' ? 'text-gold bg-gold-bg' : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'}"
		>
			Dashboard
		</a>
		<a
			href="/reports/latest"
			class="px-3 py-1.5 rounded-sm text-[0.85rem] font-medium no-underline transition-all duration-150 {activePage === 'reports' ? 'text-gold bg-gold-bg' : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'}"
		>
			Reports
		</a>
	</nav>

	<div class="flex items-center gap-2 ml-2">
		<button
			class="flex items-center justify-center size-9 rounded-sm border-none bg-transparent text-text-secondary cursor-pointer transition-all duration-150 hover:bg-white/[0.06] hover:text-text-primary [&>svg]:size-[18px]"
			aria-label="Settings"
		>
			<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
				<circle cx="10" cy="10" r="3" />
				<path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.4 3.4l1.4 1.4M15.2 15.2l1.4 1.4M3.4 16.6l1.4-1.4M15.2 4.8l1.4-1.4" />
			</svg>
		</button>

		{#if session}
			<form method="POST" action="/auth/signout" class="flex items-center">
				<button
					type="submit"
					class="size-8 rounded-full bg-gold/20 border border-border-gold flex items-center justify-center text-[0.7rem] font-semibold text-gold cursor-pointer transition-all duration-150 hover:bg-gold/30"
					aria-label="Sign out ({userEmail})"
					title={userEmail}
				>
					{userInitial}
				</button>
			</form>
		{:else}
			<a
				href="/login"
				class="px-3 py-1.5 rounded-sm text-[0.8rem] font-medium text-gold bg-gold-bg no-underline transition-all duration-150 hover:bg-gold/20"
			>
				Log In
			</a>
		{/if}
	</div>
</header>
