# Decision Record

Format: lightweight ADR. Each decision has an ID, status, context, decision, and consequences.
IDs ending in **-F** are *future decisions* — deliberately left open; they must be resolved by an
explicit new entry, never silently by implementation drift.

Started: Phase 0 (2026-10-20). Evidence base: `docs/repository-analysis.md`, `docs/provider-architecture.md`,
`docs/web-compatibility-report.md` (findings tagged VERIFIED/INFERRED/UNKNOWN at
`recloudstream/cloudstream@eb962b4`).

---

## D1 — Product target: browser-based media application for PC

- **Status:** Adopted (Phase 0)
- **Context:** CloudStream's architecture (provider contract + host services) is portable as a
  specification; its Android/Kotlin code and `.cs3` plugins are not browser-executable
  (`web-compatibility-report.md` §1). A PC-browser product needs server-side providers regardless.
- **Decision:** Build a browser-based media application (movies, series, anime) for PC use. The web
  UI runs in the browser; provider adapters and all network fetching run server-side. No Android app,
  no desktop-native shell.
- **Consequences:** CORS is neutralized by server-side fetching; playback must solve media-CORS via a
  relay (Phase 4). Mobile/casting/download features are out of scope until a new decision.

## D2 — Initial deployment: private / self-hosted MVP

