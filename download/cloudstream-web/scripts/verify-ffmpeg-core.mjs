#!/usr/bin/env node
/**
 * Verifies the @ffmpeg/core artifacts present on disk against the pinned
 * SHA-256 digests in src/player/conversion/pinned-core-hashes.json (D25).
 *
 * Checked locations (skipped when absent):
 *   - node_modules/@ffmpeg/core/dist/esm        (the npm source of truth)
 *   - demo/public/ffmpeg-core                   (gitignored self-hosted copy)
 *   - public/ffmpeg-core                        (gitignored app-staged copy)
 *
 * Exits non-zero on ANY mismatch or when no artifacts exist at all. Run after
 * installing dependencies and after EVERY core version bump:
 *
 *   npm run verify:core
 *
 * Re-generating the pinned digests is a RECORDED change: update
 * pinned-core-hashes.json, docs/media-compatibility.md §5, and
 * docs/deployment-requirements.md §1 together (decision record required).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINNED_PATH = join(ROOT, 'src', 'player', 'conversion', 'pinned-core-hashes.json');

let pinned;
try {
  pinned = JSON.parse(readFileSync(PINNED_PATH, 'utf8'));
} catch (error) {
  console.error(`[verify:core] cannot read ${PINNED_PATH}: ${error.message}`);
  process.exit(1);
}
if (pinned?.version == null || pinned?.sha256 == null) {
  console.error('[verify:core] pinned-core-hashes.json is missing version/sha256 fields');
  process.exit(1);
}

const LOCATIONS = [
  ['node_modules (npm source)', join(ROOT, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')],
  ['demo self-hosted (gitignored)', join(ROOT, 'demo', 'public', 'ffmpeg-core')],
  ['app public (gitignored, staged)', join(ROOT, 'public', 'ffmpeg-core')],
];
const ARTIFACTS = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

let checked = 0;
let failures = 0;

for (const [label, dir] of LOCATIONS) {
  if (!existsSync(dir)) {
    console.log(`[verify:core] ${label}: not present (skipped)`);
    continue;
  }
  for (const file of ARTIFACTS) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      console.log(`[verify:core] ${label}/${file}: missing`);
      continue;
    }
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    const expected = pinned.sha256[file];
    checked += 1;
    if (actual === expected) {
      console.log(`[verify:core] OK       ${label}/${file} ${actual}`);
    } else {
      failures += 1;
      console.error(`[verify:core] MISMATCH ${label}/${file}`);
      console.error(`[verify:core]   expected (${pinned.version}): ${expected}`);
      console.error(`[verify:core]   actual:                    ${actual}`);
    }
  }
}

if (checked === 0) {
  console.error('[verify:core] no core artifacts found — run `npm install` and/or `npm run fixtures:ffmpeg-core` first');
  process.exit(1);
}
if (failures > 0) {
  console.error(`[verify:core] ${failures} artifact(s) FAILED verification — do not serve or load this core.`);
  process.exit(1);
}
console.log(`[verify:core] all ${checked} artifact(s) match the pinned @ffmpeg/core ${pinned.version} digests.`);
