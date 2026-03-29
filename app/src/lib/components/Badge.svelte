<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'error' | 'warning' | 'ok' | 'info';

	const { variant = 'info', children }: { variant?: Variant; children: Snippet } = $props();

	const classes: Record<Variant, string> = {
		error: 'bg-[rgba(220,50,47,0.15)] text-status-red',
		warning: 'bg-[rgba(181,137,0,0.15)] text-status-yellow',
		ok: 'bg-[rgba(133,153,0,0.15)] text-status-green',
		info: 'bg-[rgba(38,139,210,0.15)] text-status-blue'
	};
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase leading-none tracking-wide {classes[variant]}"
>
	{@render children()}
</span>
