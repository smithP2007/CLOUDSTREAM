# Web Compatibility Report

**Scope:** determine which parts of CloudStream's business logic can be reused for a browser-based (PC web) implementation, precisely why Android extensions cannot run in a browser, and which operational risks (licensing, security, CORS, playback, maintenance) the web port inherits.
**Method:** static analysis at `recloudstream/cloudstream@eb962b4`, `recloudstream/gradle@32895ae`, `phisher98/cloudstream-extensions-phisher` (master `89aa8e6` + `builds` branch, static only). Findings are tagged **VERIFIED / INFERRED / UNKNOWN**.

---

## 1. Why an Android `.cs3` extension cannot execute in a browser

Each point is a hard, independent blocker (**VERIFIED** unless noted):

1. **Bytecode format.** A `.cs3` package contains `classes.dex` — Dalvik bytecode produced by D8 (`cloudstream-gradle-plugin/.../tasks/CompileDexTask.kt:58–63`). Browsers execute JS/WASM, not dex or JVM bytecode. There is no supported path from dex to the browser (dex→jar conversion would still yield JVM bytecode).
2. **Class loading API.** The host loads plugins with `dalvik.system.PathClassLoader(filePath, context.classLoader)` (`app/.../plugins/PluginManager.kt:611`) and reflective `Class.forName`-style instantiation (631–634). No browser equivalent exists.
3. **Android runtime surface.** `PluginManager` imports `android.app.Activity`, `Notification*`, `android.widget.Toast`, `FragmentActivity`, `AssetManager` (`PluginManager.kt:3–20,645–659`); the Android `Plugin` subclass carries `Resources`. Static inspection of the distributed `AniKoto.cs3` dex found 42 `android*` string references, including `androidx.fragment.app.*`, `androidx.appcompat.app.AppCompatActivity`, `android.widget.*` (static `strings` analysis — **VERIFIED** as present in the binary).
4. **Network model.** Providers perform HTTP through `nicehttp` (OkHttp wrapper, `library/build.gradle.kts:66`). Even if the code ran, **browser CORS would block cross-origin calls** to provider sites (they send no `Access-Control-Allow-Origin`). This alone makes an in-browser provider execution model impossible regardless of language.
5. **WebView-dependent extraction.** Anti-bot link extraction relies on Android `WebView` (`library/androidMain/.../WebViewResolver.android.kt`); the JVM actual is `TODO("Not yet implemented")` (`library/jvmMain/.../WebViewResolver.jvm.kt:63`). **Conclusion (INFERRED):** any port must replace this with server-side headless browsing or avoid protected hosts.

**Verdict:** Android extensions cannot be loaded or executed in a browser, and should not be attempted. They can only be **behavioral reference material** (black-box, static).

---

## 2. Android app vs `desktopApp` vs a real browser application

| Dimension | Android app (`:app`) | Desktop app (`:desktopApp`) | Browser web app (target) |
|---|---|---|---|
| Runtime | ART (Android 6+/minSdk 23, `toml:67`) | JVM (Compose Desktop) | V8/SpiderMonkey (JS) + server Node runtime |
| UI | Views + Compose interop (migration per `COMPOSE.md`) | Compose Multiplatform (`shared/`) | React/Next.js |
| Core library | `:library` KMP (android+jvm bytecode) | same | **none executable** — re-implement contract in TS |
| Plugin loading | `PathClassLoader` dex (**VERIFIED**) | none implemented yet (**VERIFIED** — no `URLClassLoader` in repo) | N/A — server-side first-party providers or sandboxed plugin API |
| Cross-platform plugins | yes (dex) | intended via `isCrossPlatform` pure-JVM JARs, validated by `jdeps` (`EnsureJarCompatibilityTask.kt:39–50`) | possible only via re-compilation (e.g. Kotlin/JS) or re-implementation |
| HTTP | OkHttp/nicehttp, full headers, cookies | OkHttp/nicehttp | server-side fetch/undici; browser fetch blocked by CORS |
| Anti-bot | Android `WebView` + `CloudflareKiller` (`android.webkit.CookieManager`, `CloudflareKiller.kt:4,25–28`) | stubbed `TODO` (`WebViewResolver.jvm.kt:63`) | server-side headless browser or avoidance strategy |
| Playback | media3/ExoPlayer 1.9.3, okhttp/cronet datasources (`toml:40,121–125`) | none in repo yet (UI skeleton only, `desktopApp/.../Main.kt`) | HTML5 media + hls.js (M3U8) + dash.js/shaka (DASH); EME where available |
| DRM | Widevine/PlayReady/ClearKey constants in contract (`ExtractorApi.kt:471–490`) | same constants, no player | ClearKey feasible via EME; Widevine needs a licensed CDM+license server (out of scope) |
| Torrent links | `TORRENT`/`MAGNET` declared "No support at the moment" in the type enum itself (`ExtractorApi.kt:427–431`); app bundles a torrent server dep (`app/build.gradle.kts:287`) | — | no native support; would require WebRTC/WebTorrent or server-side relay (out of scope v1) |
| Storage | app files + preferences | file system | browser storage (IndexedDB) for user data only; providers live server-side |
| Status | production app | early WIP ("Hello, World!" `Main.kt` — **VERIFIED**) | this project |

