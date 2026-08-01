<template>
	<vue-icons-grid :items>
		<template #default="{ iconName }">
			<vue-icon class="vue-icons-grid__icon" :name="iconName" />
		</template>
	</vue-icons-grid>
</template>

<script setup lang="ts">
	import VueIcon from '~components/vue-icon/vue-icon.vue';
	import VueIconsGrid from '~components/vue-icons-grid/vue-icons-grid.vue';

	defineProps<{
		items: string[];
	}>();
</script>
