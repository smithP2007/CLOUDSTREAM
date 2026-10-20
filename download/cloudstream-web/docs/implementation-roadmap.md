# Implementation Roadmap — CloudStream-Inspired Web Application

**Deliverable:** a PC-browser application (movies, series, anime) inspired by CloudStream's architecture, built with Next.js + TypeScript, with server-side provider adapters and a browser-compatible player.
**Ordering principle:** phases are sequenced by *dependency* (each phase needs the previous one's interfaces) and by *risk retirement* (the riskiest unknowns — legal posture, provider feasibility, media proxying — are front-loaded).
**Evidence base:** `repository-analysis.md`, `provider-architecture.md`, `web-compatibility-report.md` (all grounded in `recloudstream/cloudstream@eb962b4`).

> Compliance gate: this roadmap assumes the application ships **first-party providers for lawful content only** (public-domain, Creative-Commons, user-configured personal media, or platforms whose terms permit access). No code is copied from upstream (GPL-3.0) and no closed-source extension is decompiled or redistributed.

---

## Phase 0 — Legal & product posture (no code)

**Goal:** remove the single largest project risk before writing code.
**Tasks:**

1. Define the content policy: which sources are allowed at launch (recommend: Internet Archive, public-domain catalogs, user-provided personal media URLs, and platforms with open APIs such as Dailymotion/Invidious/Twitch — the same *category* of lawful sources as the official `recloudstream/extensions` repo, whose five providers are all such platforms — **VERIFIED** repo listing).
2. Decide deployment audience (private/self-hosted vs public) — this changes proxy exposure, auth, and abuse controls.
3. Write NOTICE + licensing policy: GPL-3.0 compliance statement (no upstream code copied; architecture inspired by), third-party licenses audit process.
4. Define takedown/abuse contact and remote provider kill-switch requirement (mirrors `SitePlugin.status`, `RepositoryManager.kt:50–78`).

**Deliverable:** POLICY.md + decision record. **Exit criteria:** policy signed off by project owner.
**Risk retired:** legal posture (Critical in the risk register).

---

## Phase 1 — Contract layer (TypeScript types + provider interface)

**Goal:** encode the verified CloudStream contract as our own clean-room TypeScript interface. *No provider code yet.*
**Dependency:** Phase 0.
**Status:** ✅ Complete (2026-10-20) — all five tasks implemented in `src/core/` + `tests/` (91 vitest tests, typecheck/lint/build clean).
**Tasks:**

1. `src/core/types.ts` — value shapes mirroring verified semantics (not code):
   - `TvType` (18 values), `DubStatus`, `SearchQuality`
   - `SearchResponse` (+ `HomeRow`/`HomePageResponse`, `MainPageData`)
   - `LoadResponse` discriminated union: `MovieLoadResponse | TvSeriesLoadResponse | AnimeLoadResponse | LiveStreamLoadResponse`
   - `Episode { data: string; season?; episode?; name?; date?; ... }` — keep `data` opaque, exactly like upstream (`MainAPI.kt:2552`)
   - `PlaybackLink { url; type: 'video'|'hls'|'dash'; quality; headers?; referer?; subtitles? }` ← from `ExtractorLink` + `ExtractorLinkType` (`ExtractorApi.kt:417–444`); exclude `torrent|magnet` from v1
   - `SubtitleFile`
2. `src/core/provider.ts` — the adapter interface:
   ```ts
   interface Provider {
     readonly name: string; readonly mainUrl: string; readonly lang: string;
     readonly tvTypes: TvType[];
     getMainPage(page: number, req: MainPageRequest): Promise<HomePageResponse | null>;
     search(query: string, page: number): Promise<SearchPage | null>;
     quickSearch?(query: string): Promise<SearchResponse[]>;
     load(url: string): Promise<LoadResponse | null>;
     loadLinks(data: string, emit: (link: PlaybackLink | SubtitleFile) => void): Promise<boolean>;
   }
   ```
   Host semantics to honor (verified upstream behavior): host wraps every call in try/catch + timeout (upstream does this in `APIRepository.kt:204–220` with `withTimeout(loadLinksTimeoutMs)`), providers throw freely.
3. `src/core/registry.ts` — provider registry with newest-wins URL matching (mirrors `loadExtractor`, `ExtractorApi.kt:926–986`).
4. Zod schemas for all boundary payloads (untrusted data enters only via providers).
5. Unit tests encoding contract semantics (error boundary, timeout, dedupe).

**Deliverable:** `@app/core` package + tests. **Exit criteria:** contract tests green; interface reviewed against `provider-architecture.md` §1.
**Risk retired:** architecture drift; sets every later phase's vocabulary.

---

## Phase 2 — Server runtime services (the "host" equivalents)

**Goal:** build the server-side machinery that CloudStream's Android host provides.
**Dependency:** Phase 1.
**Status:** ◐ In progress — tasks 1–2 complete (2026-10-20): `src/server/http/` engine + guard (`D18`); tasks 3–5 pending.
**Tasks:**

1. **HTTP engine** (`src/server/http/`): fetch/undici client with cookie jar, per-provider UA/referer profiles, redirect + size + timeout caps, response caching with TTL (equivalent of nicehttp's `cacheTime` and the 20-min link cache, `RepoLinkGenerator.kt:73`).
2. **Hardening** (`src/server/http/guard.ts`): SSRF protection (private IP ranges, DNS rebinding checks), header normalization for anything we replay upstream (strip hop-by-hop/`Cookie`/`Host`), robots-considerate fetch policy.
3. **HTML/JSON toolkit:** cheerio + zod, plus a `p/a/c/k/e` (JsUnpacker-equivalent) unpacker and a sandboxed JS snippet runner (`node:vm` with no network/fs) for Rhino-style de-obfuscation needs — only if a provider requires it.
4. **Link pipeline** (`src/server/links/`): dedupe by URL, quality sort (`sortUrls` semantics, `MainAPI.kt:769–771`), subtitle name dedupe (`RepoLinkGenerator.kt:112–134`), TTL cache per `(provider, episodeId)`.
5. **Observability:** structured logs per provider call, health-check endpoint (`GET /api/providers/health`) feeding a kill-switch (remote `status` flag like `SitePlugin.status`).

**Deliverable:** runtime package + integration tests with recorded fixtures. **Exit criteria:** a mock provider end-to-end through registry → pipeline → JSON API.
**Risk retired:** security model (SSRF/SSUI) and the CORS execution environment.

---

## Phase 3 — First reference providers (riskiest feasibility work)

**Goal:** prove the adapter model against real, lawful targets — and explicitly NOT against closed-source pirated sources.
**Dependency:** Phase 2.
**Providers (recommendation, in build order):**

1. **Internet Archive** (`archive.org` APIs; public-domain films) — lowest legal risk, good HLS/MP4 mix.
2. **Dailymotion / Invidious / Twitch / YouTube-class** — matches the official upstream extension set (**VERIFIED**: `recloudstream/extensions` = Dailymotion, InternetArchive, Invidious, Twitch, Youtube); these exercise extractor-style URL resolution (`ExtractorApi` equivalent) and the media proxy.
3. *(Optional, post-launch)* **AniKoto-style anime aggregator** — implement from *behavioral observation only* of public endpoints (site + `api.ani.zip/mappings` mapper + embed hosts `megaplay.buzz`/`vidtube.site`/`vidwish.live` — static-dex findings in `web-compatibility-report.md` §4). Only after legal review; treat embed resolution as the high-churn component.

**Also in this phase:** the **extractor registry** for embed-host resolvers (prefix match newest-wins + Levenshtein mirror fallback — verified semantics; reuse the generic `ProviderRegistry` from Phase 1 `src/core/registry.ts` once the `Extractor` contract is introduced), and the **headless-browser fallback module** (Playwright) behind a per-provider flag for JS-challenge sites (replaces Android `WebViewResolver`; keep off by default).

**Deliverable:** 2+ working providers + conformance harness (recorded fixtures, regression tests per provider). **Exit criteria:** search → details → playable links for Internet Archive, verified in the UI-less API layer.
**Risk retired:** provider feasibility; anti-bot exposure; per-provider maintenance cost estimate.

---

## Phase 4 — Media proxy & playback stack

**Goal:** make links actually *play* in a PC browser.
**Dependency:** Phase 3 (real link shapes needed).
**Tasks:**

1. **Media relay** (`/api/media` route): streams manifests/segments server-side, injecting required `referer`/`headers` (the web replacement for ExoPlayer okhttp datasource + `getVideoInterceptor`, `MainAPI.kt:702`), with auth-gating, per-user quotas, no cross-user caching of protected media, range-request passthrough for seeking.
2. **Player component** (`src/player/`):
   - `video|mp4` → native `<video>`
   - `hls` → **hls.js** (incl. AES-128 encrypted HLS)
   - `dash` → **dash.js** or shaka-player
   - quality selection mirrors `sortUrls` + `ExtractorLinkType.getMimeType()` mapping (verified table in `web-compatibility-report.md` §5)
3. **Subtitle rendering:** map `SubtitleFile` (url+language) to `<track>` elements; fetch via proxy when headers are required.
4. **Playback session service:** link cache pre-warm on episode open; optional `extractorVerifierJob`-style keep-alive polling for providers that need it (`MainAPI.kt:679–681`).

**Deliverable:** player page + relay. **Exit criteria:** gapless seek + subtitle + quality switch on HLS and MP4 test fixtures.
**Risk retired:** playback compatibility (Medium) — the last major technical unknown.

---

## Phase 5 — Web application UX (Next.js App Router)

**Goal:** the visible product: browse, search, details, episodes, player.
**Dependency:** Phase 4 (player ready), Phase 1–3 (data).
**Tasks:**

1. **Routes:** `/` (home: rows from `getMainPage`, horizontal/vertical cards like `HomePageList.isHorizontalImages`), `/search?q=&page=`, `/title/[provider]/[url-hash]` (details: poster, plot, tags, actors, recommendations, sync IDs), `/watch/[...episode]` (player + episode list + source/subtitle pickers).
2. **State & data:** RSC for catalog pages (server-cached), TanStack Query for client-side pagination/infinite scroll (mirrors upstream `HomeViewModel` paging, `HomeViewModel.kt:247`).
3. **Design system:** dark-media-center aesthetic; poster cards with language/type badges from provider metadata (`lang`, `tvTypes`).
4. **Provider management UI:** list installed providers with health/status (kill-switch display), equivalent of upstream's extension list (minus user-installable dex).
5. **Accounts & progress:** watch history/continue-watching (per-user, server DB — SQLite/Prisma), play state per episode id (upstream keys watch state by episode id — `ResultViewModel2.kt:1372+` pattern).

**Deliverable:** complete browsing app. **Exit criteria:** E2E happy-path (home → search → details → play) on desktop Chromium/Firefox/Safari.
**Risk retired:** none new — this phase converts proven APIs into product.

---

## Phase 6 — Plugin/format compatibility & optional extensibility

**Goal:** decide how far to mirror the extension ecosystem without importing its trust model.
**Dependency:** Phase 5.
**Options (choose explicitly; default = A):**

- **A. Build-time providers.** Providers are npm modules in-repo; "extension" = enabled/disabled + configured via admin UI. Safest; no dynamic code.
- **B. Declarative providers.** A JSON/YAML DSL (URL patterns, selectors) interpreted by a generic scraping engine — no arbitrary code; covers simple sites; same spirit as the repo index (`repo.json`/`plugins.json` schemas verified in `RepositoryManager.kt:34–78`).
- **C. Sandboxed dynamic providers.** Third-party TS executed in an isolated sandbox (QuickJS/WASM or separate worker/VM) with capability grants (allowed hosts, no fs, rate-limited network through our guard). Highest flexibility, highest risk — only with a security review.

**Deliverable:** decision record + implemented option. **Exit criteria:** adding a new source requires zero core changes.

---

## Phase 7 — Hardening, docs, release

**Dependency:** all above.
**Tasks:** rate limiting + auth (especially the media relay), CSP/security headers, provider conformance CI (nightly live smoke + fixture regression), usage metrics for provider health, LICENSE/NOTICE audit, deployment guide (Docker), and the kill-switch tooling. **Exit criteria:** security checklist complete; docs published.

---

## Dependency graph (ordered by dependency & risk)

```
P0 Legal ──► P1 Contract ──► P2 Server runtime ──► P3 Providers ──► P4 Proxy+Player ──► P5 UX ──► P7 Release
                                       │                                    │
                                       └────────► P6 Extensibility ◄────────┘ (decide after both prove out)
```

## Effort & risk summary

| Phase | Est. effort | Main risk | Retired by |
|---|---|---|---|
| P0 | S | Legal | explicit posture |
| P1 | M | Architecture | contract tests |
| P2 | M | Security (SSRF/headers) | guard layer tests |
| P3 | L | Provider churn / anti-bot | 2 providers + harness |
| P4 | M | Media CORS/proxy | playback E2E |
| P5 | L | — | product E2E |
| P6 | S–M | plugin security | decision record |
| P7 | M | ops | checklist |

## The exact next implementation task

**Implement Phase 2, steps 3–5: HTML/JSON toolkit, link pipeline, and observability.**
1. **HTML/JSON toolkit**: cheerio + zod JSON parsing helpers, a `p/a/c/k/e` (JsUnpacker-equivalent)
   unpacker and a `node:vm`-sandboxed snippet runner (no network/fs) — only if a provider requires
   them.
2. **Link pipeline** (`src/server/links/`): dedupe by URL, quality sort (`sortUrls` semantics),
   subtitle name dedupe, TTL cache per `(provider, episodeId)` — reusing `src/core/links.ts`
   behaviors and `TtlCache`.
3. **Observability**: structured per-provider-call logging (via the engine's redacted event sink),
   `GET /api/providers/health` shape, and the provider kill-switch flag (mirrors
   `SitePlugin.status`, `RepositoryManager.kt:50–78`).

Everything builds on the now-complete engine + guard (D18): fetch through `HttpEngine`, validate
through the guard, unshorten link targets through the engine BEFORE registry lookups (per D16/D17).
Do NOT start real providers (Phase 3) until these are in and tested.
