import { combine, defineConfiguration, defineIgnores } from '@morev/eslint-config';

export default combine([
	defineIgnores({
		extraIgnoredGlobs: [
			'./reports/*',
			'*report.json',
			'*report.html',
		],
	}),
	defineConfiguration('javascript', {
		overrides: {
			// False positives
			'unicorn/no-unsafe-string-replacement': 'off',
		},
	}),
	defineConfiguration('browser'),
	defineConfiguration('node'),
	defineConfiguration('jsx'),
	defineConfiguration('json'),
	defineConfiguration('markdown'),
	defineConfiguration('yaml'),
	defineConfiguration('html'),
	defineConfiguration('typescript', {
		extraFileExtensions: ['vue'],
	}),
	defineConfiguration('astro'),
	defineConfiguration('vue'),
]);
