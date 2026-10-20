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

## D17 — Registry hardening: host-scoped matching; structural mirror rule supersedes the score-gated fuzzy scan

- **Status:** Adopted (security review of D16, implemented in `src/core/registry.ts`)
- **Context:** D16 kept the documented upstream fuzzy fallback
  (`Levenshtein.partialRatio(mainUrl, url) > 80` over the FULL normalized URL). Review found that any
  URL containing a provider's `mainUrl` verbatim — in the path, the query, or a hostile subdomain
  position such as `example.com.evil.io` — scores 100 and selects the provider. Host-only scoring
  alone does not fix this (containment in a hostile suffix still scores 100), and no score threshold
  can separate `example.net` (legitimate mirror, ratio 72.7) from `example.com.evil.io` (attacker,
  100): the canonical upstream mirror example fails the upstream's own 80 gate, while the attack
  passes it.
- **Decision:** Matching in `getByUrl` is hardened to three checks inside the same newest-first scan
  order (newest-registered wins preserved):
  1. **Prefix** (unchanged): full normalized URL prefix + boundary character (end, `/`, `?`, `#`,
     `:`).
  2. **Subdomain** (new, explicit): the URL host equals the pattern host or is a label-boundary
     subdomain of it (`www2.example.com` for pattern `example.com`), for path-less patterns only.
     Safe by DNS delegation — only the pattern's operator can publish hosts under its own domain.
     Upstream had this behavior only accidentally (fuzzy score 100).
  3. **Mirror** (structural rule, replaces score-gated fuzzy): pattern host labels align to the TAIL
     of the URL host's labels with every label except the final one (TLD) exactly equal and the
     final label differing — `streamtape.to` ↔ `streamtape.com`, upstream's own comment example.
     Path-bearing patterns match by prefix only (no host-mirror). The reported `score` remains a
     Levenshtein partial ratio over hosts only, INFORMATIONAL — it does not gate. The
     `MIRROR_MATCH_THRESHOLD` constant was removed.
- **Divergences from upstream (deliberate, superseding D16.3):** host-scoped mirror/subdomain
  checks; structural mirror rule instead of `partialRatio > 80`; subdomain matching made explicit
  and deterministic; look-alike names (`examp1e.com`), domain-suffix attacks
  (`example.com.evil.io`), hostnames in path/query, and userinfo tricks (`example.com@evil.io`) can
  no longer select a provider. Upstream's naive `startsWith` + full-URL fuzzy accepted all of these.
- **Consequences / residual risks (explicit):** (a) exact name+TLD swaps (`example.com` ↔
  `example.click`) are indistinguishable from legitimate mirrors by URL structure alone — the
  mirror rule still trusts them; mitigation is provider curation (D3 review) + the provider kill
  switch, never registry logic. (b) Mirror matching does not use a public-suffix list — multi-label
  suffixes (`co.uk`) are handled conservatively (tail-equality never matches, so `bbc.co.uk`-style
  patterns only match exact/subdomain hosts). (c) Fuzzy typo-matching is GONE by design: a
  typo-squatted domain that is not an exact name+TLD swap will not resolve — fail-safe direction.
  Adversarial regressions for every vector above live in `tests/registry.test.ts`.

## D18 — HTTP engine + SSRF guard: posture, guarantees, and explicit security limitations

