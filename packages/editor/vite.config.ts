import { fileURLToPath } from 'node:url';
import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const PLAYER_MODULE = 'virtual:zennovel-player';
const RESOLVED_PLAYER_MODULE = '\0' + PLAYER_MODULE;

/**
 * "Export game" needs the game player as one self-contained script it can
 * paste into the exported index.html. This plugin builds
 * runtime/src/standalone.ts (no React, no editor code) in memory the first
 * time `virtual:zennovel-player` is imported, and exposes the result as a
 * string. In dev it is rebuilt when a runtime/core file it uses changes.
 */
function standalonePlayer(): Plugin {
  return {
    name: 'zennovel-standalone-player',
    resolveId(id) {
      return id === PLAYER_MODULE ? RESOLVED_PLAYER_MODULE : null;
    },
    async load(id) {
      if (id !== RESOLVED_PLAYER_MODULE) return null;
      const result = await build({
        configFile: false,
        logLevel: 'warn',
        publicDir: false,
        mode: 'production',
        build: {
          write: false,
          emptyOutDir: false,
          outDir: 'node_modules/.zennovel-player',
          minify: true,
          lib: {
            entry: fileURLToPath(new URL('../runtime/src/standalone.ts', import.meta.url)),
            formats: ['iife'],
            name: 'ZenNovelPlayer',
            fileName: () => 'zennovel-player.js',
          },
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      const chunk = outputs.flatMap((o) => ('output' in o ? o.output : [])).find((c) => c.type === 'chunk');
      if (!chunk || chunk.type !== 'chunk') throw new Error('Building the standalone game player produced no script');
      for (const file of chunk.moduleIds) if (!file.startsWith('\0')) this.addWatchFile(file);
      return `export default ${JSON.stringify(chunk.code)};`;
    },
  };
}

// GitHub Pages serves the site from /<repo>/, so the workflow sets BASE_PATH=/zennovel/.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), standalonePlayer()],
});
