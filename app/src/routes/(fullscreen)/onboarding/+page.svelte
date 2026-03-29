<script lang="ts">
	let step = $state(1);
</script>

<svelte:head>
	<title>Welcome — Scry</title>
</svelte:head>

<div class="flex flex-col items-center justify-center min-h-screen p-8 relative overflow-hidden">

	<!-- Atmospheric background -->
	<div class="absolute inset-0 pointer-events-none animate-mesh-drift" aria-hidden="true"
		style="background: radial-gradient(ellipse at 20% 50%, var(--color-gold-glow) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, var(--color-cyan-glow) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(38, 139, 210, 0.06) 0%, transparent 50%);"
	></div>
	<div class="absolute rounded-full pointer-events-none animate-orb-float-1" aria-hidden="true"
		style="width: 350px; height: 350px; background: var(--color-gold-glow); top: 10%; left: 15%; filter: blur(80px);"
	></div>
	<div class="absolute rounded-full pointer-events-none animate-orb-float-2" aria-hidden="true"
		style="width: 280px; height: 280px; background: var(--color-cyan-glow); bottom: 20%; right: 10%; filter: blur(80px);"
	></div>

	<!-- Logo -->
	<div class="font-display italic text-[1.8rem] text-text-primary mb-8 relative z-10">Scry</div>

	<!-- Card -->
	<div class="relative z-10 w-full max-w-[500px] rounded-lg bg-primary border border-border-subtle p-10">

		<div class="font-display text-[1.5rem] text-text-primary mb-2 text-center">Welcome to Scry</div>
		<div class="text-[0.9rem] text-text-secondary text-center mb-8">Let&rsquo;s audit your first site.</div>

		<!-- Progress steps -->
		<div class="flex items-center justify-center gap-3 mb-8">
			{#each [1, 2, 3] as n}
				<span
					class="size-7 rounded-full border-[1.5px] flex items-center justify-center text-[0.7rem] font-semibold font-display transition-all duration-200
					{n < step ? 'border-status-green text-status-green bg-[rgba(133,153,0,0.1)]' : n === step ? 'border-gold text-gold bg-gold-bg' : 'border-border-default text-text-tertiary'}"
				>{n < step ? '✓' : n}</span>
				{#if n < 3}
					<span class="w-[30px] h-px bg-border-default"></span>
				{/if}
			{/each}
		</div>

		<!-- Step 1: Project name -->
		{#if step === 1}
			<label for="project-name" class="block text-[0.85rem] font-medium text-text-primary mb-2">
				What&rsquo;s your first project called?
			</label>
			<input type="text" id="project-name" placeholder="e.g., Acme Corp&hellip;" autocomplete="organization"
				class="w-full mb-4 rounded-sm bg-elevated border border-border-subtle px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-muted" />
			<button onclick={() => step = 2}
				class="w-full inline-flex items-center justify-center gap-2 rounded-md font-body text-sm font-semibold bg-gold text-text-inverse py-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_24px_var(--color-gold-glow)]">
				Continue
			</button>
		{/if}

		<!-- Step 2: Site URL -->
		{#if step === 2}
			<label for="site-url" class="block text-[0.85rem] font-medium text-text-primary mb-2">
				Site URL
			</label>
			<input type="url" id="site-url" placeholder="https://&hellip;" autocomplete="url"
				class="w-full mb-2 rounded-sm bg-elevated border border-border-subtle px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-muted" />
			<p class="text-[0.8rem] text-text-tertiary mb-4">We&rsquo;ll discover your pages automatically from your sitemap.</p>
			<button onclick={() => step = 3}
				class="w-full inline-flex items-center justify-center gap-2 rounded-md font-body text-sm font-semibold bg-gold text-text-inverse py-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_24px_var(--color-gold-glow)]">
				Add Site
			</button>
		{/if}

		<!-- Step 3: Choose suites -->
		{#if step === 3}
			<p class="text-[0.85rem] text-text-primary font-medium mb-3">Choose your test suites</p>
			<div class="grid grid-cols-2 gap-2.5 mb-4">
				{#each [
					{ name: 'Accessibility', desc: 'WCAG, keyboard, forms', border: 'border-l-status-green' },
					{ name: 'Functionality', desc: 'Links, console, health', border: 'border-l-status-blue' },
					{ name: 'Responsive', desc: 'Layout, viewports', border: 'border-l-status-yellow' },
					{ name: 'Visual', desc: 'Pixel diffs, baselines', border: 'border-l-status-red' }
				] as suite}
					<button class="flex flex-col gap-1.5 rounded-md bg-elevated border border-border-gold border-l-3 {suite.border} p-3.5 text-left font-body bg-gold-bg">
						<span class="text-[0.85rem] font-semibold text-text-primary">{suite.name}</span>
						<span class="text-[0.7rem] text-text-tertiary leading-snug">{suite.desc}</span>
					</button>
				{/each}
			</div>
			<a href="/sites/acme-com"
				class="w-full inline-flex items-center justify-center gap-2 rounded-md font-body text-sm font-semibold bg-gold text-text-inverse py-3 no-underline cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_24px_var(--color-gold-glow)]">
				Run Your First Audit
			</a>
		{/if}

		<a href="/sites/acme-com" class="block text-right mt-6 text-[0.8rem] text-text-tertiary no-underline transition-colors duration-150 hover:text-text-secondary">
			Skip for now &rarr;
		</a>
	</div>
</div>
