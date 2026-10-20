/**
 * Next.js/Turbopack alias target for `@ffmpeg/util` (wired in next.config.ts
 * `turbopack.resolveAlias`). ONLY the Next build imports this module — Vite
 * (demo) and vitest keep using the pinned npm package.
 *
 * Runtime-loads the MIT util ESM build from the self-hosted, copy-script-
 * staged path `public/ffmpeg-lib/util/` (byte-identical copy of the pinned
 * npm package — see scripts/copy-fixtures-web.mjs).
 */
// The specifier is a runtime URL (browser-resolved against the origin). It is
// indirected through a variable so TypeScript treats the import as
// `Promise<any>` instead of trying to resolve the rooted path on disk.
const MODULE_URL = '/ffmpeg-lib/util/index.js';
const util = (await import(/* turbopackIgnore: true */ MODULE_URL)) as Record<string, unknown>;

function requireFunction(name: string): (...args: never[]) => unknown {
  const value = (util as Record<string, unknown>)[name];
  if (typeof value !== 'function') {
    throw new TypeError(`@ffmpeg/util build at /ffmpeg-lib/util/index.js is missing "${name}"`);
  }
  return value as (...args: never[]) => unknown;
}

export const toBlobURL = requireFunction('toBlobURL') as (url: string, mimeType: string) => Promise<string>;
export const fetchFile = requireFunction('fetchFile') as (file: Blob | URL | string) => Promise<Uint8Array>;
