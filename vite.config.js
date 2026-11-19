import { defineConfig } from 'vite';

export default defineConfig({
	// Relative base: the demo is served from a sub-path (/thrust/).
	base: './',
	build: {
		// Keep bundled output apart from the runtime files copied from public/assets.
		assetsDir: 'bundle',
	},
});
