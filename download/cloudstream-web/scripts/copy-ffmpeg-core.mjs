#!/usr/bin/env node
/**
 * Copies the pinned @ffmpeg/core (devDependency, GPL-2.0-or-later) into the
 * demo's PUBLIC dir so the conversion engine can self-host it during local
 * development. The directory `demo/public/ffmpeg-core/` is GITIGNORED — the
 * ~32 MB core is never committed and never bundled into the library.
 *
 * The ESM build (dist/esm) is copied, NOT the UMD build: @ffmpeg/ffmpeg 0.12.15
 * spawns its internal worker with `{ type: "module" }`, where `importScripts`
 * does not exist, so its fallback does `await import(coreURL).default` — which
 * only the ESM core ("export default createFFmpegCore") can satisfy. Verified
 * empirically during the post-implementation audit (2026-10-20): the UMD core
 * under a module worker fails with ERROR_IMPORT_FAILURE ("failed to import
 * ffmpeg-core.js"); the ESM core loads and converts.
 *
 * ALSO copies the pinned @ffmpeg/ffmpeg + @ffmpeg/util ESM builds (both MIT)
 * into `demo/public/ffmpeg-lib/`: the NEXT.js build runtime-loads them from
 * such a path via its alias shims (src/player/conversion/next-shims/), and
 * staging them here keeps the demo server layout identical to the app's.
 * The Vite demo itself BUNDLES the npm packages (as audited) and does not
 * require this copy.
 *
 * Usage: npm run fixtures:ffmpeg-core
 */
import { cpSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const outDir = join(root, 'demo', 'public', 'ffmpeg-core');
const wrapperSrc = join(root, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm');
const utilSrc = join(root, 'node_modules', '@ffmpeg', 'util', 'dist', 'esm');
const libOut = join(root, 'demo', 'public', 'ffmpeg-lib');

if (!existsSync(srcDir)) {
  console.error('[ffmpeg-core] node_modules/@ffmpeg/core not found — run `npm install` first.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
let total = 0;
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const from = join(srcDir, file);
  const to = join(outDir, file);
  copyFileSync(from, to);
  const bytes = statSync(to).size;
  total += bytes;
  console.log(`[ffmpeg-core] copied ${file} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
}
console.log(`[ffmpeg-core] done — ${(total / 1024 / 1024).toFixed(1)} MiB in demo/public/ffmpeg-core/ (gitignored)`);

// Wrapper + util (MIT) ESM builds → demo/public/ffmpeg-lib/{,util/}
mkdirSync(join(libOut, 'util'), { recursive: true });
cpSync(wrapperSrc, libOut, { recursive: true });
cpSync(utilSrc, join(libOut, 'util'), { recursive: true });
console.log('[ffmpeg-lib] copied @ffmpeg/ffmpeg + @ffmpeg/util ESM builds into demo/public/ffmpeg-lib/ (gitignored)');
