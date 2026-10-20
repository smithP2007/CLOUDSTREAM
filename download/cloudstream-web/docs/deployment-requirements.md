# Deployment Requirements — gaps that MUST be closed before serving this app to anyone

**Status:** living checklist (Phase 5). Everything listed here is a KNOWN, RECORDED gap —
none of it is resolved silently. Local-only development (the operator running the app for
themselves) is generally exempt from the *conveying*-related items; the moment the app or its
assets are served to any other person, these become hard requirements.
**2026-10-20 (D25):** the CSP/security-headers (§2) and core-integrity/notices (§1 partly,
§3) items below were IMPLEMENTED and verified in this session; the remaining unchecked
items stay honestly open.

---

## 1. FFmpeg WebAssembly core (GPL-2.0-or-later) — the hard one

The optional client-side conversion feature loads `@ffmpeg/core` **0.12.10**, whose build is
**GPL-2.0-or-later** (`--enable-gpl` + embedded libx264/libx265; verified from the actual
artifact during the Task 11 audit — see `media-compatibility.md` §5).

Serving the core (and, for distribution, the application that links it) to browsers is
**conveying** a GPL work. Before any deployment that enables conversion:

- [ ] Serve the **complete corresponding source** for the exact core build (pinned upstream
      tarball + the exact configure line recorded in `media-compatibility.md` §5) alongside it,
      or provide a written offer valid for three years. **REMAINING — operator deployment
      action; cannot be closed in code.**
- [x] Include the **GPL-2.0 license text** with the served product. **DONE (D25, 2026-10-20):**
      the verbatim text is vendored in `notices/GPL-2.0.txt` (SPDX license-list-data copy,
      sha256 `aaf135472f81c5b4a0dca9367e5bb5e9750032b5bebe5442b36e4c0a47430df3`) and the
      conversion-stack notices ship in `notices/THIRD-PARTY-NOTICES.md`, which
      `npm run fixtures:web` stages next to the served wrapper copies as
      `public/ffmpeg-lib/NOTICES.txt`.
- [x] Include **attribution/notices** in a visible notices file. **DONE (D25):**
      `notices/THIRD-PARTY-NOTICES.md` covers the served conversion stack (GPL core with
      pinned digests, MIT wrapper/util with the copyright line from their package metadata —
      the npm packages ship no LICENSE file; noted there). The full repository-wide
      NOTICE audit (all bundled deps, hls.js, shaka-player, Next/React, the repository's own
      license choice) remains the recorded Phase 7 task gated by D15-F.
- [x] Record the core artifact's **sha256** and re-verify on every upgrade. **DONE (D25):**
      the digests are pinned in `src/player/conversion/pinned-core-hashes.json` (they MATCH
      the audit values in `media-compatibility.md` §5 — verified against the installed
      artifact), enforced at RUNTIME by the conversion engine (fail-closed verification,
      below), and re-checkable on disk via `npm run verify:core`
      (`scripts/verify-ffmpeg-core.mjs`). On ANY version bump: update the JSON,
      `media-compatibility.md` §5, this file, and record a decision.
- devDependency status and keeping the ~31 MB core out of Git do **NOT** remove these
  obligations once the core is served to browsers.

The wrapper packages (`@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/util` 0.12.2) are **MIT**: ship their
copyright + license notices with any distribution. In the Next.js app they are served as
self-hosted ESM copies from `public/ffmpeg-lib/` (staged by `scripts/copy-fixtures-web.mjs`
from the pinned npm packages) — the same notices requirements apply to those served copies,
and the staged `NOTICES.txt` now travels with them (D25).

**Runtime integrity gate (D25, 2026-10-20).** The conversion engine now fetches both core
artifacts as bytes and verifies their SHA-256 against the pinned digests BEFORE anything is
instantiated; a mismatch throws the typed `conversion-core-integrity` error and nothing is
loaded or executed. The CDN fallback core (§3) is covered by the same gate.

## 2. Content Security Policy (CONFIGURED — D25, 2026-10-20)

