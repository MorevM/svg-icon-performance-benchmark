import { defineConfig } from '@morev/stylelint-config';

export default defineConfig({
	bem: {
		files: [
			'./src/components/**/*.scss',
			'./src/layouts/**/*.scss',
		],
		rules: {
			'@morev/bem/no-block-properties': (rule) => rule.merge({
				ignoreBlocks: ['the-*', 'app-*', 'layout-*'],
			}),
		},
	},
});
