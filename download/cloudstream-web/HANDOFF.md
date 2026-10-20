# HANDOFF — Read This First (AI Continuation Guide)

You are continuing development of **cloudstream-web**: a clean-room, browser-oriented
TypeScript implementation of the *architecture* (not the code) of the CloudStream
Android app. This file tells you exactly where the project stands, what the rules are,
and what to build next. Full history of every work session is in
[`docs/worklog.md`](docs/worklog.md).

## 0. Non-negotiable rules

1. **Clean-room discipline.** This project must never contain code copied from
   CloudStream or any of its extensions. Upstream source was only studied read-only to
   produce behavioral documentation. All behavioral knowledge you need is already
   captured in `docs/` with commit-pinned citations — do not re-import upstream code.
2. **Read [`POLICY.md`](POLICY.md) in full before writing any code.** It defines scope,
   lawful content categories, the no-upstream-code rule, the no-AniKoto rule (closed
   source, no license — behavioral reimplementation only), no DRM circumvention, no
   anti-bot bypass, no unrestricted media proxy, and kill-switch/takedown commitments.
3. **Phase 3 gate.** Do NOT start real provider integrations or media playback until
   the current phase is complete, verified, and the user has explicitly approved moving
   on. This instruction comes from the project owner and is repeated in the roadmap.
4. **Never weaken the SSRF guard or registry matching** without recording a new
   decision in `docs/decisions.md` with explicit security limitations. These components
   are deliberately conservative and fail closed.
5. **Append a work record to `docs/worklog.md`** after every work session (template at
   the bottom of this file).

## 1. Required reading order

1. `POLICY.md` — the law of this project
2. `docs/decisions.md` — D1–D18: every adopted decision, divergence from upstream, and
   open questions (D16 registry matching, D17 registry hardening, D18 HTTP engine +
   SSRF posture with 9 explicit security limitations)
3. `docs/implementation-roadmap.md` — phase plan; contains "The exact next
   implementation task" section, which is authoritative for what to do next
4. `docs/repository-analysis.md`, `docs/provider-architecture.md`,
   `docs/web-compatibility-report.md` — the reverse-engineering investigation (behavior
   spec, not source to copy)
5. `docs/worklog.md` — what every previous session actually did and verified

## 2. Current state (verified green at handoff time — Phase 5 + D25/D26 + D20 IA provider, 2026-10-21)

- **Complete:** Phase 0, Phase 1 (contract layer), Phase 2 (all steps), Phase 4 task 2
  (player stack, D21–D23, post-implementation audit commit series), **Phase 5** (the
  Next.js 16 web application — decision D24): home/search/details/watch/library/providers over
  a deterministic mock fixture provider, wired ONLY through `ProviderHost` + `LinkPipeline` +
  the D19 observability wrapper — and now **the first real provider (D20, adopted 2026-10-21):
  the Internet Archive public-domain film provider** (`src/server/providers/internetarchive/`).
  The media relay (Phase 4 task 1, D8) is still not built.
- **Tests: 453/453 vitest** across 25 files (incl. 38 new IA-provider tests, zero live calls)
  + **25/25 app e2e** (Playwright against the PRODUCTION `next build` via `next start`, under
  the production CSP) + **6/6 demo e2e** (includes 2 REAL ffmpeg.wasm conversion runs).
  NOTE: vitest must collect `.tsx` (include `*.test.{ts,tsx}`) — an earlier pattern silently
  skipped the component suites; do not regress that. NOTE 2: the app e2e REUSES a running
  server on port 3000 (`reuseExistingServer: true`) — kill stale `next-server` processes
  before e2e or you will test an OLD build (this bit this session: 14 phantom failures).
- **D25 deployment hardening (2026-10-20):** CSP + security headers on every route
  (`src/app/_lib/securityHeaders.ts`, unit-tested; `media-src`/`script-src`/`connect-src`
  `blob:` relaxations empirically verified), ffmpeg core SHA-256 verification DEFAULT-ON in
  the conversion engine (fail-closed `conversion-core-integrity`;
  `src/player/conversion/pinned-core-hashes.json` = the Task 11 audit digests), notices
  committed (`notices/`), `npm run verify:core` tooling.
- **D26 nonce CSP (2026-10-20):** the CSP is PER-REQUEST via `src/proxy.ts` (Next 16
  proxy = renamed middleware): production `script-src 'self' 'nonce-…' 'wasm-unsafe-eval'
  blob:` with NO `'unsafe-inline'`; pages are `force-dynamic` (recorded trade-off); the
  static `headers()` keeps only the nonce-independent hardening headers. Verified gotcha:
  read nonces via `script.nonce` (IDL) — browsers hide the content attribute after parse.
  Remaining: operator GPL source-offer (deployment-requirements §1), `style-src
  'unsafe-inline'` follow-up, Phase 7 NOTICE audit. The media relay (D8) is still not built.
- **D20 Internet Archive provider (2026-10-21):** ADOPTED (owner-approved in-session after the
  ToU gate closed: P1 robots captured, P3 dated ToU copy archived
  (`docs/evidence/archive-org-terms-of-use--2026-10-21.md`), favorable read-only-use review
  (`docs/evidence/ia-tou-review--2026-10-21.md`)). Provider enforces: curated collection pools
  PLUS mandatory per-item rights register (`register.ts` ↔ `docs/evidence/ia-rights-register.md`),
  anonymous reads only, identified UA, ≥1 req/s pacing + 429/Retry-After (pacer.ts),
  progressive-MP4-only links (HLS never emitted), access-restricted/lending items hard-refused,
  D18-engine-mediated fetches only, kill switch wired. `/api/search` takes a validated
  `provider` selector; the search UI has a catalog switcher. **PROVISIONAL STATE (honest):**
  P2a–P2f playback probes NOT run (no raw egress this session) → playback claims stay OFF;
  fixtures are documentation-pinned specimens (not byte-faithful); register identifiers are
  unverified candidates. `scripts/ia-probe.mjs` closes all of this from an egress-capable
  session — see checklist addendum §12 and deployment-requirements §7.
