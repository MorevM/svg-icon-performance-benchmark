<template>
	<ul class="vue-icons-grid">
		<li v-for="(name, index) in items" :key="`${name}-${index}`">
			<slot :icon-name="name"></slot>
		</li>
	</ul>
</template>

<script setup lang="ts">
	defineProps<{
		items: string[];
	}>();

	defineSlots<{
		default: (props: { iconName: string }) => unknown;
	}>();
</script>

<style lang="scss" src="./vue-icons-grid.scss"></style>
