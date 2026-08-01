<template>
	<svg>
		<use :href="`#${name}`"></use>
	</svg>
</template>

<script setup lang="ts">
	defineProps<{
		name: string;
	}>();
</script>
