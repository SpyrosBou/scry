<script lang="ts">
	import Badge from './Badge.svelte';

	interface Score {
		suite: 'functionality' | 'accessibility' | 'responsive' | 'visual';
		value: number | null;
		status: 'pass' | 'warn' | 'fail';
		href?: string;
	}

	const { scores }: { scores: Score[] } = $props();

	const borderColors: Record<string, string> = {
		functionality: 'border-t-status-blue',
		accessibility: 'border-t-status-green',
		responsive: 'border-t-status-yellow',
		visual: 'border-t-status-red'
	};

	const valueColors: Record<string, string> = {
		pass: 'text-status-green',
		warn: 'text-status-yellow',
		fail: 'text-status-red'
	};

	const badgeVariants: Record<string, 'ok' | 'warning' | 'error'> = {
		pass: 'ok',
		warn: 'warning',
		fail: 'error'
	};
</script>

<div class="grid grid-cols-4 gap-3 mb-5 max-md:grid-cols-2 max-sm:grid-cols-1">
	{#each scores as score}
		<a
			href={score.href ?? '#'}
			class="block rounded-md bg-elevated border border-border-subtle border-t-3 p-4 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md {borderColors[score.suite]}"
		>
			<div class="text-[2rem] font-bold font-body tabular-nums leading-none mb-1 {valueColors[score.status]}">
				{score.value ?? '—'}
			</div>
			<div class="text-xs text-text-secondary font-medium capitalize">{score.suite}</div>
			<div class="mt-1">
				<Badge variant={badgeVariants[score.status]}>
					{score.status === 'pass' ? 'Pass' : score.status === 'warn' ? 'Warn' : 'Fail'}
				</Badge>
			</div>
		</a>
	{/each}
</div>
