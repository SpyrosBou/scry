<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');

	const supabase = $derived(page.data.supabase);
	const redirectTo = $derived(sanitizeAppRedirect(page.url.searchParams.get('redirectTo')));

	function sanitizeAppRedirect(value: string | null, fallback = '/dashboard') {
		if (!value) return fallback;

		const trimmed = value.trim();
		if (
			!trimmed ||
			!trimmed.startsWith('/') ||
			trimmed.startsWith('//') ||
			/[\u0000-\u001F\u007F]/.test(trimmed)
		) {
			return fallback;
		}

		return trimmed;
	}

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = '';

		const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

		if (authError) {
			error = authError.message;
			loading = false;
		} else {
			goto(redirectTo);
		}
	}

	async function handleGoogleLogin() {
		loading = true;
		const { error: authError } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${page.url.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`
			}
		});
		if (authError) {
			error = authError.message;
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Log In — Scry</title>
</svelte:head>

<div class="flex flex-col items-center justify-center min-h-screen p-8">

	<a href="/" class="font-display italic text-[1.8rem] text-text-primary mb-8 no-underline">Scry</a>

	<div class="w-full max-w-[400px] rounded-lg bg-primary border border-border-subtle p-8">

		<h1 class="text-[1.3rem] text-center mb-2">Welcome back</h1>
		<p class="text-[0.85rem] text-text-secondary text-center mb-6">Log in to your account</p>

		{#if error}
			<div class="rounded-sm bg-[rgba(220,50,47,0.1)] border border-status-red/30 px-4 py-3 text-sm text-status-red mb-4">
				{error}
			</div>
		{/if}

		<!-- Google OAuth -->
		<button
			onclick={handleGoogleLogin}
			disabled={loading}
			class="w-full flex items-center justify-center gap-3 rounded-md border border-border-default bg-elevated px-4 py-3 text-sm font-medium text-text-primary cursor-pointer transition-all duration-150 hover:bg-surface hover:border-border-strong disabled:opacity-50 mb-4"
		>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
				<path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
				<path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
				<path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
				<path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
			</svg>
			Continue with Google
		</button>

		<div class="flex items-center gap-3 mb-4">
			<div class="flex-1 h-px bg-border-subtle"></div>
			<span class="text-[0.75rem] text-text-tertiary uppercase tracking-wide">or</span>
			<div class="flex-1 h-px bg-border-subtle"></div>
		</div>

		<!-- Email/password -->
		<form onsubmit={handleLogin}>
			<label for="email" class="block text-[0.8rem] font-medium text-text-secondary mb-1">Email</label>
			<input
				id="email"
				type="email"
				autocomplete="email"
				required
				bind:value={email}
				class="w-full mb-3 rounded-sm bg-elevated border border-border-subtle px-3 py-2.5 font-body text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-muted"
				placeholder="you@example.com"
			/>

			<label for="password" class="block text-[0.8rem] font-medium text-text-secondary mb-1">Password</label>
			<input
				id="password"
				type="password"
				autocomplete="current-password"
				required
				bind:value={password}
				class="w-full mb-5 rounded-sm bg-elevated border border-border-subtle px-3 py-2.5 font-body text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-muted"
				placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
			/>

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-md bg-gold text-text-inverse font-semibold py-3 text-sm cursor-pointer transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_24px_var(--color-gold-glow)]"
			>
				{loading ? 'Logging in\u2026' : 'Log In'}
			</button>
		</form>

		<p class="text-[0.8rem] text-text-tertiary text-center mt-5">
			Don&rsquo;t have an account?
			<a href="/signup" class="text-cyan">Sign up</a>
		</p>
	</div>
</div>