**Interpretation (INFERRED):** the desktop app proves the *library* runs on plain JVM, and the `isCrossPlatform` JAR mechanism proves plugins *can be written* without Android APIs — but neither runs in a browser. The web target must treat the provider contract as a specification, not as a library.

---

## 3. Reusability assessment of existing business logic

### 3.1 Directly reusable *as code* in a browser

- **Nothing from upstream can be linked/copied into the browser bundle**: GPL-3.0 app/library + JVM bytecode + Android/JVM dependencies. (**VERIFIED** license; see `repository-analysis.md` §6.)

### 3.2 Reusable *as specification* (clean-room, TypeScript)

The following are behavioral specs we re-implement (shapes and semantics documented in `provider-architecture.md`):

- `MainAPI` contract: `getMainPage / search / quickSearch / load / loadLinks` with host-side error boundary + per-method timeouts (**VERIFIED** semantics at `MainAPI.kt:633–712`, `APIRepository.kt:85–220`).
- Data model: `TvType`, `SearchResponse`(+variants), `HomePageResponse`, `LoadResponse`(+variants), `Episode{data}`, `ExtractorLink{url,type,quality,headers,referer}`, `SubtitleFile`, `ExtractorLinkType`, `DubStatus`.
- Extractor registry semantics: URL-prefix matching with newest-wins ordering and Levenshtein mirror fallback (`ExtractorApi.kt:926–986`).
- Host services: dedupe, 20-minute link cache, quality sort (`RepoLinkGenerator.kt:30–73`, `MainAPI.kt:769–771`).
- Repository index format: `repo.json` → `pluginLists` → `plugins.json` (schema at `RepositoryManager.kt:34–78`) — useful if we want drop-in compatibility with existing extension metadata.

### 3.3 Re-implementation strategy per runtime concern

| CloudStream mechanism | Web replacement | Notes |
|---|---|---|
| nicehttp/OkHttp requests (headers, cookies, interceptors) | Node `undici`/`got`/`ky` with cookie jar on the server | Must run server-side (CORS + custom UA/referer needs). Browser fetch only for same-origin API + proxy endpoints. |
| jsoup/ksoup HTML parsing | `cheerio` (server) | ksoup is a jsoup port; API mapping is 1:1 enough. |
| Jackson/kotlinx JSON | native JSON / `zod` for validation | validate untrusted provider data at the boundary |
| Rhino JS execution (extractor de-obfuscation) | the Node runtime *is* JS — run de-obfuscation snippets in a sandboxed context (`node:vm`, QuickJS/WASM worker) with no network/fs | CloudStream's own utilities `JsUnpacker.kt`/`JsInterpreter.kt` (pure Kotlin, `library/.../utils/`) implement `eval(function(p,a,c,k,e,d){...})` unpacking — well-known public algorithms exist in JS natively. |
| Android `WebView` (`WebViewResolver`) | server-side headless browser (Playwright) behind a feature flag, per-provider | heavy; use only for providers that truly require JS challenges |
| `CloudflareKiller`/`DdosGuardKiller` cookies | server cookie-jar + headless challenge solver fallback | same logic concept, different engine |
| ExoPlayer | `hls.js` (M3U8), `dash.js`/`shaka` (DASH), native `<video>` (MP4/progressive) | see §5 |
| `getVideoInterceptor` (per-provider okhttp interceptor for the player) | server-side proxy route that applies `headers`/`referer` when fetching media | browser cannot send arbitrary referer/UA on media requests |
| 20-min link cache + dedupe | server-side TTL cache (per provider+episode) | identical semantics |
| `extractorVerifierJob` keep-alive polling | server-side timer task during active playback session | optional, per-provider |

### 3.4 What must NOT be reused

- **Upstream provider/extractor source** (GPL-3.0) — no copying.
- **Closed-source compiled extensions** (Phisher repo etc., no license) — no decompilation-derived code; black-box behavior observation only, and even then respect the platform's terms.
- **The unsandboxed plugin trust model** (`PluginManager` executes dex with full host privileges — `repository-analysis.md` §5). A web port must treat all provider code as first-party, or run third-party provider code only inside a restricted sandbox (no raw `fs`/network) with explicit capability grants.