- **Verification battery:** `npm test` + `npm run typecheck` + `npm run lint` +
  `npm run build` (library → dist/) + `npm run build:app` (next build) + `npm run e2e` +
  `npm run e2e:app` — all green at handoff.
- **Stack:** Node >= 20 (developed on Node 24), TypeScript 5.9 strict, Next 16.4.2
  (App Router, Turbopack; dedicated `tsconfig.next.json` — the root tsconfig keeps
  `jsx: react-jsx` for the Vite demo), zod ^4.6.7, undici ^8.12.3, cheerio ^1, hls.js 1.7.3,
  shaka-player 5.3.1, @ffmpeg/* (see D24 shims), vitest ^5, playwright 1.64, eslint 9 flat.
- **Layout:**
  - `src/core/` — contract (types, schemas, provider, links, provider-host, registry)
  - `src/server/http/`, `src/server/parse/`, `src/server/links/`, `src/server/obs/` — runtime services
  - `src/server/providers/mock/` — deterministic fixture `Provider` + catalog data (app/tests only, never auto-registered)
  - `src/server/providers/internetarchive/` — the D20 real provider (provider + wire schemas +
    pacing + per-item rights register enforcement; live fixtures pending — see checklist §12)
  - `src/server/catalog/` — Phase 5 data-access layer + app runtime (kill switch, health, wrapped providers, pipeline)
  - `src/player/` — playback stack (+ `conversion/next-shims/` Turbopack alias targets)
  - `src/proxy.ts` — the D26 nonce-CSP proxy (Next 16 middleware convention)
  - `src/app/` — the Next.js app (pages, `_components`, `_lib`, `api/`) — EXCLUDED from the library build
  - `demo/` — dev-only player page; `public/posters/` — committed catalog SVGs;
    `public/fixtures/` + `public/ffmpeg-lib/` — gitignored runtime copies (staging scripts)
  - `docs/deployment-requirements.md` — licensing/SRI/CSP gaps that gate ANY deployment
- **Commands:** `npm ci && npm test && npm run typecheck && npm run lint && npm run build && npm run build:app && node scripts/copy-fixtures-web.mjs && npm run e2e:app`
  (conversion e2e additionally needs `npm run fixtures:ffmpeg-core`; verify core digests with `npm run verify:core`)

## 3. The exact next task (close D20's provisional state)

The Internet Archive provider EXISTS and is wired (see D20). The remaining work is the
**provisional-state closure**: run `node scripts/ia-probe.mjs` from an egress-capable session —
it re-verifies robots (P1), re-captures the ToU byte-faithfully (P3), runs playback probes
P2a–P2f, captures live fixtures 1–8, and verifies the rights-register identifiers. Then:
reconcile the wire schemas with real payloads, flip `identifierVerified` flags, re-record
evidence, and only then make playback claims. Independent remaining gates: the Phase 4 task 1
media-relay security review (D8) and any NEW provider beyond Internet Archive (each needs its
own pre-flight + ToU gate). Do not start any of these without explicit approval.

## 4. Gotchas learned the hard way (details in docs/decisions.md D17/D18/D19)

- Registry matching is **host-scoped** (D17): prefix stage plus explicit subdomain check
  plus a structural mirror rule. Never reintroduce full-URL fuzzy containment — that
  let hostile suffixes like `example.com.evil.io` hijack a provider.
- Guard/engine (D18):
  - WHATWG URL keeps brackets on IPv6 hostnames — strip before classifying.
  - IPv4-mapped IPv6 (`::ffff:127.0.0.1`) has `0xffff` at group 5 — group-index bugs
    here classify loopback as PUBLIC (this exact bug was caught by a test).
  - DNS validation must run before the robots gate on every hop, or DNS errors get
    masked.
  - Injected DNS resolvers must carry the same `approvedDestinations` as the engine
    (documented contract).
  - undici pools sockets per origin, so DNS re-pinning tests must use fresh origins.
- Tests use **real timers**; loopback test servers bind 127.0.0.1 and are allowed
  explicitly via `approvedDestinations` — no test ever contacts real private/metadata
  addresses.
- **There is no JavaScript execution anywhere in this project** (D19): no `eval`, no
  `new Function`, no `node:vm`. The `p/a/c/k/e` unpacker is a pure static string transform;
  its output is untrusted DATA. General JS execution is deferred behind a separately
  isolated runtime + security review (D6-F gate) — do not reintroduce it silently.
- The link pipeline NEVER caches credential-bearing links (authorization/cookie/token
  headers) under the shared scope — preserve that invariant when touching `src/server/links/`.

## 5. What is intentionally NOT in this repo

- **Upstream source code** (CloudStream / extensions clones) and the inspected AniKoto
  binary — excluded by policy. The docs are written to be self-sufficient: every
  upstream behavior is described with file/line citations and VERIFIED/INFERRED/UNKNOWN
  tags. Treat any need to "check upstream" as a prompt to rely on the docs instead.
- **Secrets / environment files** — none are committed. Keep it that way.

## 6. Work record protocol

After each session, append to `docs/worklog.md` (do not overwrite earlier entries):

```markdown
---
Task ID: <next sequential number>
Agent: <agent name>
Task: <what you were asked to do>

Work Log:
- <concrete step 1>
- <concrete step 2>

Stage Summary:
- <key results / decisions / artifacts; include actual verification numbers>
```
