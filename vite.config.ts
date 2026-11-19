import { defineConfig } from 'vitest/config';

export default defineConfig({
	// Relative base: the demo is served from a sub-path (/thrust/).
	base: './',
	build: {
		// Keep bundled output apart from the runtime files copied from public/assets.
		assetsDir: 'bundle',
		// Phaser alone is well over Vite's default 500 kB warning threshold.
		chunkSizeWarningLimit: 2000,
	},
	test: {
		// Browser tests are tests/e2e/*.spec.ts, run by Playwright.
		include: ['tests/**/*.test.ts'],
	},
});
