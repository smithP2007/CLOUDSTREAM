# CloudStream Web

A browser-based movie, series and anime application **inspired by** [CloudStream](https://github.com/recloudstream/cloudstream) — designed to run in a PC browser without the Android app.

**Status: Phase 0–1 complete; Phase 2 steps 1–2 (HTTP engine + SSRF guard) complete; Phase 2 steps 3+ not started.**

## Policy & decisions

- [`POLICY.md`](POLICY.md) — product scope, deployment posture, content-source rules, technical-conduct rules (no DRM circumvention, no unrestricted proxy, no upstream/AniKoto reuse).
- [`docs/decisions.md`](docs/decisions.md) — decision record (D1–D14, D16–D18) with explicitly open future decisions (D2-F, D3-F, D6-F, D7-F, D15-F).

## Documentation

| Document | Contents |
|---|---|
| [`docs/repository-analysis.md`](docs/repository-analysis.md) | Upstream module map (`app/`, `shared/`, `library/`, `desktopApp/`), KMP build system, `.cs3` packaging, extension ecosystem, licenses |
| [`docs/provider-architecture.md`](docs/provider-architecture.md) | `MainAPI` contract, data model, extractor pipeline, host orchestration, end-to-end sequence |
| [`docs/web-compatibility-report.md`](docs/web-compatibility-report.md) | Why Android plugins can't run in browsers, reuse assessment, AniKoto case study, CORS/playback/security risk register |
| [`docs/implementation-roadmap.md`](docs/implementation-roadmap.md) | Phase 0–7 roadmap ordered by dependency & risk, with the exact next task |

## Phase 1 — contract layer (`src/core/`)

Clean-room TypeScript encoding of the verified CloudStream provider contract (see `docs/decisions.md` D6, D9–D14). No upstream code; providers are first-party only; all provider return data is Zod-validated at the boundary.

| Module | Contents |
|---|---|
| `src/core/types.ts` | Value shapes: `TvType` (18 members), `DubStatus`, `SearchQuality`, `SearchResponse`, `HomePageResponse`/`HomePageList` (+`HomeRow` alias), `LoadResponse` discriminated union (movie / tvSeries / anime / liveStream), `Episode` (opaque `data`), `PlaybackLink`, `SubtitleFile`, `ProviderResult` |
| `src/core/provider.ts` | `Provider` adapter interface (`getMainPage`/`search`/`quickSearch?`/`load`/`loadLinks`), `CallContext` (AbortSignal), per-method `ProviderTimeouts` + defaults |
| `src/core/schemas.ts` | Zod schemas for every provider-boundary payload (non-coercive, unknown keys stripped) |
| `src/core/links.ts` | Link pipeline: URL dedupe (first wins), quality sort (desc, unknown last, stable), subtitle dedupe, streaming-emission collector |
| `src/core/provider-host.ts` | The host: error boundary (typed `ProviderResult`, never throws for provider faults), per-method timeouts, timeout→`AbortSignal` cancellation with `TimeoutError` reason, boundary validation, caller cancellation |
| `src/core/registry.ts` | `ProviderRegistry`: typed ordered registry — URL normalization (scheme/case/`www.`/trailing slashes, both sides), newest-wins prefix + subdomain matching with a boundary check, structural (host-scoped) mirror-domain rule with informational Levenshtein score, never-throwing lookups (D17 hardening) |

Host semantics pinned by tests (`tests/`, vitest, 187 tests): error isolation between requests, per-method timeouts, real AbortSignal cancellation (a bare race never claims cancellation), dedupe/sort determinism, safe validation failures, consistent link+subtitle emission, and registry matching (exact/prefix/subdomain, newest-wins precedence, normalization, structural mirror rule, adversarial look-alike/suffix/path-query rejection, malformed URLs, deterministic ambiguity resolution).

## Phase 2 — server runtime (`src/server/http/`)

| Module | Contents |
|---|---|
| `guard.ts` | SSRF destination guard: scheme allowlist, credential rejection, hostname blocklist (localhost/local/internal/metadata), full IPv4+IPv6 non-public range policy (incl. WHATWG-normalized encoded forms, IPv4-mapped unwrapping, 6to4/NAT64/Teredo blocks), operator `approvedDestinations` exceptions |
| `dns.ts` | `GuardedDnsResolver`: resolves all A/AAAA records, validates EVERY one (fail closed on any non-public record), caches the validated set, and replaces undici's connector `lookup` so connections can only use validated addresses (anti-rebinding pinning) |
| `engine.ts` | `HttpEngine`: total-deadline timeouts + caller `AbortSignal`, manual redirect handling with per-hop re-validation (redirects can never reach prohibited destinations), cross-host credential stripping, response size cap, bounded TTL cache, typed `HttpResult` (never throws for expected failures), query-free events |
| `cookies.ts` | Per-provider RFC 6265-style cookie jar (opt-in): domain/path/secure/expiry rules, foreign-domain planting rejected, bounded |
| `headers.ts` | Header denylist normalization (hop-by-hop/`host`/`content-length`/`cookie`), injection checks, `redactHeadersForLog` |
| `cache.ts` | Generic bounded TTL+LRU cache (responses, DNS, robots) |
| `robots.ts` | RFC 9309-ish robots.txt gate: longest-match, allow-wins-ties, UA group specificity, 4xx=allow / 5xx+failure=disallow (fail closed), cached per host |

Engine behavior is pinned by `tests/http-guard.test.ts` (43 unit tests, mocked DNS, zero network) and `tests/http-engine.test.ts` (40 integration tests against a loopback-only node:http server with explicitly approved `127.0.0.1` — the real guard/DNS/pinning pipeline runs without touching the real network). Security posture and explicit limitations: `docs/decisions.md` D18.

## Commands

```bash
npm install
npm test        # vitest (187 tests)
npm run lint    # eslint
npm run typecheck
npm run build   # emits dist/ (bundler-consumed ESM + declarations)
```

## Key facts from the investigation

- Upstream is **GPL-3.0**; `library/` is a Kotlin Multiplatform core (android+jvm targets) with an aspirational, not-yet-compiled `webMain` source set. No web target ships today.
- `.cs3` extensions are ZIPs of `manifest.json` + `classes.dex` loaded via `PathClassLoader` — **cannot execute in a browser** (dex bytecode + Android runtime + CORS).
- Upstream's cross-platform mechanism (`isCrossPlatform` pure-JVM JARs, `jdeps`-verified) proves plugins can be written without Android APIs — the right *model*, still not browser-executable.
- The portable asset is the **contract** (provider interface + data shapes + extractor registry semantics), re-implemented clean-room in TypeScript (Phase 1, above).
- AniKoto (Phisher repo) is **closed-source, unlicensed**; only a compliant behavioral re-implementation against public endpoints is viable, and only after legal review (D3-F).

## Planned stack (recommended)

Next.js (App Router, TypeScript strict) · server-side provider adapters (undici + cookie jar + cheerio + zod) · hls.js / dash.js / native `<video>` playback behind an authenticated media relay · SQLite/Prisma user data.

## Compliance

No upstream code copied; no compiled extension executed or decompiled for code reuse; providers target lawful content only. See `POLICY.md` and `docs/implementation-roadmap.md` Phase 0.
