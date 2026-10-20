/**
 * Security headers for the Phase 5 web application (D25; closes
 * docs/deployment-requirements.md §2).
 *
 * The builder is a pure module so `next.config.ts` (`headers()`) and the unit
 * tests share ONE definition, and the authorized media hosts are
 * cross-checked against the mock catalog by tests (single source of truth by
 * assertion, not by import — next.config.ts must stay dependency-light).
 *
 * RECORDED LIMITATIONS (not silent resolutions):
 * - `script-src 'unsafe-inline'`: Next.js's inline bootstrap/runtime scripts
 *   require it until a nonce-based CSP (middleware) is adopted. This is the
 *   standard Next.js App Router posture WITHOUT middleware; a nonce design is
 *   the recorded follow-up hardening step.
 * - `script-src 'wasm-unsafe-eval'`: required by ffmpeg.wasm (wasm
 *   compilation). It does NOT enable general JS `eval`.
 * - `connect-src https://unpkg.com`: the pinned-CDN core fallback for
 *   conversion. Bytes are SHA-256-verified before use (D25) and fail closed;
 *   the self-hosted core (`/ffmpeg-core`, staged by `npm run
 *   fixtures:ffmpeg-core` + `npm run fixtures:web`) needs no third-party
 *   connection and remains the recommended deployment posture.
 * - `script-src` / `connect-src` include `blob:`: REQUIRED for the verified
 *   core inside the conversion worker. The wrapper's worker does
 *   `await import(coreURL)` and `fetch(wasmURL)` — both blob: URLs created by
 *   THIS page from the D25-verified bytes — and the worker inherits the page
 *   CSP (headers() covers /ffmpeg-lib/worker.js). VERIFIED empirically
 *   (2026-10-20): without blob: the worker import fails (requestfailed
 *   'csp') and conversion reports a typed failure. blob: URLs can only be
 *   created by this origin, and page-context script execution is unchanged —
 *   no capability is added beyond the existing 'unsafe-inline' baseline.
 * - `worker-src 'self'`: the conversion worker is a same-origin ESM module
 *   (public/ffmpeg-lib/). If a future dependency path needs blob: workers,
 *   that must be verified and recorded BEFORE relaxing this.
 * - `media-src 'self' blob:`: REQUIRED for MSE-based playback — hls.js and
 *   Shaka attach their MediaSource through a blob: object URL, which 'self'
 *   does not cover. VERIFIED empirically (2026-10-20): without blob:, the
 *   Mux HLS e2e fails with a media-src violation and the video never
 *   advances. blob: media URLs can only be created BY this origin (MSE,
 *   File/converted-blob object URLs) — this adds no third-party capability.
 */

export type SecurityEnvironment = 'production' | 'development';

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Authorized public demo/test stream origins (documented provenance in
 * docs/media-compatibility.md and the mock catalog). The unit tests assert
 * this list stays in sync with src/server/providers/mock/catalog.ts.
 */
export const AUTHORIZED_MEDIA_HOSTS: readonly string[] = [
  'https://test-streams.mux.dev',
  'https://devstreaming-cdn.apple.com',
  'https://dash.akamaized.net',
  'https://interactive-examples.mdn.mozilla.net',
];

/** Pinned-CDN fallback host for the integrity-verified conversion core. */
export const CORE_CDN_HOST = 'https://unpkg.com';

export function buildContentSecurityPolicy(environment: SecurityEnvironment): string {
  const mediaSources = ["'self'", 'blob:', ...AUTHORIZED_MEDIA_HOSTS];
  const scriptSrc = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'blob:'];
  const connectSrc = ["'self'", 'blob:', ...AUTHORIZED_MEDIA_HOSTS, CORE_CDN_HOST];
  if (environment === 'development') {
    // React Refresh + Next HMR need eval; the HMR websocket needs ws:.
    // Development-only relaxations must NEVER appear in production (tested).
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push('ws:');
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `media-src ${mediaSources.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function buildSecurityHeaders(environment: SecurityEnvironment): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(environment) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), display-capture=()',
    },
  ];
  if (environment === 'production') {
    // TLS termination is assumed (docs/deployment-requirements.md §2); HSTS is
    // only meaningful in production and is omitted in development.
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains',
    });
  }
  return headers;
}
