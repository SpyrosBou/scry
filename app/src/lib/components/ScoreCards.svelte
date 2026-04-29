<script lang="ts">
	import Badge from './Badge.svelte';

	interface Score {
		suite: 'functionality' | 'accessibility' | 'responsive' | 'visual';
		value: number | null;
		status: 'pass' | 'warn' | 'fail' | 'unknown';
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
		fail: 'text-status-red',
		unknown: 'text-text-tertiary'
	};

	const badgeVariants: Record<string, 'ok' | 'warning' | 'error' | 'info'> = {
		pass: 'ok',
		warn: 'warning',
		fail: 'error',
		unknown: 'info'
	};

	const statusLabels: Record<string, string> = {
		pass: 'Pass',
		warn: 'Warn',
		fail: 'Fail',
		unknown: 'No Data'
	};
</script>

<div class="grid grid-cols-4 gap-3 mb-5 max-md:grid-cols-2 max-sm:grid-cols-1">
	{#each scores as score (score.suite)}
		{#if score.href}
			<a
				href={score.href}
				class="block rounded-md bg-elevated border border-border-subtle border-t-3 p-4 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md {borderColors[score.suite]}"
			>
				<div class="text-[2rem] font-bold font-body tabular-nums leading-none mb-1 {valueColors[score.status]}">
					{score.value ?? '—'}
				</div>
				<div class="text-xs text-text-secondary font-medium capitalize">{score.suite}</div>
				<div class="mt-1">
					<Badge variant={badgeVariants[score.status]}>
						{statusLabels[score.status]}
					</Badge>
				</div>
			</a>
		{:else}
			<div
				class="block rounded-md bg-elevated border border-border-subtle border-t-3 p-4 {borderColors[score.suite]}"
			>
				<div class="text-[2rem] font-bold font-body tabular-nums leading-none mb-1 {valueColors[score.status]}">
					{score.value ?? '—'}
				</div>
				<div class="text-xs text-text-secondary font-medium capitalize">{score.suite}</div>
				<div class="mt-1">
					<Badge variant={badgeVariants[score.status]}>
						{statusLabels[score.status]}
					</Badge>
				</div>
			</div>
		{/if}
	{/each}
</div>