---

## 4. AniKoto extension — porting feasibility

### 4.1 Distribution facts (all **VERIFIED** by static inspection)

- Distributed in the **Phisher Repo** (`github.com/phisher98/cloudstream-extensions-phisher`) and listed for the CNC Verse repo; the CloudStream Wiki marks the Phisher Repo **closed-source** (🛑).
- Default branch of the repo contains **no source** — only `README.md`, `docs/`, `goal.json` (**VERIFIED** by listing). No public source repository for the AniKoto plugin was found via web search (**VERIFIED** absence of evidence in searched spaces; absence everywhere is **UNKNOWN** but effectively closed).
- Build artifact: `builds/AniKoto.cs3`, 81,777 bytes, `fileHash sha256-d9e69451709aa0386b1c99148239bf8e32c827e5fc4d603ef71095c889719e20`; `plugins.json` entry: `version 6`, `status 1 (ok)`, `language "en"`, `tvTypes ["Anime","AnimeMovie"]`, `apiVersion 1`, `authors ["phisher98"]`, icon hosted at `anikototv.to`.
- Package contents: `manifest.json` = `{"pluginClassName":"com.anikoto.AnikotoPlugin","name":"AniKoto","version":6,"requiresResources":false}` + `classes.dex` (188,328 bytes).
- **License: none found** in the distribution repo (**VERIFIED** by listing root). Unlicensed ⇒ all rights reserved ⇒ **no reuse of the compiled work is permitted**; even decompilation-derived code would be legally unusable.

### 4.2 Black-box structural findings (static `strings` analysis of `classes.dex` only — never executed)

- Class layout: `com.anikoto.AnikotoPlugin` (entry, extends `BasePlugin`, references `@CloudstreamPlugin` annotation machinery), `com.anikoto.Anikoto` (the `MainAPI`), `AnikotoExtractorsKt` (`extractMegaPlayUrl`), `AnikotoUtilsKt` (`parseAnimeData`), data classes `MetaAnimeData`, `MetaEpisode`, `ImageData`, `ServerEntry`, and per-host resolver classes `MegaPlay`, `Vidtube`, `Vidwish`.
- Method structure mirrors the standard provider lifecycle: `getMainPage`, `search`, `load`, `loadLinks`, `resolveEmbed`, `resolveMapperServers`, `resolveServers`.
- Runtime dependencies referenced in the dex: `kotlinx-coroutines`, `kotlinx-serialization`, `org.jsoup`, `com.fasterxml` (jackson), `okhttp3.Interceptor` (1). **No Rhino/JS-engine references** — i.e. the provider relies on straightforward HTTP+HTML/JSON scraping, no client-side JS de-obfuscation engine.
- Endpoints observed as string constants (behavioral map, not a scrape instruction): site `anikototv.to`; mapping services `api.ani.zip/mappings` (public episode/MAL mapping API) and `mapper.nekostream.site/api/mal/`; playback hosts `megaplay.buzz`, `vidtube.site`, `vidwish.live`, CDN `mewcdn.online`; plus non-streaming strings (`buymeacoffee.com`, `supportbot.phisher2.workers.dev`, an ad-pixel domain `omg10.com`).
- Android-flavored references exist in the dex (42 hits incl. `androidx.fragment.app.*`, `AppCompatActivity`, widget classes) — consistent with compilation against the Android app JAR; some may be unused leftovers. This further confirms Android coupling.

### 4.3 What a compliant port requires (INFERRED, design-level)

1. **Do not port the binary or any decompiled code.** Write a new TypeScript provider that talks to the *same public endpoints* (site + mapping APIs + embed hosts), honoring their terms of service.
2. Effort is moderate: no JS-deobfuscation engine is referenced, so a plain fetch+cheerio/zod pipeline should suffice *if* no anti-bot JS challenge is actually triggered — that part is **UNKNOWN** until runtime probing during implementation.
3. Embed resolution (`MegaPlay`, `Vidtube`, `Vidwish`) is provider-specific scraping; each needs its own extractor with referer/headers handling and a server proxy for playback (see §5).
4. Legal exposure is *higher* than average: closed-source derivative status, ad-injection strings in the binary, and an unlicensed distribution. The web project should treat AniKoto as a *reference architecture example only*, and ship its own first-party providers for lawful content first.

---

## 5. Playback compatibility mapping (browser)

`ExtractorLinkType` → browser playback strategy:

