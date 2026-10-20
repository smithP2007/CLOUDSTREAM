/**
 * Next.js/Turbopack alias target for `@ffmpeg/ffmpeg` (wired in
 * next.config.ts `turbopack.resolveAlias`). ONLY the Next build imports this
 * module — Vite (demo) and vitest keep using the pinned npm package.
 *
 * Turbopack cannot bundle @ffmpeg/ffmpeg 0.12.15: its `load()` constructs the
 * worker with `new Worker(new URL(classWorkerURL, import.meta.url))` where
 * `classWorkerURL` is a runtime value, which Turbopack's static analysis
 * rejects. This shim therefore loads the MIT wrapper ESM build at RUNTIME
 * from the self-hosted, copy-script-staged path `public/ffmpeg-lib/`
 * (byte-identical copy of the pinned npm package — see
 * scripts/copy-fixtures-web.mjs). `turbopackIgnore` keeps the bundler's
 * hands off the runtime specifier.
 *
 * Top-level await is required: the consumer's `await import('@ffmpeg/ffmpeg')`
 * must resolve to a namespace that synchronously exposes `FFmpeg`.
 */
// The specifier is a runtime URL (browser-resolved against the origin). It is
// indirected through a variable so TypeScript treats the import as
// `Promise<any>` instead of trying to resolve the rooted path on disk.
const MODULE_URL = '/ffmpeg-lib/index.js';
const mod = (await import(/* turbopackIgnore: true */ MODULE_URL)) as {
  FFmpeg: unknown;
};

export const FFmpeg = mod.FFmpeg as new () => unknown;
