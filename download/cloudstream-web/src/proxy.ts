/**
 * D26 nonce-based Content-Security-Policy (Next.js 16 `proxy` — the renamed
 * middleware convention; closes the D25 recorded follow-up).
 *
 * Per request:
 *  1. generate a fresh CSP nonce (`generateCspNonce`, base64url grammar);
 *  2. build the policy with the SHARED pure builder
 *     (`buildContentSecurityPolicy(environment, { nonce })` — one definition,
 *      unit-tested, identical shape to the D25 static policy minus
 *      `'unsafe-inline'` in script-src plus the nonce);
 *  3. put the policy on the REQUEST headers (`Content-Security-Policy` +
 *     `x-nonce`) — Next.js reads the nonce from the request CSP header and
 *     stamps its own inline bootstrap/runtime scripts with it;
 *  4. attach the policy to the RESPONSE for the browser to enforce.
 *
 * Result (production): `script-src 'self' 'nonce-…' 'wasm-unsafe-eval' blob:`
 * — an injected inline <script> WITHOUT the per-request nonce cannot execute.
 *
 * The matcher deliberately still covers pages, `/api/*`, `/ffmpeg-lib/*`
 * (the conversion worker's OWN response policy must carry the blob: sources —
 * D25 evidence), `/posters/*` and `/ffmpeg-core/*`; only immutable
 * `_next/static`, `_next/image` and `favicon.ico` are excluded (official
 * Next.js pattern — their responses are content-addressed and never carry
 * inline content, and a per-request nonce must not vary cache keys).
 *
 * Trade-off recorded in D26: with a per-request nonce every page is
 * dynamically rendered (`export const dynamic = 'force-dynamic'` in
 * `src/app/layout.tsx`) — static prerendering is intentionally disabled.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, type SecurityEnvironment } from './app/_lib/securityHeaders';
import { generateCspNonce } from './app/_lib/nonce';

function securityEnvironment(): SecurityEnvironment {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

export function proxy(request: NextRequest) {
  const nonce = generateCspNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(securityEnvironment(), { nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next.js immutable static assets (official
    // Next.js CSP pattern). API routes, pages, /ffmpeg-lib/worker.js and the
    // poster/core assets all keep receiving the per-request CSP.
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