- **Status:** Adopted (Phase 2 steps 1–2, implemented in `src/server/http/`)
- **Context:** Roadmap Phase 2 tasks 1–2: the server-side HTTP engine (nicehttp equivalent) and the
  request guard. Every provider fetch is a server-side request to an operator-relevant destination,
  making SSRF the dominant security risk (risk register #4/#9).
- **Decision:** `HttpEngine` (undici-based) + `GuardedDnsResolver` + `validateDestinationUrl`, with
  these guarantees, each pinned by tests:
  1. **Schemes**: http/https only; embedded credentials rejected; unparseable URLs rejected.
  2. **Destination IP policy**: full non-public IPv4 range set (loopback, RFC1918, CGNAT,
     link-local incl. cloud metadata `169.254.169.254`, TEST-NETs, multicast, reserved, benchmarking,
     0/8) and IPv6 equivalents (loopback, ULA incl. `fd00:ec2::254`, link-local, multicast,
     discard, Teredo, 6to4, NAT64, documentation, mapped-IPv4 unwrapped and re-classified). WHATWG
     URL normalization is exploited defensively (decimal/hex/octal/short IPv4 forms normalize to
     dotted form before the guard sees them).
  3. **Hostname policy**: `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`, and
     known metadata/control hostnames are blocked WITHOUT any DNS call.
  4. **DNS rebinding**: resolution validates EVERY A/AAA record (fail closed on ANY non-public
     record — dual-record answers cannot slip through) and caches the validated set; undici's
     connector `lookup` is replaced by the guarded resolver, so the TCP connection can ONLY use
     addresses from the validated cache (SNI/Host stay the original hostname). Validation and
     connection cannot disagree: there is exactly one source of truth, and keep-alive pools never
     re-resolve.
  5. **Redirects**: followed manually; every `Location` re-enters the full pipeline (a redirect can
     never reach a prohibited destination — tested against the metadata IP); redirect count capped;
     301/302/303→GET, 307/308 preserve method+body; cross-HOST hops drop `authorization` and do not
     carry jar cookies (cookies are host-scoped per RFC 6265, so cross-PORT stays same-cookie —
     tested with distinct hostnames).
  6. **Limits**: total-deadline abort (timeout + caller `AbortSignal` + size cap share one
     cancellation path), hard response byte cap, bounded LRU response cache (TTL, entry count,
     bytes; `no-store`/`private`/`max-age` honored; set-cookie responses never cached).
  7. **Cookies**: RFC 6265-style jar, opt-in, ONE jar per engine instance (per provider);
     `Domain=` cannot be planted for foreign hosts; count/value caps.
  8. **Header hygiene**: caller headers pass a denylist (hop-by-hop, `host`, `content-length`,
     `cookie`) + injection checks (CR/LF/NUL rejected) + caps; `redactHeadersForLog` hides
     credential values; engine events carry origin+path only (never query strings or headers).
  9. **robots.txt**: RFC 9309-ish gate for GET/HEAD (longest-match, allow-wins-ties, `*`/`$`
     patterns, UA group specificity); 4xx → allow, 5xx/failure → DISALLOW with a short retry TTL
     (fail closed).
  10. **Approvals**: `approvedDestinations` is the ONLY private-destination exception (operator's
      own LAN/self-hosted services — content category D3.3); approvals override range/hostname
      blocks for the named host only, never scheme checks, credential rejection, or DNS pinning.
- **Explicit security limitations (must be re-reviewed before public deployment, D2-F gate):**
  1. This is a LIBRARY for first-party provider code — no HTTP surface accepts client-supplied
     URLs in this phase; the future media relay (Phase 4) needs its own auth/quota/kill-switch
     layer on top.
  2. DNS: the guarded resolver uses `dns.resolve*` (platform resolver, no `/etc/hosts`, no
     DNSSEC/DoH); a malicious resolver could still return attacker-controlled PUBLIC IPs — scoped
     by provider curation, not eliminated.
  3. Redirect policy allows http↔https downgrades (validated per hop); no HSTS tracking.
  4. Cookie jar implements no public-suffix list and ignores SameSite (server-side jar); `Domain=`
     beyond the setting host is rejected, but suffix acceptance without PSL is approximate.
  5. Response cache keys ignore `Vary` headers.
  6. No automatic response decompression (undici `request`); providers receive encoded bodies if
     they opt into encodings.
  7. Undici CVE surface is inherited; dependency pinning/audit happens in the Phase 7 NOTICE audit.
  8. `approvedDestinations` grants are operator-managed strings; approving a hostname whose DNS is
     attacker-controlled would validate whatever it resolves to (fail-closed elsewhere still
     applies).
  9. SSRF protection covers IP-literal, DNS, and redirect vectors tested here; it is NOT claimed
     complete against exotic vectors (e.g. HTTP/2 connect-style abuse, 0-RTT reuse across engines,
     TIME_WAIT hijacking on multi-user hosts).

## D19 — Phase 2 steps 3–5: parse toolkit (NO JS execution), link pipeline, observability

- **Status:** Adopted (Phase 2 steps 3–5, implemented in `src/server/parse/`, `src/server/links/`, `src/server/obs/`)
- **Context:** Roadmap Phase 2 tasks 3–5. The original roadmap wording suggested a
  `node:vm`-sandboxed snippet runner "for Rhino-style de-obfuscation". The owner instruction of
  2026-10-20 revised this explicitly: **do not execute extracted JavaScript** — no `eval`, no
  `new Function`, no `node:vm` as a security boundary (Node's own documentation warns that `vm`
  is not a security mechanism). Providers are first-party code (D6); page content is untrusted
  data and stays data.
- **Decision:**
  1. **Parse toolkit** (`src/server/parse/`): cheerio-based HTML helpers with input caps and
     never-throwing typed results (text/attributes, absolutized `<a href>` links — non-http(s)
     targets are never resolved — and bounded metadata); size-capped `JSON.parse` + one-shot
     parse-and-Zod-validate reusing the Phase 1 boundary schemas (D12).
  2. **`p/a/c/k/e` unpacker** (`parse/packer.ts`): a deterministic, first-party decoder for the
     widely documented Dean-Edwards-packer format — a PURE STATIC STRING TRANSFORM. It parses
     only the call's ARGUMENTS (payload, radix, count, `'|'`-separated dictionary, including the
     canonical `'<keys>'.split('|')` form) and substitutes radix-encoded tokens (2–62,
     `0-9a-zA-Z`, matching the canonical `e(c)` decoder) under word boundaries with a replacer
     FUNCTION (so `$`-patterns in dictionary values cannot corrupt output). It never parses the
     surrounding script as code and never evaluates anything. Typed failures for `notPacked`,
     `tooLarge`, `malformed`, `unsupportedRadix`; it never throws on hostile input.
  3. **Link pipeline** (`src/server/links/`): `LinkPipeline` re-validates every
     `PlaybackLink`/`SubtitleFile` against the Phase 1 schemas (drop-and-count, D12), reuses the
     core helpers (`dedupeLinks` first-wins, `sortLinksByQualityDesc` stable/unknown-last) and
     adds subtitle dedupe by NORMALIZED (language, url) — language trimmed + case-folded (BCP-47
     tags are case-insensitive; a deliberate, documented extension over the collector's exact-key
     dedupe), URL trimmed only (paths are case-sensitive). Results are cached in a bounded TTL
     cache keyed `(scope, providerName, episodeId)` with single-flight de-duplication; the
     default TTL (20 min) mirrors the verified upstream link cache (`RepoLinkGenerator.kt:73`).
     **Cross-user protection:** links carrying credential-bearing headers
     (`authorization`, cookies, API-token headers — name-based, case-insensitive) are NEVER
     cached under the default `shared` scope; they are cached only when the caller passes an
     explicit per-user scope, so credentialed playback results cannot leak across users.
     `TtlCache` gained a read-only additive `keys()` snapshot to support per-provider
     invalidation; no other engine/cache behavior changed.
  4. **Observability** (`src/server/obs/`): structured provider-call events (start/end with
     injectable-clock durations, outcome `success|failure|skipped`, failure kinds =
     `ProviderFailureKind` + `killed`), engine-event forwarding, and `wrapProvider` — the
     enforcement wrapper that checks the kill switch BEFORE every method call (refused calls
     throw the typed `ProviderDisabledError` and the provider is NOT invoked), classifies
     outcomes, and rethrows original errors unchanged. Redaction: header values via the engine's
     `redactHeadersForLog`; `redactUrlForLog` drops userinfo + fragments and value-redacts a
     denylist of sensitive query-parameter names; `redactEventMessage` re-redacts URLs inside
     free text and caps length; argument values and response bodies are absent from event shapes
     by construction. Health: `ProviderHealthTracker` with `idle → ok → degraded (≥1
     consecutive failure) → down (≥3)` plus `disabled` from the kill switch, counts/durations
     only (no payloads), deterministic snapshots, and the future `GET /api/providers/health`
     response contract pinned as Zod schemas (`ProviderHealthSnapshotSchema`) and self-validated
     in tests. Kill switch: in-memory per-provider + global switch with reasons, mirroring the
     upstream `SitePlugin.status` pattern (`RepositoryManager.kt:50–78`).
  5. **No HTTP surface in this phase.** No admin endpoint, no health endpoint, no unauthenticated
     management interface — the health API contract is a documented schema for the future
     authenticated server (POLICY.md §2 gate). No media relay (Phase 4), no real providers
     (Phase 3), no client-controlled URLs fed to the engine (D18 unchanged).
