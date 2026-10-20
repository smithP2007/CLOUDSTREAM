# Multi-Agent Worklog

> Canonical work record for this project. Append below after each work session
> (template in HANDOFF.md). Note: commit SHAs mentioned in early entries refer to the
> original workspace repository; this GitHub export was produced by a subtree split,
> so match commits by their subject/message rather than by hash.

# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Read-only reverse-engineering investigation of recloudstream/cloudstream + AniKoto extension; produce 4 docs in new web project (/home/z/my-project/download/cloudstream-web/docs/).

Work Log:
- Cloned (shallow, read-only): recloudstream/cloudstream@eb962b4, recloudstream/extensions@cf16b3b, recloudstream/gradle@32895ae, phisher98/cloudstream-extensions-phisher (master@89aa8e6 + builds branch). Clones under /home/z/my-project/research/.
- Mapped modules from settings.gradle.kts:21 → :app, :shared, :library, :docs, :desktopApp. License = GPL-3.0 (LICENSE).
- library/ = KMP module com.lagradost.api v1.0.1, targets android+jvm only; webMain/webTest source sets exist but NO js/wasm target declared (library/build.gradle.kts:20-86). commonMain deps: jackson, jsoup, ksoup, ktor-http, nicehttp(OkHttp), rhino, kotlinx-*.
- Read MainAPI.kt (2861 lines): abstract class MainAPI at :494; getMainPage:633, search:641/651, quickSearch:656, load:665, loadLinks:692; APIHolder:109; TvType:1120; SearchResponse:1406; LoadResponse:1814; Episode:2552. ExtractorApi.kt: ExtractorLinkType:417, ExtractorLink:703, loadExtractor:926 (reverse prefix match + Levenshtein>80 fallback), extractorApis registry:988, ExtractorApi:1425.
- PluginManager.kt (app): PathClassLoader:611, manifest.json read:613, pluginClassName instantiation:631-634, unloadPlugin:689, .cs3 path filesDir/Extensions/<repoHash>/<nameHash>.cs3:754. BasePlugin.kt: registerMainAPI:20, registerExtractorAPI:31, Manifest:65.
- Gradle plugin: .cs3 = Zip(manifest.json + classes.dex via D8/desugaring) (Tasks.kt:146-184, CompileDexTask.kt:58-63); isCrossPlatform mode emits pure-JVM JAR validated by jdeps for "android." imports (EnsureJarCompatibilityTask.kt:39-50); PluginEntry carries jarUrl/jarHash.
- Host flow verified: HomeViewModel.kt:341/247, SearchViewModel.kt:137/235, APIRepository.kt (load:85, search:123, getMainPage:156, loadLinks:204 withTimeout), RepoLinkGenerator.kt (20-min cache:73, dedupe, sortUrls), CS3IPlayer = media3 1.9.3.
- Android-specific: WebViewResolver android actual vs jvm actual TODO("Not yet implemented") (WebViewResolver.jvm.kt:63); CloudflareKiller uses android.webkit.CookieManager.
- AniKoto: distributed ONLY as compiled builds/AniKoto.cs3 in phisher98 repo (wiki: closed-source). Static inspection only: manifest = com.anikoto.AnikotoPlugin v6; dex classes (Anikoto, AnikotoExtractorsKt, MetaAnimeData, MegaPlay, Vidtube, Vidwish...), endpoints (anikototv.to, api.ani.zip/mappings, mapper.nekostream.site, megaplay.buzz, vidtube.site, vidwish.live, mewcdn.online), deps (coroutines/serialization/jsoup/jackson/okhttp), 42 android* refs, NO rhino. No license file → no reuse permitted. Never executed the package.
- Wrote: download/cloudstream-web/README.md + docs/repository-analysis.md, docs/provider-architecture.md, docs/web-compatibility-report.md, docs/implementation-roadmap.md (all findings tagged VERIFIED/INFERRED/UNKNOWN, commit-pinned citations).

Stage Summary:
- Deliverables complete in /home/z/my-project/download/cloudstream-web/ (README + 4 docs).
- Core conclusions: (1) architecture/contract is portable as SPEC, code is not (GPL-3.0 JVM/dex, Android deps); (2) Android .cs3 plugins cannot run in browsers (dex + PathClassLoader + CORS + WebView); (3) upstream is mid-KMP-migration with uncompiled webMain — no web target today; (4) AniKoto is closed-source/unlicensed → behavioral reimplementation only, post legal review; (5) recommended stack: Next.js + server-side TS provider adapters + hls.js/dash.js + media relay; next task = Phase 1 core contract types (src/core/types.ts + provider.ts).

