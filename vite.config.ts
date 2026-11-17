// Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const COPYRIGHT = 'Copyright (c) 2026 AI-odyssey. All rights reserved. korea-policy-ontology';
const buildHash = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'dev';
  } catch {
    return 'dev';
  }
})();

// output.banner covers JS chunks only; CSS assets get the same line here.
const cssBanner = (): Plugin => ({
  name: 'css-banner',
  generateBundle(_, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'asset' && file.fileName.endsWith('.css')) file.source = `/*! ${COPYRIGHT} */\n${String(file.source)}`;
    }
  },
});

// base './' keeps asset URLs relative, so the build works on GitHub Pages under any repository name.
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react(), cssBanner()],
  define: { __BUILD_HASH__: JSON.stringify(buildHash) },
  build: {
    outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 2000,
    rolldownOptions: { output: { postBanner: `/*! ${COPYRIGHT} */` } }, // postBanner: added after minification
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
