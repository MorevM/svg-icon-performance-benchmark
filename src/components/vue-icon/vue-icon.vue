<template>
	<component :is="iconComponent" />
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { Component } from 'vue';

	const $props = defineProps<{
		name: string;
	}>();

	const icons = import.meta.glob<Component>('~public/svg/*.svg', {
		base: '/.cache/public',
		eager: true,
		import: 'default',
		query: 'component',
	});

	const iconComponent = computed(() => icons[`./svg/${$props.name}.svg`]);
</script>
