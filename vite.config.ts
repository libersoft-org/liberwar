import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function gitCommit(): string {
	try {
		return execSync('git rev-parse --short HEAD').toString().trim();
	} catch {
		return 'unknown';
	}
}

/** Build timestamp formatted as `YYYY-MM-DD HH:MM:SS UTC`. */
function buildDate(): string {
	const d = new Date();
	const p = (n: number): string => String(n).padStart(2, '0');
	const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
	const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
	return `${date} ${time} UTC`;
}

export default defineConfig({
	base: './',
	root: 'src',
	publicDir: '../public',
	define: {
		__COMMIT_ID__: JSON.stringify(gitCommit()),
		__BUILD_DATE__: JSON.stringify(buildDate()),
	},
	server: {
		host: true,
		allowedHosts: true,
		port: 3000,
		open: true,
	},
	build: {
		target: 'es2022',
		outDir: '../build',
		emptyOutDir: true,
		// Split pixi.js into its own vendor chunk: it rarely changes, so browsers
		// keep it cached across game updates (only the small app chunk re-downloads).
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [{ name: 'pixi', test: /node_modules[\\/]pixi/ }],
				},
			},
		},
		chunkSizeWarningLimit: 700,
	},
});
