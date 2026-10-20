#!/usr/bin/env node
/**
 * Deterministic poster generator for the mock fixture catalog (Phase 5).
 *
 * Writes one 300x450 SVG per catalog title into `public/posters/`. The output
 * is committed: posters are tiny text assets and the UI must never depend on a
 * network image service. Colors are derived from a stable hash of the slug, so
 * re-running the script always produces byte-identical files for the same
 * input list (no timestamps, no randomness).
 *
 * The title list here MUST cover every title in
 * src/server/providers/mock/catalog.ts — tests/app-catalog.test.ts asserts
 * that (poster file exists for every catalog title).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'posters');

/** slug -> display name (must mirror src/server/providers/mock/catalog.ts). */
const TITLES = [
  ['aurora-drift', 'Aurora Drift'],
  ['glasswing', 'Glasswing'],
  ['the-quiet-signal', 'The Quiet Signal'],
  ['paper-lanterns', 'Paper Lanterns'],
  ['silt-and-signal', 'Silt & Signal'],
  ['the-long-static', 'The Long Static'],
  ['meadow-loop', 'Meadow Loop'],
  ['northgate', 'Northgate'],
  ['harbor-lights', 'Harbor Lights'],
  ['starling-courier', 'Starling Courier'],
  ['inkfall', 'Inkfall'],
  ['harbor-lights-live', 'Harbor Lights Live'],
  ['open-airwaves', 'Open Airwaves'],
  ['testcard-one', 'Testcard One'],
  ['gated-vault', 'Gated Vault'],
];

function hash32(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function escapeXml(text) {
  return text.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

function initialsOf(name) {
  const words = name
    .replace(/&/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && w.toLowerCase() !== 'the');
  const picked = words.slice(0, 2).map((w) => w[0].toUpperCase());
  return picked.join('') || 'CS';
}

function posterFor(slug, name) {
  const h1 = hash32(slug) % 360;
  const h2 = (h1 + 40 + (hash32(`${slug}:hue2`) % 60)) % 360;
  const initials = initialsOf(name);
  const safeName = escapeXml(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450" role="img" aria-label="${safeName} poster">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h1} 45% 22%)"/>
      <stop offset="1" stop-color="hsl(${h2} 55% 10%)"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h1} 70% 75%)" stop-opacity="0.32"/>
      <stop offset="0.5" stop-color="hsl(${h2} 70% 60%)" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.25"/>
    </linearGradient>
  </defs>
  <rect width="300" height="450" fill="url(#bg)"/>
  <g stroke="hsl(${h1} 40% 60%)" stroke-opacity="0.14" fill="none">
    <circle cx="248" cy="70" r="46" stroke-width="1.5"/>
    <circle cx="248" cy="70" r="76" stroke-width="1"/>
    <path d="M0 320 L300 250" stroke-width="1"/>
    <path d="M0 360 L300 290" stroke-width="1"/>
    <path d="M0 400 L300 330" stroke-width="1"/>
  </g>
  <rect width="300" height="450" fill="url(#shine)"/>
  <text x="150" y="215" text-anchor="middle" font-family="system-ui, sans-serif" font-size="92" font-weight="700" fill="hsl(${h1} 85% 82%)" fill-opacity="0.9" letter-spacing="4">${escapeXml(initials)}</text>
  <rect x="24" y="392" width="60" height="3" rx="1.5" fill="hsl(${h2} 80% 70%)"/>
  <text x="24" y="424" font-family="system-ui, sans-serif" font-size="21" font-weight="600" fill="#e6edf3">${safeName}</text>
  <text x="276" y="34" text-anchor="end" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#8b949e" letter-spacing="2">FIXTURE</text>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
for (const [slug, name] of TITLES) {
  const file = join(OUT_DIR, `${slug}.svg`);
  writeFileSync(file, posterFor(slug, name), 'utf8');
  written += 1;
}
console.log(`posters: wrote ${written} deterministic SVGs to ${OUT_DIR}`);