| CloudStream type | MIME (`getMimeType()`, `ExtractorApi.kt:435–443`) | Browser strategy |
|---|---|---|
| `VIDEO` (progressive) | `video/mp4` | native `<video>` / MediaSource for byte-range; usually plays directly |
| `M3U8` (HLS) | `application/x-mpegURL` | `hls.js` (MSE). Encrypted HLS (AES-128 keys) supported by hls.js; Widevine-in-HLS not feasible without CDM. |
| `DASH` (MPD) | `application/dash+xml` | `dash.js` or `shaka-player` (MSE). CloudStream notes "no download support" — playback-only there too. |
| `TORRENT` / `MAGNET` | `application/x-bittorrent` | **not feasible in a browser** (same as CloudStream: "No support at the moment"). Exclude from v1 scope. |
| DRM links (`DrmExtractorLink` with ClearKey kid/key) | — | ClearKey via EME is technically feasible; Widevine/PlayReady require licensed CDMs + license servers — out of scope. |

Two operational constraints dominate (**INFERRED, standard browser behavior**):

- **CORS on media**: `hls.js`/`dash.js` fetch segments via XHR/fetch ⇒ the manifest host must send CORS headers, or segments must be relayed through a same-origin proxy that injects the provider's `referer`/`headers`. Most provider CDNs do **not** send permissive CORS. A segmented streaming proxy is therefore a first-class architectural component (with bandwidth, caching, and abuse controls).
- **Headers/referer enforcement**: browsers do not allow custom `Referer`/User-Agent on media element requests; links requiring them must go through the proxy. CloudStream solves the same problem with okhttp datasources + `getVideoInterceptor()` — the web equivalent is the proxy.

---

## 6. Risk register

| # | Risk | Severity | Basis | Mitigation |
|---|---|---|---|---|
| 1 | **Legal/copyright**: aggregating third-party streaming sources can facilitate infringement; GPL-3.0 upstream; unlicensed extensions | Critical | `LICENSE` (GPL-3.0, VERIFIED); no-license Phisher repo (VERIFIED) | Ship providers for lawful/public-domain/authorized content only; no upstream code copying; takedown policy; jurisdictional counsel before any public deployment |
| 2 | **Security — provider code**: Android model executes unsandboxed plugins (VERIFIED); naive ports replicate this | Critical | `PluginManager.kt:593–687` | First-party providers only; if third-party support is ever added: server-side sandbox (isolated VM/QuickJS), no ambient network/fs, per-provider rate limits |
| 3 | **Security — SSRF/SSUI**: providers fetch arbitrary URLs on our server | High | architectural inference | URL allowlists, private-IP blocking (169.254/10./127. etc.), redirect caps, response size caps |
| 4 | **Security — untrusted content**: provider HTML/JSON/headers flow into the UI (XSS), or into `headers` we replay | High | contract streams arbitrary `ExtractorLink.headers` (VERIFIED) | validate/normalize headers (block `Host`, `Cookie`, hop-by-hop), sanitize strings, CSP, never `dangerouslySetInnerHTML` |
| 5 | **CORS/streaming proxy**: needed for both metadata and media | High | §4–5 | same-origin API routes + media relay; auth-gate the relay; disk/memory caps; referer injection allowlist |
| 6 | **Playback compatibility**: HLS/DASH/DRM variance, missing codecs | Medium | §5 | hls.js+dash.js feature matrix tests; quality fallback ladder; ClearKey-only DRM scope |
| 7 | **Maintenance — provider rot**: sites change constantly; upstream `apiVersion` is 1 but provider behavior churns weekly | High | ecosystem norms; official repo has 5 providers, community repos dozens | provider conformance test harness; health checks + remote `status` kill-switch (same as `SitePlugin.status`, `RepositoryManager.kt:50–78`) |
| 8 | **Maintenance — upstream drift**: upstream is actively KMP-ifying (COMPOSE.md, webMain) | Medium | VERIFIED | track upstream for contract changes; pin documented commit in our docs |
| 9 | **Abuse**: open proxy/relay becomes a free hotspot | Medium | design risk | auth, per-user quotas, no global caching of copyrighted media |

---

## 7. Bottom line

- The **contract and host-services design** of CloudStream (provider interface, extractor registry, cache/dedupe/sort, repository index format) is an excellent, well-bounded specification — and is fully portable as a spec. (**VERIFIED** scope of the contract; **INFERRED** portability conclusion)
- The **code** is GPL-3.0 JVM/Kotlin with Android dependencies at the edges; the **extensions** are dex packages tied to `PathClassLoader` + Android runtime; neither executes in a browser, and closed-source extensions add license barriers on top.
- The web port is therefore: **Next.js UI + server-side TypeScript provider adapters that re-implement the contract**, an **HTTP/HTML/JSON runtime with cookie-jar + optional headless fallback**, and a **media proxy + hls.js/dash.js playback stack** — with provider code treated as first-party and a strict legal/content policy.
