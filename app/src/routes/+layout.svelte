<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Scry</title>
</svelte:head>

{@render children()}