- **Deferred work (explicit):** general JavaScript execution for providers that legitimately
  require it (e.g. non-packer de-obfuscation) is NOT built. When a provider needs it, it
  requires a separately isolated runtime (WASM/QuickJS-class isolation or a dedicated process
  with capability grants) plus a security review — recorded as a gate on D6-F, not resolvable by
  implementation drift.
- **Consequences / limitations (explicit):**
  1. The unpacker covers the canonical algorithm (radix 2–62, common string escapes); exotic
     variants (radix > 62, self-modifying `e`/`d` bodies, non-canonical dictionaries) fail as
     typed errors or decode partially — the output is DATA, and callers must treat it as
     untrusted text, never as something to run.
  2. Log redaction is NAME-based (fixed denylists for headers and query params); a credential
     hidden under an unlisted non-standard parameter name could still appear in the narrow
     fields that carry URLs. Structural mitigation: provider-call events carry only
     provider/method/duration/outcome; URLs appear only in explicitly redacted fields.
  3. Health tracking and the kill switch are in-memory: state resets on restart, and nothing is
     shared across processes; the future API layer must re-apply operator policy on boot.
  4. The pipeline cache is per-instance memory; two processes never share resolved links, and
     credentialed results are isolated by scope — but scope VALUES are caller-supplied
     identifiers; the future server must map them to authenticated users.
  5. cheerio (^1.1) was added as the only new dependency (MIT; recorded per POLICY.md §6).

