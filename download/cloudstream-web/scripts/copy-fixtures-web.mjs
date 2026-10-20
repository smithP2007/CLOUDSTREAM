#!/usr/bin/env node
/**
 * Copies the demo media fixtures (and, when present, the gitignored
 * self-hosted ffmpeg.wasm core) into the Next.js app's `public/` directory so
 * the mock provider's /fixtures/* links resolve in the Phase 5 app.
 *
 * ALSO copies the pinned @ffmpeg/ffmpeg + @ffmpeg/util ESM builds (MIT) from
 * node_modules into `public/ffmpeg-lib/` — the conversion engine loads them
 * at runtime (they are never bundled; see src/player/conversion/
 * ffmpegConversion.ts DEFAULT_FFMPEG_LIB_BASE).
 *
 * The fixture copies are gitignored because the originals are the versioned
 * source of truth. Run automatically by `npm run e2e:app` and available
 * standalone as `npm run fixtures:web`.
 */
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_FIXTURES = join(ROOT, 'demo', 'public', 'fixtures');
const SRC_CORE = join(ROOT, 'demo', 'public', 'ffmpeg-core');
const WRAPPER_SRC = join(ROOT, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm');
const UTIL_SRC = join(ROOT, 'node_modules', '@ffmpeg', 'util', 'dist', 'esm');
const DEST_FIXTURES = join(ROOT, 'public', 'fixtures');
const DEST_CORE = join(ROOT, 'public', 'ffmpeg-core');
const DEST_LIB = join(ROOT, 'public', 'ffmpeg-lib');

if (!existsSync(SRC_FIXTURES)) {
  console.error(
    `fixtures:web: ${SRC_FIXTURES} is missing. Generate it first with "npm run fixtures:generate".`,
  );
  process.exit(1);
}

mkdirSync(join(ROOT, 'public'), { recursive: true });
cpSync(SRC_FIXTURES, DEST_FIXTURES, { recursive: true });

let coreBytes = 0;
if (existsSync(SRC_CORE)) {
  cpSync(SRC_CORE, DEST_CORE, { recursive: true });
  coreBytes = statSync(DEST_CORE).size;
  console.log(`fixtures:web: copied fixtures + self-hosted ffmpeg core (${coreBytes} bytes).`);
} else {
  console.log(
    'fixtures:web: copied fixtures. (No self-hosted ffmpeg core found — run "npm run fixtures:ffmpeg-core" and re-run this script to enable local conversion; otherwise conversion uses the pinned CDN core. See docs/media-compatibility.md.)',
  );
}

if (existsSync(WRAPPER_SRC) && existsSync(UTIL_SRC)) {
  mkdirSync(join(DEST_LIB, 'util'), { recursive: true });
  cpSync(WRAPPER_SRC, DEST_LIB, { recursive: true });
  cpSync(UTIL_SRC, join(DEST_LIB, 'util'), { recursive: true });
  console.log('fixtures:web: copied @ffmpeg/ffmpeg + @ffmpeg/util ESM builds into public/ffmpeg-lib/.');
} else {
  console.error('fixtures:web: @ffmpeg wrapper/util ESM builds missing — run "npm install".');
  process.exit(1);
}