---
Task ID: 2
Agent: main (Z.ai)
Task: Part A — finalize Phase 0 (POLICY.md + docs/decisions.md); Part B — implement Phase 1 only (TypeScript provider contract + Zod schemas + host behaviors + tests) in /home/z/my-project/download/cloudstream-web/. No Phase 2 work; upstream repos untouched.

Work Log:
- Reviewed workspace + all 4 investigation docs before writing anything; upstream clones left untouched in /home/z/my-project/research/.
- Part A: wrote POLICY.md (scope, private/self-hosted posture, 4 lawful content categories, no-upstream-code rule, no-AniKoto rule, no-DRM-circumvention, no-unrestricted-proxy, kill-switch/takedown commitments) and docs/decisions.md (D1–D14 adopted + D2-F/D3-F/D6-F/D7-F/D9-F explicitly open).
- Part B tooling: project had NO package.json; created minimal config — deps: zod ^4.6.7 (only runtime dep); dev: typescript ^5.9 (pinned below TS7 for eslint compat), vitest ^5, eslint ^9 + typescript-eslint ^8, @types/node ^24 (matches Node 24 runtime). tsconfig (strict, bundler resolution), tsconfig.build.json (emits dist/), vitest.config.ts (node env, real timers), eslint.config.mjs (flat).
- src/core/types.ts: TV_TYPES (18 upstream members, string literals per D10), DUB_STATUSES, SEARCH_QUALITIES, PLAYBACK_LINK_TYPES ('video'|'hls'|'dash' — torrent/magnet/DRM excluded), SearchResponse, MainPageData/Request, HomePageList(+HomeRow alias)/HomePageResponse, SearchPage, Episode (opaque data), LoadResponse discriminated union (kind: movie|tvSeries|anime|liveStream; TorrentLoadResponse excluded), Actor/TrailerData, PlaybackLink (quality: number|null REQUIRED), SubtitleFile, ProviderResult/ProviderFailure, LinkCollection.
- src/core/schemas.ts: Zod schemas for every boundary payload; non-coercive, unknown keys stripped, nullish modeled explicitly.
- src/core/provider.ts: Provider (getMainPage/search/quickSearch?/load/loadLinks), CallContext.signal (AbortSignal), LinkOrSubtitleEmit, ProviderTimeouts + DEFAULT_PROVIDER_TIMEOUTS (project-chosen values; upstream defaults UNKNOWN, not claimed).
- src/core/links.ts (helper, per instruction): dedupeLinks (first wins), sortLinksByQualityDesc (stable, unknown last via rank -1), dedupeSubtitles (language,url), createLinkCollector (validates/routes emits, drops late emissions, counts rejected).
- src/core/provider-host.ts (helper): ProviderHost — never throws for provider faults; race only bounds the WAIT, cancellation is the AbortSignal (aborted with TimeoutError reason on deadline); caller-supplied signal → kind 'aborted' (pre-aborted → provider not invoked); per-method timeouts config; validation → kind 'validation' with formatted Zod issues; quickSearch absent → 'unsupported'; loadLinks → collector + LinkCollection.
- tests (vitest, 47 tests, all real timers): links.test.ts (10), provider-host.test.ts (23), contract.test.ts (14, incl. compile-time schema↔interface agreement via parsed-sample assignment). All 7 required behaviors covered.