---

## D21 — Client-side playback stack: strategy-based player, NO media relay in this milestone

- **Status:** Adopted (2026-10-20, owner instruction) — implemented in `src/player/`
- **Context:** Roadmap Phase 4 pairs a media relay (task 1) with a player (task 2). The owner's
  media-support instruction authorizes the PLAYER milestone only — local files, fixtures and
  authorized demo streams — while Phase 3 (real providers) remains gated on the D20 approval
  process. No relay exists; building one is explicitly out of scope (D8 unchanged).
- **Decision:**
  1. **Strategy-based architecture** in `src/player/`: framework-agnostic core (`types.ts`,
     `formatSupport.ts`, `playbackDecision.ts`, `PlaybackController.ts`, `localMedia.ts`,
     `engines/*`, `conversion/*`) + thin React UI components. New engines register as strategies;
     the controller owns state, bounded source fallback, object-URL lifecycle and cleanup.
  2. **Engines:** native `<video>` (progressive MP4/WebM/etc.), HLS via hls.js (lazy) with native
     HLS fallback where the browser supports it, DASH via dash.js (lazy). Every engine attach is
     preceded by runtime capability detection (`MediaSource` presence, `canPlayType` probes) — a
     filename extension is never treated as proof of playability.
  3. **The shared contract is reused unchanged:** `PlaybackLink` (incl. `type: 'video'|'hls'|'dash'`)
     and `SubtitleFile`; quality selection reuses the core quality-sort semantics (desc, unknown
     last, stable). No new media types and no second link-resolution path.
  4. **Links that require headers/referer are NOT played and NOT proxied.** The decision flow
     classifies them as `relay-required` — surfaced as an explicit compatibility limitation
     pointing at the future authenticated, quota-limited relay (roadmap Phase 4 task 1, D8 scope) —
     and the player falls back to other sources. No client URL may trigger any server-side fetch
     in this milestone (there is no such endpoint).
  5. **Local conversion is client-side only** (ffmpeg.wasm, D22) and is OFFERED, never automatic:
     native playback is always attempted first; an explicit "Convert and play" action exists; no
     server-side transcoding service is built (a future one requires a separate security review).
  6. **Local media stays on the device:** files are opened via the File API + object URLs; nothing
     is uploaded to any server (no upload code path exists); large files are never read whole
     (container sniffing reads a bounded 4 KiB head slice).
- **Consequences:** header/referer-dependent provider sources stay unplayable until the relay
  decision; browser-support boundaries are honestly reported per runtime probe (see
  `docs/media-compatibility.md`); the player is independently testable without any provider.

## D22 — Playback dependencies: one library per purpose, lazily loaded, honest capability scope

- **Status:** Adopted (2026-10-20) — pinned in `package.json`
- **Context:** The player needs HLS/DASH engines and an optional client-side transcoder. Licenses
  and runtime payload must be recorded (POLICY §6) and the initial bundle must stay small.
