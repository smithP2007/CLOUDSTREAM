# CloudStream Web

A browser-based movie, series and anime application **inspired by** [CloudStream](https://github.com/recloudstream/cloudstream) — designed to run in a PC browser without the Android app.

**Status: Phase 0–1 complete; Phase 2 complete (steps 1–2: HTTP engine + SSRF guard; steps 3–5: parse toolkit + link pipeline + observability). Phase 3 (real providers) is gated on the pre-flight inspection checklist — see the roadmap's "exact next implementation task".**

## Policy & decisions

- [`POLICY.md`](POLICY.md) — product scope, deployment posture, content-source rules, technical-conduct rules (no DRM circumvention, no unrestricted proxy, no upstream/AniKoto reuse).
- [`docs/decisions.md`](docs/decisions.md) — decision record (D1–D14, D16–D19) with explicitly open future decisions (D2-F, D3-F, D6-F, D7-F, D15-F).

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

## Phase 2 — steps 3–5 (`src/server/parse/`, `src/server/links/`, `src/server/obs/`)

| Module | Contents |
|---|---|
| `parse/html.ts` | Cheerio toolkit: size-capped never-throwing parse, text/attribute extraction, absolutized `<a href>` link extraction (non-http(s) targets never resolved), bounded structured metadata (title/description/canonical/OpenGraph) |
| `parse/json.ts` | JSON boundary: size-capped `JSON.parse` (typed errors, never throws) + one-shot parse-and-Zod-validate with host-consistent issue formatting |
| `parse/packer.ts` | Deterministic `p/a/c/k/e` unpacker: PURE STATIC string transform (radix 2–62, `.split('|')` dictionaries, JS string-literal escapes) — never parses code, never evaluates; no `eval`/`new Function`/`node:vm` anywhere in the project (D19) |
| `links/pipeline.ts` | `LinkPipeline`: schema re-validation (drop-and-count), reuse of core dedupe/quality-sort, subtitle dedupe by normalized (language, url), bounded single-flight TTL cache per (scope, provider, episode) — default TTL mirrors the upstream 20-minute link cache; credential-bearing links are never cached under the shared scope |
| `obs/redact.ts` | Log redaction: URL credentials dropped, sensitive query params value-redacted, fragments dropped, message length caps; reuses the engine's header redactor |
| `obs/events.ts` | Structured provider-call events (start/end, duration, outcome, failure kinds incl. `killed`), engine-event forwarding, `wrapProvider` enforcement wrapper |
| `obs/kill-switch.ts` | In-memory provider kill switch (per-provider + global, with reasons) mirroring the upstream `SitePlugin.status` pattern; the remote admin surface is future work |
| `obs/health.ts` | `ProviderHealthTracker` (idle/ok/degraded/down/disabled transitions) + the future `GET /api/providers/health` response contract as Zod schemas |

**No JavaScript execution exists in this project** (owner instruction, D19): extracted/packed content is decoded as text only. General JS execution is deferred until a legitimate provider needs it, and then requires a separately isolated runtime and a security review (gated by D6-F). Test counts: `tests/html.test.ts` (12), `tests/json.test.ts` (10), `tests/packer.test.ts` (19), `tests/link-pipeline.test.ts` (16), `tests/observability.test.ts` (23).

## Phase 4 (task 2, partial) — player stack (`src/player/`)

Implemented **without** the media relay (Phase 4 task 1 — deferred; D21): local files + fixtures
+ authorized demo streams only; no real providers (Phase 3 stays gated on the D20 approval
process). Decisions: D21 (architecture/scope), D22 (dependencies + honest conversion scope),
D23 (demo/fixture policy). Compatibility evidence with per-claim verification status:
[`docs/media-compatibility.md`](docs/media-compatibility.md).

| Module | Contents |
|---|---|
| `types.ts`, `errors.ts` | Player vocabulary (reuses the shared `PlaybackLink`/`SubtitleFile` contract unchanged), typed `PlaybackError` codes |
| `formatSupport.ts` | Signature-based container sniffing (extensions are hints only) + runtime `canPlayType`/MSE probes |
| `playbackDecision.ts` | The testable decision flow: validate → relay-required → native → HLS/DASH → conversion offer → honest failure; bounded fallback ordering |
| `PlaybackController.ts` | Headless state machine: playlist, decision-gated playback, bounded source fallback, object-URL lifecycle, subtitles (SRT→VTT; provider tracks fetched once), dispose |
| `engines/` | Native `<video>`, HLS (hls.js, lazy, native-HLS fallback), DASH (Shaka Player, lazy) — strategy registry |
| `conversion/` | OPTIONAL client-side ffmpeg.wasm engine (lazy, cancellable, size-bounded, GPL core self-host-or-CDN, never bundled) |
| `MediaPlayer.tsx` + panels | Responsive player UI: transport + keyboard, source/quality selector, subtitle selector, playlist, conversion panel, accessible controls |

```bash
npm run demo                 # dev-only player page (NO providers; local files + fixtures + lawful demo streams)
npm run fixtures:generate    # regenerate tiny synthetic fixtures (ffmpeg CLI)
npm run fixtures:ffmpeg-core # self-host the pinned GPL ffmpeg core into gitignored demo/public/ffmpeg-core/
npx playwright test          # E2E against the demo page (deterministic, local fixtures)
```

## Commands

```bash
npm install
npm test        # vitest (341 tests: provider/HTTP/parsing suites + player suites)
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