Stage Summary:
- Verification (actual results): npx tsc --noEmit → clean; npx eslint . → clean (fixed 2 issues found: unused Episode import, require() in ESM test); npm run build → dist/core/* emitted (ESM + d.ts); npx vitest run → 47/47 passed, re-run 3× stable (861ms / ~40ms suite).
- Files created: POLICY.md, docs/decisions.md, package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, eslint.config.mjs, src/core/{types,schemas,provider,links,provider-host,index}.ts, tests/{helpers,links,provider-host,contract}.ts; README.md status updated (no files deleted; upstream untouched).
- Key decisions recorded: D10 string-literal enums; D11 naming (PlaybackLink/Extract→PlaybackLinkType, apiName→providerName, HomeRow alias, 4-variant LoadResponse union); D12 strict-but-shallow Zod (non-coercive, strip, drop-and-count invalid emitted items, strict handled boolean); D13 honesty rule (race bounds wait only; AbortSignal is the sole cancellation mechanism — tested that signal.reason is TimeoutError at the provider); D14 registry.ts (roadmap P1 task 3) deferred → next task.
- Next task: src/core/registry.ts — provider/extractor registry with newest-wins URL-prefix matching + Levenshtein mirror fallback (ExtractorApi.kt:926–986 semantics), completing roadmap Phase 1; then Phase 2 (server runtime: HTTP engine, SSRF guard, link pipeline TTL cache, health/kill-switch).

---
Task ID: 3
Agent: main (Z.ai)
Task: (a) fix decision-ID collision — future license-selection decision renamed D9-F → D15-F; (b) implement roadmap Phase 1 task 3: src/core/registry.ts + unit tests; run tests/typecheck/lint/build; stop after Phase 1.

Work Log:
- Re-reviewed all 4 investigation docs, decisions.md, POLICY.md, src/core/*, tests/*, configs before editing; verified upstream loadExtractor (ExtractorApi.kt:920–990) and getApiFromUrlNull (MainAPI.kt:160–200) read-only at the research clone for behavior confirmation only (schemaStripRegex = ^(https:|)//(www\.|); reverse scan newest-wins; naive startsWith; partialRatio(mainUrl, currentUrl) > 80; unshortenLinkSafe network step).
- D9-F → D15-F rename: POLICY.md §6, decisions.md D4 consequences + open-futures table row; README.md updated to "D1–D14, D16 … (… D15-F)".
- src/core/registry.ts (new): normalizeProviderUrl (both-sides consistent: trim/lowercase/scheme+protocol-relative+bare-scheme strip/one leading www./trailing slashes; ports+query+userinfo preserved; non-string → ''); levenshteinRatio + levenshteinPartialRatio (indel distance, sub=2, exact windowed max, left-to-right ties, 2048-char cap); MIRROR_MATCH_THRESHOLD = 80 (fixed, strict >); ProviderRegistry {register (fail-fast TypeError validation; 'added'/'existing'/'replaced' — same-name replacement takes newest position, mirrors clone-site override), unregister (name|instance), getByName (exact/case-sensitive, upstream ==), getByUrl (stage 1 newest-first normalized prefix + boundary check [end,/,?,#,:]; stage 2 mirror fallback newest-first strict >80; never throws; null for malformed/empty/unknown; no URL parsing, no network, no .cs3), list() copy, size}.
- Documented divergences recorded as decision D16 (new entry): consistent normalization both sides (upstream lowercases only input URL, regex misses http:); prefix boundary hardening (upstream naive startsWith lets newer partial-domain provider hijack older one); fuzzy over normalized strings (more conservative than upstream raw); no network unshortening in Phase 1 (Phase 2 pre-step); inherent containment property documented (verbatim mainUrl containment scores 100 in fallback — upstream end-behavior identical); fail-fast registration + never-throw lookups; discriminated match result ('prefix'|'mirror'+score) for auditability.
- tests/registry.test.ts (new, 44 tests): normalization (scheme/case/www/trailing-slash/ports/userinfo/trim/non-string), pure ratio scoring (indel semantics, known values 66.67/85.71/92.31/72.73), exact+prefix matches, boundary rule (incl. newest partial-domain hijack prevention), newest-wins precedence (same base, overlapping prefixes, unregister-restore, name-replacement), mirror fallback (documented 92.31 pair, near-mirror 72.73 rejected, strict >80, ambiguous-mirror newest-wins determinism loop ×10, normalized-vs-raw score comparison), malformed/unknown URLs (empty/whitespace/scheme-only/garbage/non-string → null), registration validation + list-copy safety.
- Fixed during testing: DP arrays made noUncheckedIndexedAccess-safe; test expectations corrected for partialRatio containment (verbatim mainUrl containment → mirror 100, matches upstream end-behavior; '.example.org' vs 'example.com' scores 81.8 → fixture swapped to distant domain).
- Docs: decisions.md D14 → status "Implemented … see D16"; new D16 entry (full matching semantics + divergences); roadmap Phase 1 → ✅ Complete status line; Phase 3 note reusing ProviderRegistry for the future extractor registry; "exact next implementation task" section rewritten → Phase 2 steps 1–2 (src/server/http/ engine + guard.ts SSRF); README module table + test counts (91).
- Committed: 667956f (project repo; upstream research/ clones untouched).

Stage Summary:
- Verification (actual): vitest 91/91 (47 prior + 44 registry), tsc --noEmit clean, eslint clean, npm run build clean (dist/core/registry.js + .d.ts emitted). Suite duration ~1s, real timers.
- Files created: src/core/registry.ts, tests/registry.test.ts (+ dist artifacts). Files modified: POLICY.md, docs/decisions.md, docs/implementation-roadmap.md, README.md, src/core/index.ts (barrel export).
- Phase 1 is now fully complete (types, provider, schemas, links, provider-host, registry, 91 tests). No Phase 2 work started; no real providers/network/scraping/.cs3 added.
- Exact next task: Phase 2 steps 1–2 — src/server/http/ undici-based fetch engine (cookie jar, redirect/size/timeout caps, TTL cache) + src/server/http/guard.ts SSRF hardening (private-IP/DNS-rebinding, header normalization, robots-considerate policy), with tests; includes the unshorten pre-step hook that registry lookups will consume per D16.


---
Task ID: 4
Agent: main (Z.ai)
Task: (A) registry security review + hardening (D17); (B) Phase 2 steps 1-2: HTTP engine + SSRF guard (D18). No real providers/relay; stop after Phase 2 steps 1-2.

Work Log:
- Task A review: confirmed prefix stage ran on full normalized URL (boundary-guarded) but mirror fallback scored the FULL URL — any URL containing a mainUrl verbatim (path/query/hostile-suffix position) scored 100 and hijacked the match. No score threshold can separate example.net (legit mirror, 72.7) from example.com.evil.io (attacker, 100).
- Hardening (D17): matching now = prefix check (unchanged) + NEW explicit subdomain check (urlHost === patternHost or label-boundary endsWith('.'+patternHost), path-less patterns only; safe by DNS delegation) + structural mirror rule (pattern host labels align to TAIL of url host labels; all but final label exactly equal; final label/TLD differs; informational host-only Levenshtein score; MIRROR_MATCH_THRESHOLD removed). Newest-wins preserved across both scans. Hostnames in path/query/userinfo can never match (host-scoped + charset gate). extractUrlHost() rejects non-domain-like hosts, empty labels, >253 length.
- 17 adversarial regression tests added (suffix attacks, look-alikes, path/query hostnames, valid subdomains, userinfo tricks, malformed hosts, IPv6-vs-domain, co.uk tail-safety, mirrors incl. cdn.<mirror> forms, newest-wins subdomains); D17 documented with residual risks (name+TLD swaps still trust mirrors by design; no PSL; typo-fuzzy intentionally gone).
- Task B: added undici ^7. Empirically verified Agent connect.lookup interception (hostname .invalid reached local server via pinned IP) BEFORE building on it.
- src/server/http/: guard.ts (scheme allowlist, credential rejection, hostname blocklist incl. metadata.google.internal/.internal/.local/.home.arpa, IPv4+IPv6 range policy with binary-form classification, IPv4-mapped unwrap, 6to4/NAT64/Teredo blocked wholesale, WHATWG-normalized encoded IPv4 caught, approvedDestinations as the ONLY private-host exception, fail-closed); dns.ts (resolve4+6 all records, ANY non-public record blocks host, validated-set cache = single source of truth, connector lookup serves ONLY validated set + async re-validate fallback + family validation, pinLiteral for IP literals); headers.ts (denylist hop-by-hop/host/content-length/cookie, CR/LF/NUL injection rejection, caps, redactHeadersForLog); cookies.ts (RFC6265-style per-provider jar: Domain suffix rules reject foreign planting, path/secure/expiry, bounded); cache.ts (TtlCache LRU + bytes); robots.ts (RFC9309-ish parser+gate, longest-match allow-wins-ties, */$ patterns, UA specificity, 4xx=allow/5xx+failure=DISALLOW w/ short TTL); engine.ts (undici request, total-deadline AbortController merging timeout+caller signal+size cap, MANUAL redirects with per-hop full re-validation + 301/302/303→GET + 307/308 preserve + cross-HOST credential/cookie stripping, bounded TTL response cache honoring cache-control and skipping set-cookie responses, typed HttpResult never throwing, per-provider UA profiles, query-free events, engine.close()).
- Test fixes found real bugs: (1) WHATWG keeps brackets on IPv6 hostname → guard now strips before parse/approval; (2) ipv4-mapped group indices were wrong (0xffff at group 5, not 6) — ::ffff:127.0.0.1 classified PUBLIC before fix (caught by test, security-critical); (3) parseIpv6 accepted 9-group '::' forms; (4) robots gate ordering masked DNS errors → DNS validation now precedes robots per hop; (5) injected DNS resolvers must carry the same approvedDestinations (documented contract); (6) undici connection pooling reuses validated sockets per origin (no re-resolve — documented; repin tests use fresh origins).
- 83 new tests (43 guard unit w/ mocked DNS + zero network; 40 engine integration against loopback-only node:http servers with explicitly approved 127.0.0.1): timeout, caller-signal abort, pre-abort no-dispatch, redirect chain/limits/307/303, redirect→metadata-IP blocked, redirect→private-DNS blocked, bad-scheme/_location redirects, size caps, cache TTL/LRU/no-store/max-age/POST/set-cookie exclusions, cookie jar + cross-engine isolation, cross-HOST credential+cookie stripping vs same-host retention, header denylist/profiles, query-free events, DNS pinning end-to-end via mocked DNS to loopback, rebinding (revalidation after TTL repins; non-approved private resolution blocked pre-connect), DNS fail-closed, robots allow/deny/500-fail-closed/404-allow/caching, concurrency.
- Docs: D17 (registry hardening) + D18 (engine+guard posture with 9 explicit security limitations) recorded; roadmap Phase 2 status line + new "exact next task" (steps 3-5); README Phase 2 section + counts.
- Verification (actual): vitest 187/187 (104 prior + 83 new); tsc --noEmit clean; eslint clean; build clean (dist/server/http/* emitted). Commits: 169d4ec (Task A), ef2047d (Task B). Upstream research/ clones untouched; no real providers, no media relay, no proxy routes, no dynamic code loading.

Stage Summary:
- Phase 2 steps 1-2 complete: HttpEngine + GuardedDnsResolver + guard + cookies + headers + cache + robots, all behavior pinned by tests. SSRF posture: fail-closed everywhere, single validated-DNS source of truth shared by validation and connection, explicit approvals for operator LAN hosts.
- Exact next task: Phase 2 steps 3-5 — HTML/JSON toolkit (cheerio/p.a.c.k.e/vm sandbox), link pipeline TTL cache (reuse core/links + TtlCache), observability (redacted event logging, health shape, provider kill-switch flag). Then Phase 3 review gate before any real provider.

---
Task ID: 5
Agent: main (Z.ai)
Task: Push ALL project work to https://github.com/smithP2007/CLOUDSTREAM so a future AI session can continue from the repo alone.

Work Log:
- Verified green before push: vitest 187/187, tsc --noEmit clean, eslint clean, build clean (all run live).
- Discovered workspace git root is /home/z/my-project (monorepo) whose history contains research/ (49MB upstream clones incl. closed-source AniKoto artifacts), a .env file holding a database credential (never committed to any push), tool-results/ — none of these may be redistributed.
- Wrote handoff materials into the project: HANDOFF.md (AI continuation guide: rules, reading order, state, exact next task = Phase 2 steps 3-5, D17/D18 gotchas, worklog protocol), docs/worklog.md (full worklog copy + SHA note), .gitignore (node_modules/.env protection).
- Committed 6077e12 in workspace repo, then `git subtree split -P download/cloudstream-web -b github-export` → clean 6-commit history with project at root (no upstream code, no secrets).
- Pushed github-export → main on github.com/smithP2007/CLOUDSTREAM using the user's PAT inline (not stored in git config); verified ls-remote main = 822f52e (handoff tip).
- Secret-scanned pushed history: no PAT, no database credential. Added remote `cloudstream` (clean URL) for future pushes: `git push cloudstream github-export:main` after re-splitting.

Stage Summary:
- GitHub repo smithP2007/CLOUDSTREAM main = 822f52e, 104 files, full readable history (Phase 1, Task A/D17, Task B/D18, handoff).
- Excluded by policy: research/ clones, AniKoto binary, .env, tool-results/.
- Next AI entry point: HANDOFF.md → POLICY.md → docs/decisions.md (D1-D18) → roadmap (Phase 2 steps 3-5: HTML/JSON toolkit, link pipeline, observability) → Phase 3 review gate requires user approval.

---
Task ID: 6
Agent: main (Z.ai)
Task: Implement Phase 2 steps 3-5 (parse toolkit, link pipeline, observability) per the owner's revised instructions: NO JavaScript execution (no eval/new Function/node:vm), pure static p.a.c.k.e decoder, kill-switch + health primitives without any HTTP surface. Then verify, document, and push to GitHub.

Work Log:
- Re-grounded in POLICY.md, decisions.md (D16-D18), roadmap, engine event API (HttpEngineEvent: origin+path only), ProviderFailureKind, redactHeadersForLog, TtlCache, LinkCollection shapes before writing code. cheerio ^1.2.0 installed (only new dependency, MIT).
- src/server/parse/html.ts: size-capped (2 MiB default) never-throwing cheerio parse; extractText/AllText/Attribute; extractLinks with absolutization (non-http(s) targets -> url null, raw href kept); bounded extractMetadata (title/description/canonical/og:, MAX_META_ENTRIES=64).
- src/server/parse/json.ts: parseJsonSafe (empty/tooLarge/invalid typed errors) + parseJsonWith (schema-validated one-shot) + formatZodIssues matching host issue formatting.
- src/server/parse/packer.ts: pure static p/a/c/k/e decoder — argument splitter with string/escape/depth tracking, canonical .split('|') keys form, JS string-literal unescaping, radix 2-62 (0-9a-zA-Z = canonical e(c) mapping), word-boundary substitution via replacer FUNCTION ($-pattern safety), typed failures (notPacked/tooLarge/malformed/unsupportedRadix), count cap 200k. ZERO evaluation anywhere; grep-verified no eval/new Function/node:vm/require in src/.
- src/server/links/pipeline.ts: normalizeLinkCollection (schema re-validation drop-and-count, reuses core dedupeLinks + sortLinksByQualityDesc, subtitle dedupe by normalized language+URL), LinkPipeline (bounded TTL cache per (scope, provider, episode), single-flight, failures never cached, TtlCache.keys() additive), credential-bearing links (authorization/cookie/api-token header names) NEVER cached under shared scope — only explicit per-user scopes; default TTL 20 min mirrors RepoLinkGenerator.kt:73.
- src/server/obs/: redact.ts (redactUrlForLog — userinfo dropped, sensitive query params value-redacted, fragment dropped; redactEventMessage caps+re-redacts; reuses engine header redactor), kill-switch.ts (per-provider + global, reasons, deterministic snapshot), events.ts (ProviderCallLogger start/end with injectable clock, engine-event forwarding, wrapProvider — kill-switch checked before EVERY call, refused calls throw typed ProviderDisabledError with outcome skipped/killed and provider NOT invoked; failures classified timeout/aborted/validation/provider and rethrown original), health.ts (ProviderHealthTracker idle/ok/degraded/down/disabled + future GET /api/providers/health contract as Zod schemas, self-validated in tests).
- Tests: 80 new (html 12, json 10, packer 19 incl. hand-written vectors + test-only pack inverse, link-pipeline 16 incl. single-flight/TTL/LRU/eviction/credential-scope, observability 23). Fixed during testing: single-flight deadlock in test (gate release order), extractAllText selector semantics, dropped-count arithmetic, Provider ctx arity, duplicate event array bug.
- Docs: D19 recorded (NO-JS-execution posture, unpacker limits, credential-scope rule, redaction name-based limitation, deferred JS runtime gated on D6-F); roadmap Phase 2 -> complete + step 3 revision note + exact-next-task replaced by the Phase 3 pre-flight inspection checklist (provider authorization, service terms, data contracts, expected responses, playback compatibility, rate limits, unresolved risks) with an explicit STOP gate; README + HANDOFF.md updated (267 tests, new modules, Phase 3 gate).
- Security review: engine/guard/DNS/robots/cookies untouched except additive TtlCache.keys(); no client-controlled URLs reach the engine; no media relay; no real providers; no admin/health HTTP surface (schemas only). Verification (actual): vitest 267/267, tsc --noEmit clean, eslint clean, build clean.

Stage Summary:
- Phase 2 is fully complete (steps 1-5). No JS execution exists in the project; the only new dependency is cheerio.
- Exact next task: present the Phase 3 pre-flight inspection checklist for the first candidate provider (recommended: Internet Archive) and STOP for owner review before any provider implementation (roadmap gate; POLICY.md §3).

---
Task ID: 7
Agent: main (Z.ai)
Task: Prepare the Phase 3 pre-flight checklist for the proposed Internet Archive provider (review document only — no provider code, no implementation-file changes), per the owner's 10-section specification. Present it and stop for approval.

Work Log:
- Verified baseline: main @ 6fd80cc clean (research/ submodule dirt is upstream clones, untouched); vitest 267/267 green re-run.
- Read roadmap (Phase 3 gate + 7-point checklist), POLICY.md (§3 categories, §6 commitments), decisions.md (D1–D19 incl. D18 SSRF posture, D19 no-JS/cache/observability), provider-architecture.md, HANDOFF.md, and the actual contract surface (types.ts, provider.ts, engine.ts HttpFailureKind).
- Researched official Internet Archive sources (fetched 2026-10-20): help.archive.org "About Search" (advancedsearch.php params, 10,000-row sorted-pagination cap, scrape API cursor contract + official JSON example), developers md-read.html (metadata endpoint, response fields, files[] entry fields, empty-array-on-missing-id quirk), metadata.html (auth model, compression), developers bots.html (mandatory descriptive UA, 429/Retry-After discipline, caching/backoff best practices), help "Rights" + "Movies and Videos" + "Files, Formats, and Derivatives" (no copyright-status guarantees, CC uploader-designated, h.264 mp4 derivatives, unstreamable-files caveat), ias3.html (307-redirect likelihood), access policy, developer portal inventory, Tasks-API rate-limit introspection scope.
- Sandbox has no direct egress (curl timeout): CORS / byte-range / live-header probes and live sample payloads NOT executed — recorded as UNKNOWN evidence items E16–E21 with probe plan P1–P4; no facts invented, metadata lookup not treated as playback proof.
- Wrote docs/phase3-preflight-checklist.md: evidence log (23 tagged items), 10 owner-specified sections (authorization/terms/licensing; endpoints/formats; contract mapping incl. union schema for the [] quirk; item→movie/series mapping; MP4/HLS + NOT-VERIFIED playback status; CORS/redirects/range/subtitles; rate limits/caching/timeouts/error mapping onto HttpFailureKind/ProviderFailureKind; security exclusions incl. host allowlist + no-credentials + no-lending + no-relay; fixture+test plan (8 fixtures, zero live calls) + probe script spec; risks R1–R8, exit criteria, CONDITIONAL GO) + draft D20 decision.
- Roadmap: one status line added under the Phase 3 checklist gate pointing to the checklist (minimal edit; no other docs touched).

Stage Summary:
- Deliverable: docs/phase3-preflight-checklist.md (review-only) + roadmap status pointer; repo left code-identical to 6fd80cc.
- Key open gates before any provider code: owner approval of checklist; P4 (archived dated Terms of Use) resolving E20/R1; D20 recording allowlist + pacing values; playback claims OFF until P2/P3 probes.
- Stopped for owner approval as instructed; Phase 3 not started.

---
Task ID: 8
Agent: main (Z.ai)
Task: Review and revise docs/phase3-preflight-checklist.md per the owner's 7-point instruction (documentation only — no provider code, no probes run).

Work Log:
- Corrected playback/CORS model: native cross-origin <video> without crossorigin attribute fetches media in no-cors mode and does not generally require CORS permission; CORS required only for JS-fetched playback (hls.js/DASH manifest+segment requests) and crossorigin uses (canvas/Web Audio). Rewrote §5 and §6 accordingly; tagged the spec-level behavior INFERRED-until-P2a, not as an IA-verified fact.
- Probe plan restructured into separate behaviors: P1 robots; P2a native-playback fetchability; P2b byte-range seeking (206 + mid-file range); P2c redirect chain; P2d codec/container sanity (ftyp); P2e required-headers absence; P2f ACAO diagnostic ONLY (never a pass/fail for native video); P3 ToU dated snapshot (renumbered from old P4). Updated every cross-reference (§5/§6/§8/§10/§11); grep-verified no stale P4/standalone-P2 tokens remain.
- Strengthened copyright policy: collection-level allowlist demoted to a necessary-not-sufficient search pool; mandatory per-item rights register (docs/evidence/ia-rights-register.md) recording identifier, reviewed rights evidence, concluded permission scope, attribution requirements, review date, reviewer; uploader license metadata = evidence to review, never an automatic guarantee; load()/loadLinks() must refuse identifiers absent from the register; register-enforcement unit test added to §9.2.
- Preserved ToU gate: API publicness and robots non-exclusion explicitly do NOT establish that every proposed application use is permitted; ToU review remains the authority (A1/R1).
- Recorded robots.txt finding as E24 (OWNER-PROVIDED tag added to legend): visible wildcard rules disallow /control/ and /report/; intended API paths not visibly disallowed; re-verification in P1; robots.txt is not a substitute for terms review. Updated §7 error table and R7.
- Unsupported-claims sweep: fixed §5 "progressive MP4 (byte-range HTTP)" overstatement (byte-range is E17/UNKNOWN, now stated as a prerequisite); evidence log entries E16/E17/E18 re-scoped with their probe IDs; all findings tagged VERIFIED/INFERRED/UNKNOWN/CONTEXT/OWNER-PROVIDED.
- Non-authorization made explicit in Status, §10 recommendation and D20 draft: checklist approval alone does not authorize implementation; adopting D20 is the only authorizing act.

Stage Summary:
- docs/phase3-preflight-checklist.md at revision 2 (456 lines); no implementation files touched; no probes run; baseline still 6fd80cc + docs commits.
- Open gates unchanged: owner approval of revision 2; P3 (ToU archive) resolving A1/R1; D20 adoption with collection pools + initial register entries + pacing values; playback claims OFF until P2a-P2f.

---
Task ID: 9
Agent: main (Z.ai)
Task: Final consistency pass over docs/phase3-preflight-checklist.md per the owner's 6-point instruction (documentation only — no probes, no provider code, no D20 adoption).

Work Log:
- Verified repository state before editing: HEAD d75cdf1 (environment auto-commit of tool-results/worklog); latest commit touching the checklist is b01219a (revision 2); lineage 33b3fe9 -> b01219a recorded from actual git state, not guessed.
- Resolved the Section 10 vs draft D20 contradiction: D20 restructured into explicit adoption preconditions (dated ToU copy archived via P3 into docs/evidence/; explicit review of the read-only automated-access clauses; favorable conclusion recorded) plus a separate "what adoption would authorize" block; removed the "ToU gate still open" running-condition phrasing; added that adopting D20 while the gate is open is invalid and no shortcut (API publicness, robots non-exclusion, checklist approval) resolves the gate.
- Retensed Section 6 (plus one matching Section 5 sentence and the P2a bullet in 9.3): "P2a confirms/verifies/establishes" -> future-obligation wording with "not yet run"; tag cells now state "nothing probe-confirmed"; no probe outcome is claimed anywhere.
- Tightened Section 8 item 1 into a verified-destination policy: (i) API destination = archive.org only; (ii) datanode destinations allowed only when verified from that item's own metadata response (d1/d2/server/workable_servers, E3) at fetch time; the *.us.archive.org wildcard demoted to a coarse shape guard, never proof of an approved media server; every redirect hop revalidated through the full D18 pipeline against the same policy. Section 6 redirects row and probe P2c updated to match.
- Preserved unchanged: CORS native-vs-JS distinctions, per-item rights-register requirement, evidence log E1-E24 and all tags, stop conditions R1-R8, robots.txt finding E24, the "no probe runs before owner approval" rule.
- Status header bumped to revision 3 with a changelog entry; preparation note re-anchored to the verified commit lineage.

Stage Summary:
- docs/phase3-preflight-checklist.md at revision 3 (495 lines); docs-only change; no implementation files touched; no probes run; D20 remains un-adopted and un-adoptable while the ToU gate is open.
- Stopped for owner review as instructed; awaiting approval before any probe or provider code.