- **Decision:**
  1. **hls.js 1.7.3 (Apache-2.0)** for HLS; **Shaka Player 5.3.1 (Apache-2.0)** for DASH — one
     library per purpose, both dynamically imported only when such a source plays (and only after
     `MediaSource` support is detected; native HLS fallback on Safari-class browsers). Neither is
     imported statically anywhere. **Finding:** the package published under the `dash.js` name in
     the registry accessed on 2026-10-20 (4.0.1) is NOT the MPEG-DASH player — its shipped
     typings declare an unrelated React UI kit (`DashboardLayout`, `lucide-react`) — so it was
     REJECTED on dependency-hygiene grounds and the task-sanctioned alternative (Shaka Player,
     `shaka-project/shaka-player`) is used for the contract's `dash` link type.
  2. **@ffmpeg/ffmpeg 0.12.15 + @ffmpeg/util 0.12.2 (both MIT)** as the conversion wrapper —
     dynamically imported only by the conversion module. **@ffmpeg/core 0.12.10 is
     GPL-2.0-or-later**; its pinned build was verified to include `--enable-gpl --enable-libx264
     --enable-libvpx --enable-libvorbis --enable-libtheora --enable-libopus --enable-libmp3lame
     --enable-zlib` (read from the binary). The core is a **devDependency**: a script copies it
     into the demo's gitignored public dir for self-hosted loading; the pinned CDN is the
     fallback. The core is NEVER statically imported, never bundled, and never committed.
     **Amendment (post-implementation audit, 2026-10-20):** the core MUST be the **ESM build**
     (`dist/esm`) — the wrapper's internal worker is `{ type: "module" }` where `importScripts`
     does not exist, so only the ESM core (`export default createFFmpegCore`) loads; the UMD
     build fails with `ERROR_IMPORT_FAILURE` (verified empirically; the default CDN base and the
     copy script were corrected). The audit also verified the full embedded configure line
     (adds `--enable-libx265 --enable-libwebp --enable-libfreetype --enable-libfribidi
     --enable-libass --enable-libzimg`; `--disable-autodetect` makes this table exhaustive) and
     confirmed via a REAL browser conversion run (see `docs/media-compatibility.md` §4–§5) that
     the pipeline works end-to-end. Serving the core to browsers conveys it — GPL-2.0 license
     text, corresponding-source links and notices are a DEPLOYMENT obligation (the npm packages
     ship no license file); recorded in media-compatibility §5 and flagged for the Phase 7
     NOTICE audit.
  3. **Conversion bounds & honesty:** input capped (default 1.5 GiB, well under the wasm32 2 GiB
     ceiling upstream documents); progress events are best-effort (upstream marks the progress
     hook experimental); cancellation terminates the FFmpeg worker; supported codecs are the
     build's table (H.264/VP8/VP9/Theora encode; AAC/MP3/Vorbis/Opus audio; broad decode set) —
     claims are limited to that table and to what tests verify.
  4. **UI/testing stack:** react/react-dom 19.3.1 (MIT) for player components; jsdom +
     @testing-library/react for component tests; vite 8 as the dev-only demo server (not part of
     the library build); eslint-plugin-react-hooks to pin effect/cleanup discipline.
- **Consequences:** the GPL core's license interaction is confined to an optional, runtime-loaded
  artifact and is flagged for the Phase 7 NOTICE audit (D15-F gate); if distribution terms ever
  conflict, the conversion strategy is replaceable or disablable without touching playback.
  Heavy engines absent from a bundle degrade to typed `engine-missing` errors, never crashes.

## D23 — Dev-only demo page and fixture policy: lawful sources only, no registry impact

- **Status:** Adopted (2026-10-20)
- **Context:** The player must be verifiable while Phase 3 is gated and no production UI exists
  (Phase 5). Demo media must be lawful, and the provider registry must stay untouched.
- **Decision:**
  1. `demo/` is a **Vite dev-server page** (`npm run demo`) — developer tooling only, excluded
     from the library build and from the provider system.
  2. Local-file testing uses the browser File API plus **tiny generated fixtures**
     (`scripts/generate-fixtures.sh`, sandbox ffmpeg CLI, ~1–2 s each: MP4/H.264+AAC,
     WebM/VP9+Opus, Ogg/Theora+Vorbis, MKV, AVI, MOV, a 1-segment HLS VOD, VTT/SRT subtitles).
     No copyrighted media is committed; provenance is documented in the script and README.
  3. Remote demo entries are **authorized/public test streams with recorded provenance**:
     Big Buck Bunny (© Blender Foundation, CC BY) served by public test endpoints (Mux test
     streams, Apple HLS example stream, Akamai/DASH-IF test vector) and MDN's CC0 sample video.
     They are loaded only on the demo page, clearly labeled; live availability is NOT guaranteed
     and failures surface as typed network errors.
  4. The demo page wires `PlaybackLink` **fixtures defined in the demo itself** — it never calls
     `ProviderRegistry`, registers no provider, and ships no provider code.
