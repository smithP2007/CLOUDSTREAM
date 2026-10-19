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
