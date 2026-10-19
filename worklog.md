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
