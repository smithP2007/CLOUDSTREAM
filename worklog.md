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