- **Consequences:** the demo needs internet access for the third-party streams (degrades
  gracefully); fixture regeneration requires the ffmpeg CLI locally; nothing in `demo/` is
  reachable from the library's public surface.

---

## D24 — Phase 5 web application (Next.js App Router): integration decisions

- **Status:** Adopted (Phase 5, 2026-10-20)
- **Context:** the visible product (roadmap Phase 5) converts the completed Phase 1/2/4
  machinery into a browsable application. The task scope: dark-themed home rows, search with
  full UI states, title details, a watch page reusing the EXISTING `MediaPlayer`, a local
  library, deterministic mock data — with no real providers (D20 gate untouched), no media
  relay (D8), and no weakened security (D18/D19 machinery reused, never bypassed).
- **Decision:**
  1. **Single package, dedicated TS config.** The app lives in `src/app/` inside the existing
     package (`next@16.4.2`, App Router, Turbopack). `next dev/build` uses
     `tsconfig.next.json` via `typescript.tsconfigPath` so Next NEVER rewrites the library's
     root `tsconfig.json` (the Vite demo depends on `jsx: react-jsx`). The library build
     (`tsc -p tsconfig.build.json`) excludes `src/app`.
  2. **One provider system only.** The fixture catalog is a REAL `Provider` implementation
     (`src/server/providers/mock/`) registered by the app runtime and NEVER by the library.
     All app data flows through the existing `ProviderHost` (D13 boundary, D12 validation) +
     `LinkPipeline` (dedupe/sort/TTL cache) + the D19 observability wrapper
     (`wrapProvider` + kill switch + health tracker). No second provider abstraction exists.
  3. **Opaque route tokens.** `/title/[provider]/[hash]` and
     `/watch/[provider]/[title]/[data]` carry the provider-opaque detail URL / episode `data`
     as canonical base64url tokens (strict fail-closed decoder; the app never inspects them —
     Phase 1 opacity rule preserved).
  4. **React StrictMode is ON** (`reactStrictMode: true`). `usePlaybackController` is
     StrictMode-safe by design (it swaps a disposed controller during render); the component
     test suite pins the no-duplicate-playlist behavior under StrictMode, and the Phase 5
     app-side effects (auto-start, subtitle preference) are keyed by controller instance so a
     StrictMode dispose/swap re-applies exactly once.
  5. **MediaPlayer gains two opt-in, additive props** (no forks, no duplicated vocabulary):
     `preferredSubtitleLanguage` (fills an EMPTY subtitle selection once per
     controller+track-list; explicit user choices always win) and `autoStart` (plays the best
     provider source once on the watch page through the normal decision pipeline; the demo
     keeps manual start). Audio-track selection is NOT implemented anywhere: the Phase 1
     contract defers `audioTracks` beyond v1, and no audio-track control exists in the player
     — recorded honestly rather than faked.
  6. **User data is LOCAL-ONLY.** Favorites, recent playback, and the subtitle-language
     preference persist in `localStorage` (`csw.library.v1`, `csw.prefs.v1`) — nothing is
     transmitted, and there is no server DB. The roadmap's per-user server DB (Phase 5 task 5)
     is deferred to the authenticated-surface work (POLICY.md §2 gate); this is a deliberate,
     recorded deferral, not a silent drop.
  7. **ffmpeg.wasm under Turbopack.** Turbopack cannot bundle `@ffmpeg/ffmpeg` 0.12.15 (its
     runtime-value `classWorkerURL` Worker construct defeats static analysis). The Next build
     aliases both MIT packages (`@ffmpeg/ffmpeg`, `@ffmpeg/util`) to runtime-loader shims
     (`src/player/conversion/next-shims/`) that load the pinned, self-hosted ESM copies from
     `public/ffmpeg-lib/` (staged by `scripts/copy-fixtures-web.mjs`). The Vite demo keeps the
     npm-bundled loader exactly as audited (D22 amendment covers the core; serving obligations
     in `docs/deployment-requirements.md`).
  8. **Kill-switch display only.** `/providers` and `GET /api/providers/health` (the D19
     contract, now actually served) DISPLAY health + kill-switch state. There is deliberately
     no admin/mutation surface: remote kill-switch administration requires the authenticated
     admin surface decision (D19, POLICY.md §2).
