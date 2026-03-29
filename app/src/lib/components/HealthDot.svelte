<script lang="ts">
	type Status = 'green' | 'yellow' | 'red' | 'none' | 'running';

	const { status = 'none' }: { status?: Status } = $props();

	const classes: Record<Status, string> = {
		green: 'bg-status-green',
		yellow: 'bg-status-yellow',
		red: 'bg-status-red',
		none: 'bg-text-tertiary opacity-40',
		running: 'bg-gold animate-pulse-dot'
	};
</script>

<span class="size-2 shrink-0 rounded-full {classes[status]}"></span>
