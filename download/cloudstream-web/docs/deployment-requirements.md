# Deployment Requirements — gaps that MUST be closed before serving this app to anyone

**Status:** living checklist (Phase 5). Everything listed here is a KNOWN, RECORDED gap —
none of it is resolved silently. Local-only development (the operator running the app for
themselves) is generally exempt from the *conveying*-related items; the moment the app or its
assets are served to any other person, these become hard requirements.

---

## 1. FFmpeg WebAssembly core (GPL-2.0-or-later) — the hard one

The optional client-side conversion feature loads `@ffmpeg/core` **0.12.10**, whose build is
**GPL-2.0-or-later** (`--enable-gpl` + embedded libx264/libx265; verified from the actual
artifact during the Task 11 audit — see `media-compatibility.md` §5).

Serving the core (and, for distribution, the application that links it) to browsers is
**conveying** a GPL work. Before any deployment that enables conversion:

- [ ] Serve the **complete corresponding source** for the exact core build (pinned upstream
      tarball + the exact configure line recorded in `media-compatibility.md` §5) alongside it,
      or provide a written offer valid for three years.
- [ ] Include the **GPL-2.0 license text** with the served product.
- [ ] Include **attribution/notices** (FFmpeg, x264, x265, and every enabled external library
      from the configure table) in a visible notices file.
- [ ] Record the core artifact's **sha256** and re-verify on every upgrade (the audit's value
      is recorded in `media-compatibility.md` §5; regenerate on version bumps).
- devDependency status and keeping the ~31 MB core out of Git do **NOT** remove these
  obligations once the core is served to browsers.

The wrapper packages (`@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/util` 0.12.2) are **MIT**: ship their
copyright + license notices with any distribution. In the Next.js app they are served as
self-hosted ESM copies from `public/ffmpeg-lib/` (staged by `scripts/copy-fixtures-web.mjs`
from the pinned npm packages) — the same notices requirements apply to those served copies.

## 2. Content Security Policy (not yet configured)

The app currently ships **no CSP** (only Next.js defaults). Required before public exposure:

- [ ] Define and test a CSP covering: `script-src` (Next chunks; **no `blob:`** needed for the
      app itself — the ffmpeg worker/core load from same-origin URLs), `worker-src 'self'`
      (conversion worker is a same-origin ESM module; the wrapper may also spawn blob: workers
      in some paths — verify against the served shim path before finalizing),
      `wasm-unsafe-eval` scoped as tightly as the browser allows for ffmpeg.wasm,
      `media-src 'self'` plus the **explicit list of authorized demo hosts** (mux/akamai/apple
      endpoints documented in the player demo and mock catalog), `img-src 'self' data:`
      (poster fallback), `connect-src` for the same media hosts + same-origin APIs.
- [ ] Add the standard security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
      `Permissions-Policy`, `Strict-Transport-Security` (TLS termination assumed).
- [ ] Re-verify the conversion feature and HLS/DASH playback under the final CSP (the typed
      player errors make regressions visible, but test explicitly).

## 3. Subresource Integrity for third-party loads

- [ ] **CDN fallback core:** when conversion is enabled without a self-hosted core, the pinned
      unpkg CDN core is fetched **without SRI** (recorded gap from Task 11). Self-hosting is
      the recommended deployment posture (`npm run fixtures:ffmpeg-core` + mirror); if the CDN
      path is kept, add integrity verification or accept and record the supply-chain risk
      explicitly.
- [ ] No other third-party scripts/fonts/styles are loaded (system font stack, local SVG
      posters, no analytics) — keep it that way.

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