- **Consequences:** the app works fully offline against fixtures (authorized demo streams
  degrade to typed errors); home renders through the provider machinery at request time;
  search pagination rides the deterministic fixture catalog; all Phase 5 pages are covered by
  unit tests (395 total) and 18 Playwright app e2e tests against the PRODUCTION build,
  including real playback (local MP4 fixture), the honest relay-required failure (never
  fetched), and — when egress exists — the authorized Mux HLS demo stream.

---

## D25 — Deployment hardening: CSP + security headers, integrity-verified ffmpeg core, notices

- **Status:** Adopted (2026-10-20). Closes the non-gated items of
  `docs/deployment-requirements.md` §1 (partly), §2 and §3. Does NOT touch Phase 3
  providers (D20 gate), the media relay (D8), or any D18/D19 machinery.
- **Context:** the Phase 5 app shipped with the recorded deployment gaps: no CSP, no
  security headers, the ffmpeg.wasm core fetched WITHOUT integrity verification, and no
  license/notices packaging for the served conversion stack. The owner asked for "the next
  thing"; every remaining roadmap step is a gated decision (D20/D8), so the deployment
  checklist — the one authoritative non-gated queue — was the next thing.
- **Decision:**
  1. **CSP + security headers** on every route (pages and API) via `next.config.ts`
     `headers()`, built by the pure, unit-tested module `src/app/_lib/securityHeaders.ts`.
     Dev-only relaxations (React Refresh `'unsafe-eval'`, HMR `ws:`) are provably absent
     from the production policy. Every relaxation is empirically verified with e2e
     evidence: `media-src blob:` (MSE MediaSource for hls.js/Shaka — without it the Mux
     HLS e2e fails), `script-src`/`connect-src` `blob:` (the conversion worker imports the
     verified core module from an origin-created blob: URL; without it the import fails
     with `requestfailed: csp`), `'wasm-unsafe-eval'` (wasm compilation only — D19's
     no-JS-execution rule unaffected), `'unsafe-inline'` (Next.js bootstrap — REMAINING
     limitation until a nonce/middleware CSP; recorded, not silently accepted).
  2. **Integrity-verified core loading (default ON).** The conversion engine fetches both
     core artifacts as bytes and verifies SHA-256 against `pinned-core-hashes.json` (the
     Task 11 audit digests, re-verified against the installed artifact — all six on-disk
     copies match) BEFORE instantiating anything; mismatch fails CLOSED with the new typed
     `conversion-core-integrity` error. `coreIntegrity: false` remains for recorded
     deployments with a different pinned build. Verified blob URLs are revoked after
     `load()` (bounded memory across retries). CDN fallback (§3) gets the same gate.
  3. **Notices + tooling.** `notices/GPL-2.0.txt` (verbatim SPDX copy) and
     `notices/THIRD-PARTY-NOTICES.md` (conversion stack; full NOTICE audit stays Phase 7 /
     D15-F) are committed; `fixtures:web` stages `NOTICES.txt` next to the served wrapper
     copies; `npm run verify:core` re-verifies any on-disk core against the pins.
- **Consequences:** verified battery 2026-10-20 — vitest 410/410 (24 files; +15 new:
  9 integrity, 6 security-headers, incl. the audit-digest triple-lock and the
  catalog↔CSP host-sync check), tsc/eslint/library-build/next-build clean, app e2e
  22/22 against the PRODUCTION build under the production CSP (incl. REAL ffmpeg.wasm
  conversion on the watch page and the Mux HLS stream), demo e2e 6/6 (2 REAL conversions +
  cancellation/recovery through the verified path). Remaining honestly open: the operator's
  GPL complete-corresponding-source offer (§1), the nonce-based CSP follow-up, and the
  Phase 7 full NOTICE audit.

---

## D26 — Nonce-based Content-Security-Policy (closes the D25 recorded follow-up)

- **Status:** Adopted (2026-10-20). Closes the D25 recorded `'unsafe-inline'`
  script-src limitation. Non-gated: touches NO provider work (D20), no relay (D8), and
  weakens nothing in the D18/D19 machinery — the policy shape is the D25 policy minus
  `'unsafe-inline'` plus a per-request nonce.