- **Status:** Adopted (Phase 0)
- **Context:** Deployment audience drives proxy exposure, auth, and abuse controls
  (`implementation-roadmap.md` Phase 0 task 2). Public deployment raises legal exposure (risk
  register #1, #9).
- **Decision:** Launch as a private, self-hosted MVP for the operator (and directly invited users).
  Authentication is still required on media relay and admin surfaces.
- **Consequences:** Reduced (not eliminated) abuse exposure; takedown contact becomes mandatory only
  when a second party accesses the deployment (`POLICY.md` §6).
- **D2-F (future decision):** any public or shared deployment. Gate: legal review of the actual
  content-source set in use + abuse controls + takedown contact. **Unresolved.**

## D3 — Initial content sources: lawful categories only

- **Status:** Adopted (Phase 0)
- **Context:** Legal/copyright is the Critical risk (risk register #1). The official upstream
  extension repo ships only open-API platform providers (Dailymotion, InternetArchive, Invidious,
  Twitch, YouTube — VERIFIED), proving a lawful-category provider set is viable.
- **Decision:** Initial providers target: (1) public-domain content; (2) Creative Commons or
  similarly licensed content; (3) the operator's personal media; (4) services whose APIs and terms
  permit the intended use (verified per-service before implementation). Nothing else.
- **Consequences:** Every new provider needs a category check + terms review before code is written;
  the provider registry records its source category for auditability.
- **D3-F (future decision):** any provider outside these categories (e.g. an AniKoto-style anime
  aggregator observing public endpoints). Gate: explicit legal review of the endpoints' terms and
  jurisdictions, then a superseding decision. **Unresolved; deliberately deferred.**

## D4 — No copying of upstream CloudStream implementation code

- **Status:** Adopted (Phase 0)
- **Context:** Upstream is GPL-3.0 (`repository-analysis.md` §6, VERIFIED). Copying code would force
  this project to GPL-3.0 and complicate any future licensing choice.
- **Decision:** Clean-room TypeScript implementation. Upstream (and the `research/` clones) are used
  read-only as an architectural/behavioral specification, cited in `docs/`. No upstream source is
  vendored, translated line-by-line, or executed by this project.
- **Consequences:** Documentation citations refer to upstream paths/lines for *behavior* only;
  implementation is written from `docs/` descriptions. License remains freely choosable (D15-F).

## D5 — No reuse or decompilation of the closed-source AniKoto `.cs3`

- **Status:** Adopted (Phase 0)
- **Context:** AniKoto is distributed only as a compiled `.cs3` with **no license** (all rights
  reserved) — reuse or decompilation-derived code is legally unusable
  (`web-compatibility-report.md` §4, VERIFIED). Investigation used static inspection only; the package
  was never executed.
- **Decision:** No reuse, redistribution, or decompilation-derived code from AniKoto or any other
  closed-source/unlicensed extension. If an anime aggregator provider is ever built, it is written
  from public-endpoint behavior observation only — and only after D3-F is resolved.
- **Consequences:** AniKoto stays a *reference architecture example* in `docs/`; no strings, assets,
  or code from the binary enter this repository.

## D6 — Clean-room TypeScript provider implementation

- **Status:** Adopted (Phase 0, implemented Phase 1)
- **Context:** The portable asset is the contract (`MainAPI` semantics + data shapes, VERIFIED in
  `provider-architecture.md` §1–2), not the code. TypeScript/Next.js is the chosen stack for the web
  target.
- **Decision:** Providers are first-party TypeScript modules implementing the Phase 1 contract
  (`src/core/provider.ts`). Host services (error boundary, timeouts with `AbortSignal` cancellation,
  dedupe, quality sort, validation) are owned by the host, mirroring the verified upstream
  host-side responsibilities (`APIRepository.kt`, `RepoLinkGenerator.kt`).
- **Consequences:** Provider return data is untrusted input at the boundary and is Zod-validated;
  provider *code* is first-party and reviewed like any other source file. Terminology diverges from
  upstream where TypeScript ergonomics demand it (see D10, D11).

## D7 — No DRM circumvention

- **Status:** Adopted (Phase 0)
- **Context:** Upstream's contract carries Widevine/PlayReady/ClearKey constants
  (`ExtractorApi.kt:471–490`, VERIFIED); implementing DRM bypass is legally and ethically out of
  bounds, and Widevine requires licensed CDMs the project cannot obtain.
- **Decision:** The project implements no DRM circumvention. The Phase 1 playback-link type has **no
  DRM variant** (upstream `DrmExtractorLink` is deliberately not ported). Encrypted-media scope is
  limited to what the browser stack handles natively for permitted content (e.g. AES-128 HLS via
  hls.js).
- **D7-F (future decision):** ClearKey via EME for content the operator is licensed to decrypt.
  Default: not implemented. **Unresolved.**

## D8 — No unrestricted streaming proxies

- **Status:** Adopted (Phase 0)
- **Context:** A same-origin media relay is architecturally required for browser playback
  (`web-compatibility-report.md` §5, INFERRED), but an open relay is an abuse hotspot (risk #9) and a
  legal liability.
- **Decision:** No unrestricted streaming proxy. The future relay (Phase 4) is scoped: authenticated
  users, per-user quotas, request/range caps, referer/header injection restricted to provider-declared
  values, no cross-user caching of protected media, no arbitrary-URL forwarding, provider kill switch.
- **Consequences:** Playback availability is bounded by the relay's controls; "it would be more
  reliable as an open proxy" is not an acceptable argument at any phase.

## D9 — Investigation findings are the specification; evidence tags are normative

- **Status:** Adopted (investigation phase)
- **Context:** The four documents in `docs/` tag findings VERIFIED / INFERRED / UNKNOWN and cite
  upstream paths/lines at a pinned commit.
- **Decision:** Implementation follows the documented, verified semantics. Where implementation
  *cannot* follow them (TypeScript ergonomics, browser runtime differences), the divergence is
  recorded as a decision in this file — not silently introduced.
- **Consequences:** Divergences so far: D10 (enum encoding), D11 (naming), D12 (schema strictness).

## D10 — Enums are string literals, not upstream ordinals

- **Status:** Adopted (Phase 1)
- **Context:** Upstream `TvType` (MainAPI.kt:1120) assigns ordinal numbers 1–18; `DubStatus` and
  `SearchQuality` are plain enums. Numbers are an upstream serialization detail; string literals are
  debuggable and self-describing in JSON APIs.
- **Decision:** `TvType`, `DubStatus`, `SearchQuality`, and link types are **string literal unions**
  with the upstream member names (`Movie`, `AnimeMovie`, `TvSeries`, …). The upstream ordinal mapping
  is not carried; if drop-in `.cs3`-repo metadata compatibility is ever needed, a mapping table can be
  added then.
- **Consequences:** Wire format is human-readable; providers must use the exact literal names.

## D11 — Naming divergences from upstream (deliberate)

- **Status:** Adopted (Phase 1)
- **Context:** TypeScript contract readability vs upstream Kotlin names.
- **Decision:**
  - `ExtractorLink` → **`PlaybackLink`**; `ExtractorLinkType` → **`PlaybackLinkType`**
    (`'video' | 'hls' | 'dash'`), with upstream `TORRENT`/`MAGNET` excluded from v1 (upstream itself
    marks them "No support at the moment", `ExtractorApi.kt:427–431`).
  - `apiName` → **`providerName`**.
  - `HomePageList` stays, with **`HomeRow`** exported as an alias.
  - Upstream `LoadResponse`'s five variants collapse to **four** (`movie`, `tvSeries`, `anime`,
    `liveStream`), discriminated by a `kind` field; `TorrentLoadResponse` excluded (v1 scope, D8).
- **Consequences:** A mapping note in `src/core/types.ts` documents each divergence for reviewers.

## D12 — Boundary validation is strict-but-shallow (Zod, non-coercive)

- **Status:** Adopted (Phase 1)
- **Context:** Provider return data is untrusted input crossing into the host (risk register #4).
  Upstream relies on Kotlin's type system only; we need runtime validation for JSON-shaped data.
- **Decision:** All provider return values are validated with Zod before the host returns them:
  non-coercive (no `z.coerce`), unknown keys **stripped** (forward-compat), `null`-vs-missing
  modeled explicitly (`nullish`). Invalid items in a `loadLinks` emission stream are **dropped and
  counted** (never crash the stream, mirroring upstream's per-item `getSafeUrl` swallowing);
  an invalid *response object* fails the whole call with kind `validation`.
  `PlaybackLink.quality` is `number | null` — required, explicit unknown (upstream uses `Int` with 0
  as the de-facto unknown; `null` is cleaner and sorts deterministically last).
- **Consequences:** Providers must emit explicit `null` (not omit) for `quality`; schema/type drift
  is pinned by compile-time sample-assignment tests.

## D13 — Host owns errors, cancellation, and the deadline; providers stay plain

- **Status:** Adopted (Phase 1)
- **Context:** Verified upstream semantics: providers throw freely; `APIRepository` wraps every call
  with `safeApiCall` + `withTimeout` (`APIRepository.kt:85–220`); `withTimeout` unblocks the caller at
  the deadline while the abandoned coroutine is cancelled cooperatively.
- **Decision:** Mirrored in TypeScript: the host (1) catches every provider fault — sync or async —
  and returns a typed failure result; (2) enforces **per-method configurable timeouts**; (3) signals
  cancellation to providers through an `AbortSignal` carried in `CallContext` (the timeout aborts with
  a typed `TimeoutError` reason). **Honesty rule:** the host does *not* claim a provider promise was
  cancelled merely because it stopped waiting — a provider that ignores the signal may keep running
  detached; the deadline only bounds the host's wait. Callers may additionally pass their own
  `AbortSignal` (kind `aborted`), which propagates to the provider's signal.
- **Consequences:** `Promise.race` is used only to bound the *wait*, never to *claim* cancellation;
  the abort signal is the sole cancellation mechanism, and tests assert it actually fires.

## D14 — Roadmap Phase 1 task 3 (`src/core/registry.ts`) deferred, not skipped

- **Status:** Adopted (Phase 1 execution). **Implemented 2026-10-20 — matching semantics recorded as D16.**
- **Context:** The user instruction for Phase 1 scoped the deliverable to the contract
  (`types.ts`, `provider.ts`), Zod schemas, host behavior, and tests; the provider/extractor registry
  (newest-wins URL matching, `ExtractorApi.kt:926–986`) has no behavior test in this scope and gains
  value only once Phase 2/3 providers exist.
- **Decision:** `registry.ts` is the first task after this phase, still within roadmap Phase 1,
  before any Phase 2 work.
- **Consequences:** None structural; `provider-host.ts` and `links.ts` were added as the minimal
  helpers required to make the contract behaviors testable (per instruction). The registry was
  completed as the final Phase 1 task with its behavior pinned by 44 tests; see D16 for the
  matching-semantics decisions.

## D16 — Registry URL matching: consistent normalization, newest-wins prefix, conservative mirror fallback

- **Status:** Adopted (Phase 1, implemented in `src/core/registry.ts`)
- **Context:** Roadmap Phase 1 task 3. Upstream has two URL→registry resolvers: the provider-level
  `getApiFromUrlNull` (`MainAPI.kt:167` — naive raw `startsWith`, first-registered wins, no
  normalization) and the extractor-level `loadExtractor` (`ExtractorApi.kt:926–986` — normalized
  compare URL, reverse-order scan so *"the new registered ExtractorApi takes priority"*, then a
  mirror-domain fallback `Levenshtein.partialRatio(mainUrl, url) > 80`). The task instruction
  specifies newest-registered-wins prefix matching, i.e. the `loadExtractor` semantics.
- **Decision:** `ProviderRegistry` implements the `loadExtractor` two-stage algorithm, with these
  documented divergences/hardenings (all deterministic, all pinned by tests):
  1. **Consistent normalization on BOTH sides** (`normalizeProviderUrl`): trim, lowercase, strip
     `https://` / `http://` / protocol-relative `//` / bare-scheme prefix, strip one leading `www.`,
     strip trailing slashes. Upstream lowercases only the incoming URL and its `schemaStripRegex`
     misses `http:` — inconsistent; consistent normalization is the task instruction.
  2. **Prefix boundary check**: the character after the matched prefix must be end-of-string,
     `/`, `?`, `#` or `:`. Hardening beyond upstream's naive `startsWith`: a NEWER provider whose
     domain is a string-prefix of an OLDER provider's domain (`example.com` vs
     `example.company.net`) can no longer hijack the older provider's URLs.
  3. **Mirror fallback strictly per documented behavior**: Levenshtein partial ratio computed with
     the same normalization upstream's `Levenshtein.ratio` uses (substitution = 2, score =
     `(la + lb − dist) / (la + lb)`), strict `> 80`, threshold fixed (not configurable), scored over
     the SAME normalized strings (upstream compares raw strings; shared scheme prefixes would
     inflate scores — normalized inputs are strictly more conservative). Newest-first scan, first
     match wins — deterministic even when an older provider would score higher.
  4. **Inherent containment property** (documented for reviewers): a URL containing a provider's
     normalized `mainUrl` verbatim always scores 100 in the fallback, so the boundary check routes
     such URLs between stages / decides which provider wins — it cannot suppress the match.
     Upstream's overall end behavior is the same; look-alike-domain suppression belongs to the
     Phase 2 content/SSRF guard, not the registry.
  5. **No network unshortening**: upstream's step 1 (`unshortenLinkSafe`) is a network call; Phase 1
     is network-free. Link unshortening becomes a Phase 2 pre-step before registry lookup.
  6. **Fail-fast registration, never-throwing lookups**: registration validates the provider object
     (non-empty `name`, non-empty normalized `mainUrl`, callable methods — an empty pattern would
     prefix-match everything); lookups never throw and return `null` for malformed/empty/unknown
     URLs (no `URL` parsing — pure string logic). A different instance re-registered under an
     existing `name` replaces it at the newest position (mirrors the upstream clone-site override
     concept, `MainAPI.kt:506–520`); re-registering the identical instance is a no-op.
- **Consequences:** `getByUrl` returns a discriminated match (`method: 'prefix' | 'mirror'` plus the
  winning `score` for mirror matches) so callers can audit why a provider matched (D3 auditability).
  The registry holds first-party `Provider` objects only — no `.cs3` loading, no dynamic code, no
  network I/O. Phase 3's extractor registry can reuse the same class for `Extractor`-style resolvers.

---

## Open future decisions (summary)

| ID | Topic | Gate |
|---|---|---|
| D2-F | Public / shared deployment | legal review of live source set + abuse controls + takedown contact |
| D3-F | Any provider outside the lawful categories (incl. AniKoto-style) | explicit legal review, superseding decision |
| D6-F | Third-party/dynamic provider model (Phase 6 option B/C) | security review, sandbox design |
| D7-F | ClearKey via EME for licensed content | explicit decision; default off |
| D15-F | License selection for this repository | owner decision before any distribution (NOTICE audit, Phase 7) |
