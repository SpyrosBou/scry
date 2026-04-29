<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'default' | 'sm';

	interface Props {
		variant?: Variant;
		size?: Size;
		href?: string;
		disabled?: boolean;
		children: Snippet;
		onclick?: (e: MouseEvent) => void;
	}

	const { variant = 'primary', size = 'default', href, disabled = false, children, onclick }: Props = $props();

	const base = 'group inline-flex items-center justify-center gap-2 rounded-md font-body font-semibold leading-none no-underline cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0';

	const variants: Record<Variant, string> = {
		primary: 'bg-gold text-text-inverse shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_24px_var(--color-gold-glow)] hover:bg-gold-light hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_40px_var(--color-gold-glow)] disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none',
		secondary: 'bg-transparent text-text-secondary border border-border-default hover:text-text-primary hover:border-border-strong hover:bg-white/[0.03]',
		ghost: 'bg-transparent text-cyan px-0 py-3 hover:text-cyan-light',
		danger: 'bg-transparent text-status-red border border-[rgba(220,50,47,0.3)] hover:bg-[rgba(220,50,47,0.1)] hover:border-status-red'
	};

	const sizes: Record<Size, string> = {
		default: 'text-sm min-h-[44px] px-6 py-3',
		sm: 'text-xs min-h-[36px] px-4 py-2'
	};

	const cls = $derived(`${base} ${variants[variant]} ${sizes[size]}`);
</script>

{#if href}
	<a {href} class={cls}>{@render children()}{#if variant === 'ghost'}<span class="transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>{/if}</a>
{:else}
	<button {disabled} {onclick} class={cls}>{@render children()}</button>
{/if}
