/**
 * Vite config for the DEV-ONLY player demo page (D23). Not part of the
 * library build (`tsc -p tsconfig.build.json` compiles `src/` only).
 *
 * - root `demo/` — the demo page source.
 * - publicDir `public/` — committed tiny fixtures under /fixtures/ plus the
 *   GITIGNORED self-hosted ffmpeg core under /ffmpeg-core/ (copy via
 *   `npm run fixtures:ffmpeg-core`).
 */
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
  },
});