**DONE (D25).** The Next.js app now serves a CSP plus the standard hardening headers
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Strict-Transport-Security` in production) on every route — pages AND API — via
`next.config.ts` `headers()` from the pure builder `src/app/_lib/securityHeaders.ts`
(one definition, unit-tested; dev-only relaxations (`'unsafe-eval'`, `ws:`) are
provably absent from the production policy). Empirical verification: the app e2e
suite asserts the served headers AND runs the whole product — including REAL
ffmpeg.wasm conversion and Mux HLS playback — under the production CSP with zero
CSP violations (tests/e2e-app/security-headers.spec.ts, conversion.spec.ts).

Required-and-verified policy shape: `default-src 'self'`; `script-src 'self'
'unsafe-inline' 'wasm-unsafe-eval' blob:`; `style-src 'self' 'unsafe-inline'`;
`img-src 'self' data:`; `media-src 'self' blob:` + the authorized demo hosts;
`connect-src 'self' blob:` + demo hosts + `unpkg.com`; `worker-src 'self'`;
`object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`.

Directive evidence (each relaxation verified empirically, not assumed):
- `'unsafe-inline'` in script-src: Next.js inline bootstrap requires it — REMAINING
  limitation until a nonce-based CSP (middleware) is adopted; recorded follow-up.
- `'wasm-unsafe-eval'`: ffmpeg.wasm compilation. Does NOT enable general JS `eval`
  (D19's no-JS-execution rule is unaffected — `eval`/`new Function`/`node:vm`
  remain absent from the codebase).
- `blob:` in script-src/connect-src: the conversion worker imports the D25-verified
  core module and fetches the verified wasm from blob: URLs (origin-created only);
  without it the worker import fails (`requestfailed: csp` — verified). The worker
  inherits this policy from its own response headers (`/ffmpeg-lib/worker.js`).
- `blob:` in media-src: hls.js/Shaka attach MSE through a blob: MediaSource URL;
  without it HLS/DASH playback is blocked (`media-src` violation — verified via the
  Mux e2e).
- `unpkg.com` in connect-src: the pinned-CDN core fallback (bytes are SHA-256
  verified before use — §3). The self-hosted core path needs no third-party
  connection and remains the recommended posture.
- REMAINING: re-verify the policy after any player/conversion dependency change;
  the conversion feature and HLS/DASH playback are covered by e2e under this CSP
  as of 2026-10-20.

## 3. Subresource Integrity for third-party loads

- [x] **CDN fallback core:** **DONE (D25, 2026-10-20).** The pinned unpkg CDN core is now
      fetched as bytes and SHA-256-verified against the audited digests
      (`pinned-core-hashes.json`) before anything is instantiated — fail closed with the
      typed `conversion-core-integrity` error on ANY mismatch. This is fetch+digest
      verification, equivalent to `<script integrity>` SRI for these loads (both artifacts
      arrive as bytes and are digested before use — nothing is executed in place). Honest
      scope note: the digests pin the npm-published artifact at the pinned version — they
      detect CDN tampering/drift and staging drift, but they cannot detect a compromised
      npm tarball at that exact version. Self-hosting the audited core
      (`npm run fixtures:ffmpeg-core` + mirror) remains the RECOMMENDED deployment posture;
      the runtime gate now protects both paths equally.
- [x] **No other third-party scripts/fonts/styles are loaded** (system font stack, local SVG
      posters, no analytics) — now ENFORCED by the CSP itself (`default-src 'self'`, no
      third-party script/style/font sources). Keep it that way.

## 4. Media relay and playback exposure (Phase 4 task 1 — not built)

- The relay-required path is an honest typed failure today. When the relay is ever built
  (D8 scope: authenticated users, quotas, no arbitrary-URL forwarding, kill switch), it needs
  its own security review — this document deliberately does NOT pre-approve it.

## 5. Provider/admin surface (not built)

- `GET /api/providers/health` is read-only and unauthenticated (fixture provider, no secrets,
  aggregate numbers only — D19 redaction rules hold). Before ANY deployment beyond private
  local use, gate it plus any future kill-switch admin surface behind authentication
  (POLICY.md §2; authenticated surface is a prerequisite decision).

## 6. Repository hygiene at deployment time

- `public/fixtures/` and `public/ffmpeg-lib/` are **gitignored runtime copies** — a deployment
  image must run `npm run fixtures:web` (and, for conversion, `npm run fixtures:ffmpeg-core`)
  during the build step. The production e2e (`npm run e2e:app`) already chains this.
- `demo/public/ffmpeg-core/`, `demo/public/ffmpeg-lib/` are gitignored (GPL core never committed).
