/**
 * Security headers for the Phase 5 web application (D25; closes
 * docs/deployment-requirements.md §2; D26 adds the nonce-based CSP).
 *
 * The builder is a pure module so `next.config.ts` (`headers()`), the D26
 * proxy (`src/proxy.ts`) and the unit tests share ONE definition, and the
 * authorized media hosts are cross-checked against the mock catalog by tests
 * (single source of truth by assertion, not by import — next.config.ts must
 * stay dependency-light).
 *
 * D26 (2026-10-20): the CSP is no longer served statically from
 * `next.config.ts`. `src/proxy.ts` generates a per-request nonce, builds the
 * policy with `buildContentSecurityPolicy(environment, { nonce })`, hands it
 * to Next.js through the REQUEST `Content-Security-Policy` header (Next.js
 * then stamps its own inline bootstrap/runtime scripts with that nonce), and
 * attaches it to the response. Production `script-src` therefore carries
 * `'nonce-…'` and NO `'unsafe-inline'`: an injected inline <script> without
 * the per-request nonce cannot execute. Pages are dynamically rendered
 * (`export const dynamic = 'force-dynamic'` in the root layout) — the
 * recorded trade-off: with a per-request nonce, pages CANNOT be statically
 * prerendered; the catalog is served from the in-process provider host with a
 * runtime kill switch, so per-request rendering is semantically honest.
 *
 * RECORDED LIMITATIONS (not silent resolutions):
 * - `style-src 'unsafe-inline'`: style ATTRIBUTES and Next.js-injected style
 *   elements require it. Removing it needs nonce'd/moved styles across the
 *   whole UI — a separate recorded follow-up, out of D26 scope. Script
 *   execution is unaffected by style-src.
 * - No `'strict-dynamic'` yet: D26 adopts plain nonce allow-listing
 *   (`'self'` stays valid for scripts). strict-dynamic is a further
 *   trust-model change and is deliberately NOT part of D26.
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
 *   THIS page from the D25-verified bytes. The worker file's OWN response
 *   policy (D26: the proxy matcher covers /ffmpeg-lib/worker.js) carries the
 *   same blob: sources. VERIFIED empirically (2026-10-20): without blob: the
 *   worker import fails (requestfailed 'csp') and conversion reports a typed
 *   failure. blob: URLs can only be created by this origin — this adds no
 *   third-party capability.
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

export interface CspOptions {
  /**
   * Per-request CSP nonce (D26). When set, production `script-src` becomes
   * `'nonce-…'`-based and drops `'unsafe-inline'`. Omit for the recorded
   * no-nonce baseline shape (unit tests pin both; production ALWAYS passes a
   * nonce via src/proxy.ts).
   */
  nonce?: string;
}

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

export function buildContentSecurityPolicy(
  environment: SecurityEnvironment,
  options: CspOptions = {},
): string {
  const mediaSources = ["'self'", 'blob:', ...AUTHORIZED_MEDIA_HOSTS];
  const scriptSrc = options.nonce
    ? ["'self'", `'nonce-${options.nonce}'`, "'wasm-unsafe-eval'", 'blob:']
    : ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'blob:'];
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

/**
 * The STATIC hardening headers served from `next.config.ts` `headers()`.
 * The Content-Security-Policy is deliberately NOT among them (D26): it is
 * per-request (nonce) and served by `src/proxy.ts`, which also covers pages,
 * API routes and the conversion worker file. Everything here is
 * environment-agnostic except HSTS (production only).
 */
export function buildSecurityHeaders(_environment: SecurityEnvironment): SecurityHeader[] {
  void _environment; // kept in the signature for call-site stability; HSTS toggles below
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), display-capture=()',
    },
  ];
  if (_environment === 'production') {
    // TLS termination is assumed (docs/deployment-requirements.md §2); HSTS is
    // only meaningful in production and is omitted in development.
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains',
    });
  }
  return headers;
}
