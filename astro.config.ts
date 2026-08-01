import type { AstroIntegration } from 'astro';
import { defineConfig } from 'astro/config';
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vue from '@astrojs/vue';
import svgLoader from 'vite-svg-loader';
import { preparePublicAssets } from './src/utils/prepare-public-assets';

const reportsDirectory = new URL('./reports/', import.meta.url);
const sourcePublicDirectory = new URL('./public/', import.meta.url);
const generatedPublicDirectory = new URL('./.cache/public/', import.meta.url);
const deploymentSite = process.env.DEPLOYMENT_SITE;
const deploymentBase = process.env.DEPLOYMENT_BASE;

const svgCorpusIntegration: AstroIntegration = {
	name: 'svg-corpus',
	hooks: {
		'astro:config:setup': () => {
			preparePublicAssets(sourcePublicDirectory, generatedPublicDirectory);
		},
	},
};

const reportsIntegration: AstroIntegration = {
	name: 'benchmark-reports',
	hooks: {
		'astro:build:done': ({ dir }) => {
			if (!existsSync(reportsDirectory)) return;
			cpSync(reportsDirectory, new URL('./reports/', dir), { recursive: true });
		},
	},
};

// https://astro.build/config
export default defineConfig({
	...(deploymentBase?.length && { base: deploymentBase }),
	devToolbar: { enabled: false },
	publicDir: fileURLToPath(generatedPublicDirectory),
	...(deploymentSite && { site: deploymentSite }),
	integrations: [
		svgCorpusIntegration,
		vue(),
		reportsIntegration,
	],
	server: {
		open: true,
		port: 3000,
	},
	vite: {
		plugins: [
			// SVG files are optimized once while preparing the shared public corpus.
			svgLoader({ svgo: false }),
		],
		resolve: {
			tsconfigPaths: true,
			alias: [
				{ find: '~public', replacement: fileURLToPath(generatedPublicDirectory) },
				{ find: '~components', replacement: fileURLToPath(new URL('./src/components/', import.meta.url)) },
				{ find: '~assets', replacement: fileURLToPath(new URL('./src/assets/', import.meta.url)) },
			],
		},
		css: {
			preprocessorOptions: {
				scss: {
					loadPaths: ['~assets/styles'],
				},
			},
		},
	},
});
