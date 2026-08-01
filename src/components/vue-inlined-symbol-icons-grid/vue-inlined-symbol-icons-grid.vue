<template>
	<vue-icons-grid :items>
		<template #default="{ iconName }">
			<vue-inlined-symbol-icon class="vue-icons-grid__icon" :name="iconName" />
		</template>
	</vue-icons-grid>
</template>

<script setup lang="ts">
	import VueIconsGrid from '~components/vue-icons-grid/vue-icons-grid.vue';
	import VueInlinedSymbolIcon from '~components/vue-inlined-symbol-icon/vue-inlined-symbol-icon.vue';

	defineProps<{
		items: string[];
	}>();
</script>