- **Context:** D25 shipped the CSP statically from `next.config.ts` `headers()`; Next.js's
  inline bootstrap/runtime scripts then require `script-src 'unsafe-inline'`, which was
  recorded (not silently accepted) as the follow-up hardening step.
- **Decision:**
  1. **CSP moves to a per-request policy served by the Next.js 16 proxy** —
     `src/proxy.ts` (Next 16 renamed middleware → proxy; `PROXY_FILENAME = 'proxy'`
     verified in the installed next 16.4.2). The proxy generates a fresh 128-bit nonce
     (`src/app/_lib/nonce.ts`, Web Crypto, base64url alphabet WITHOUT `=` padding — the
     CSP `nonce-source` grammar), builds the policy from the SAME pure builder
     (`buildContentSecurityPolicy(environment, { nonce })`), sets it on the REQUEST
     headers (`Content-Security-Policy` + `x-nonce` — Next.js extracts the nonce from the
     request CSP header and stamps its own inline scripts), and attaches it to the
     response. Production `script-src` is now `'self' 'nonce-…' 'wasm-unsafe-eval' blob:`
     — an injected inline script WITHOUT the per-request nonce cannot execute.
  2. **One builder, two pinned shapes.** The nonce-less form remains the recorded D25
     baseline (unit tests pin both). No `'strict-dynamic'` yet — a deliberate, recorded
     scope limit; `'self'` stays valid for scripts.
  3. **Static headers() no longer serves a CSP.** `next.config.ts` keeps only the
     nonce-independent hardening headers (X-Content-Type-Options, X-Frame-Options,
     Referrer-Policy, Permissions-Policy, HSTS). A duplicated static CSP would intersect
     with the per-request one and carries no nonce.
  4. **Matcher:** everything except `_next/static`, `_next/image`, `favicon.ico` — pages,
     `/api/*`, `/ffmpeg-lib/worker.js` (the worker's OWN response policy must keep the
     blob: sources — D25 evidence), posters and core assets. The static hardening headers
     continue to cover every path including the excluded ones.
  5. **Dynamic rendering forced** (`export const dynamic = 'force-dynamic'` in the root
     layout): a per-request nonce cannot be baked into prerendered HTML, so static
     optimization/ISR are intentionally disabled — recorded trade-off; the catalog comes
     from the in-process provider host with a runtime kill switch, so per-request
     rendering is semantically honest. `next build` confirms every route is
     server-rendered on demand and the proxy is registered.
  6. **Verified gotcha (recorded for future sessions):** browsers HIDE the nonce content
     attribute after parsing — `getAttribute('nonce')` returns `''` and the serialized
     markup shows `nonce=""`, while the IDL property `script.nonce` still reports the
     parsed value. The e2e reads the IDL property.
- **Evidence (empirical, 2026-10-20):** served HTML carries the response-policy nonce on
  ALL script tags (inline and external; asserted in e2e); two requests get different
  nonces; `/api/providers/health` carries the nonce policy; `/ffmpeg-lib/worker.js`
  carries a blob:-capable policy; the whole app e2e suite — including the REAL
  ffmpeg.wasm conversion — passes with zero CSP violations under the nonce policy.
  Development mode verified separately: nonce + the recorded dev relaxations
  (`'unsafe-eval'`, `ws:`), zero CSP violations in a real browser.
- **Consequences:** verified battery 2026-10-20 — vitest 414/414 (24 files; +2 nonce
  grammar/uniqueness, +1 nonce-CSP shape, +1 no-static-CSP), tsc/eslint/library-build/
  next-build clean, app e2e **25/25** (the 3 new headers tests: per-request freshness,
  rendered-page nonce stamping, worker-file policy), demo e2e 6/6. Remaining honestly
  open: the operator's GPL complete-corresponding-source offer (§1), `style-src
  'unsafe-inline'` (style attributes — separate recorded follow-up), and the Phase 7
  full NOTICE audit.

---

## Open future decisions (summary)

| ID | Topic | Gate |
|---|---|---|
| D2-F | Public / shared deployment | legal review of live source set + abuse controls + takedown contact |
| D3-F | Any provider outside the lawful categories (incl. AniKoto-style) | explicit legal review, superseding decision |
| D6-F | Third-party/dynamic provider model (Phase 6 option B/C) | security review, sandbox design |
| D7-F | ClearKey via EME for licensed content | explicit decision; default off |
| D15-F | License selection for this repository | owner decision before any distribution (NOTICE audit, Phase 7) |
