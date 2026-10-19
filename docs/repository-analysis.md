# CloudStream Repository Analysis

**Project:** CloudStream-inspired browser application (investigation phase)
**Document status:** Investigation report — no implementation performed
**Analysis method:** Static inspection of shallow clones. Repositories were read locally; no upstream repository was modified, no compiled extension was executed, and no upstream implementation code was copied into this project.

## 0. Evidence baseline

| Repository | Commit inspected | Date | Purpose |
|---|---|---|---|
| `recloudstream/cloudstream` | `eb962b4fb7b1387b8de42ec58000cee0a01fe741` | 2026-10-18 | Main app + KMP library |
| `recloudstream/extensions` | `cf16b3b45cda911a36ddca69f9acbe4763c6a4b1` | 2026-05-23 | Official provider extensions (source) |
| `recloudstream/gradle` | `32895aedb6366f5075cb99bbd2e6ce0a7cac325d` | 2026-07-02 | Gradle plugin that builds `.cs3` packages |
| `phisher98/cloudstream-extensions-phisher` (branch `master`) | `89aa8e6cbaa345fad37e05dea68e2614352389f8` | 2026-10-11 | Third-party extension distribution repo (closed-source) |
| `phisher98/cloudstream-extensions-phisher` (branch `builds`) | shallow clone, 2026-10-20 | — | Compiled `.cs3` artifacts + `plugins.json` (static inspection only) |

All file citations below use paths relative to the repository root and line numbers at the commit listed above. Line numbers may drift on newer commits.

**License finding (VERIFIED):** `recloudstream/cloudstream/LICENSE` is the **GNU General Public License, Version 3** ("GPL-3.0", file header lines 1–5). This has direct consequences for any reuse — see §6 and `web-compatibility-report.md`.

---

## 1. Repository map

`settings.gradle.kts:21` declares five modules — **VERIFIED**:

```kotlin
include(":app", ":shared", ":library", ":docs", ":desktopApp")
```

### 1.1 `library/` — the Kotlin Multiplatform core (most important module)

**VERIFIED** from `library/build.gradle.kts`:

- KMP module published as `com.lagradost.api` (groupId at `library/build.gradle.kts:129`, version `1.0.1` at line 21).
- Targets: **Android** (`android { … }`, lines 25–39, namespace `com.lagradost.api`) and **desktop JVM** (`jvm()`, line 41).
- Source sets present on disk: `androidMain`, `commonMain`, `commonTest`, `jvmCommonMain`, `jvmMain`, `jvmTest`, `webMain`, `webTest` (**VERIFIED** by directory listing).
- **Critical nuance:** `webMain`/`webTest` source sets exist but the `kotlin { … }` block declares **no JS or wasmJs target** (lines 20–86). `webMain` is therefore currently *not compiled* by this build script. Upstream is clearly *preparing* for web, but has not shipped a web target. (**VERIFIED** for the build script; the intent is corroborated by `COMPOSE.md` and by `library/src/webMain/kotlin/com/lagradost/api/Log.kt`, whose comments say "There is no console.debug in Kotlin/JS (Yet)" — i.e. written for a future Kotlin/JS target.)

`commonMain` dependencies (`library/build.gradle.kts:55–69`) — **VERIFIED**:

| Dependency | Role | Notes for a web port |
|---|---|---|
| `jackson-module-kotlin` | JSON parsing | JVM reflection-based; not browser-viable |
| `jsoup`, `ksoup` | HTML parsing | jsoup = JVM; ksoup = KMP port of jsoup (browser-capable in principle) |
| `kotlinx-coroutines`, `kotlinx-datetime`, `kotlinx-io`, `kotlinx-serialization-json`, `kotlinx-atomicfu` | async/time/JSON | KMP-ready |
| `ktor-http` | URL model only (`io.ktor.http.Url`) | KMP-ready |
| `nicehttp` (v0.4.18, `gradle/libs.versions.toml:44,136`) | HTTP client (OkHttp wrapper by Blatzar) | OkHttp = JVM; not browser-viable; fine on a Node server via an equivalent |
| `rhino` (strictly 1.8.1, `toml:50,142`) | JavaScript engine (Mozilla Rhino) for extractor de-obfuscation | Pure Java; JVM-only; a web port substitutes the browser/Node JS runtime itself |
| cryptography bundle | AES etc. for extractors | portable in principle |

`jvmCommonMain` adds `kotlin-reflect` and `newpipeextractor` v0.26.3 (`library/build.gradle.kts:76–85`, `toml:42,133`) — used for YouTube/trailers; JVM-only.

Key contents of `library/src/commonMain/kotlin/com/lagradost/cloudstream3/` (**VERIFIED** by listing):

- `MainAPI.kt` (2,861 lines) — the provider contract + data model (detailed in `provider-architecture.md`).
- `utils/ExtractorApi.kt` (1,473 lines) — `ExtractorLink` model, `ExtractorApi` base class, `loadExtractor()`, built-in extractor registry.
- `extractors/` — ~100 built-in `ExtractorApi` implementations (DoodExtractor, StreamTape, Mp4Upload, StreamWish, Filemoon, OkRuExtractor, …) plus `extractors/helper/` (GogoHelper, WcoHelper, AesHelper, CryptoJSHelper, NineAnimeHelper, …).
- `plugins/BasePlugin.kt`, `plugins/CloudstreamPlugin.kt` — the platform-neutral plugin API that `.cs3` extensions compile against.
- `network/WebViewResolver.kt` — `expect class` with per-platform `actual`s (see §3).
- `mvvm/`, `utils/` (JsUnpacker.kt, JsInterpreter.kt, JsHunter.kt, M3u8Helper.kt, HlsPlaylistParser.kt, SubtitleHelper.kt, …).

### 1.2 `app/` — the Android application

**VERIFIED** by listing `app/src/main/java/com/lagradost/cloudstream3/`:

- `MainActivity.kt`, `MainActivityScreen.kt`, `CloudStreamApp.kt`, `AcraApplication.kt` (ACRA crash reporting), `CommonActivity.kt`.
- `plugins/` — `PluginManager.kt` (968 lines), `Plugin.kt` (Android-enriched `BasePlugin` with `Resources`), `RepositoryManager.kt` (extension repository index handling), `VotingApi.kt`.
- `ui/` — View-based UI mid-migration to Compose; `ui/home/HomeViewModel.kt`, `ui/search/SearchViewModel.kt`, `ui/result/ResultViewModel2.kt`, `ui/player/` (`CS3IPlayer.kt`, `GeneratorPlayer.kt`, `RepoLinkGenerator.kt`, `IGenerator.kt`, `UpdatedMatroskaExtractor.kt`, …), `ui/APIRepository.kt`.
- `network/` — `CloudflareKiller.kt`, `DdosGuardKiller.kt`, `DohProviders.kt`, `RequestsHelper.kt`.
- `syncproviders/`, `subtitles/`, `services/` (background work), `receivers/`, `widget/`, `actions/`, `mvvm/`, `utils/`.

**VERIFIED** from `app/build.gradle.kts:229–293` and `gradle/libs.versions.toml`: media3 1.9.3 (ExoPlayer) with okhttp/cronet data sources, Compose bundles, coil, biometric, TV/QR support, `zipline` (Cash App Zipline — declared as a dependency at `app/build.gradle.kts:279`; where it is used was **not verified** — the runtime role is UNKNOWN), `torrentserver`, conscrypt, jackson, gson, fuzzywuzzy, nicehttp, rhino, jsoup/ksoup.

**VERIFIED** from `gradle/libs.versions.toml:67–69`: `minSdk = 23`, `compileSdk = 37`, `targetSdk = 36`.

### 1.3 `shared/` — Compose Multiplatform UI shell

**VERIFIED** by listing:

- Source sets: `commonMain`, `androidMain`, `jvmMain` (no web source set).
- `commonMain/kotlin/com/lagradost/cloudstream4/` — new-generation UI: `compose/` (Button, Chip, Dialog, TextField, color picker…), `theme/` (Palette, Scheme, Font, DeviceTheme with `jvmMain`/`androidMain` actuals), `viewmodels/GithubViewModel.kt`, `state/` (ImmutableState.kt, Viewmodel.kt, LogState.kt), `DevicePreferenceStore.kt` with per-platform actuals.
- Also vendors `com.mihon.*` presentation/settings components (Mihon = Tachiyomi successor project) under `shared/src/commonMain/kotlin/com/mihon/`, with its own LICENSE file in that subtree.
- `shared/readme.md` exists; the module consumes fonts/resources via Compose resources.

Purpose: shared declarative UI for Android and desktop, per the migration document `COMPOSE.md` ("This is part of the effort to make CloudStream cross platform, as it allows us to decouple UI and logic" — **VERIFIED quote**, `COMPOSE.md` §1). `COMPOSE.md` §2 mandates: "any pull requests must ensure that they use KMP-compatible libraries only."

### 1.4 `desktopApp/` — Compose Desktop (JVM) entry

**VERIFIED** from `desktopApp/build.gradle.kts`:

- KMP + Compose Multiplatform plugins; `jvm()` target only (lines 9–25).
- Depends on `project(":shared")` and `project(":library")` (lines 21–22).
- Main class `com.lagradost.cloudstream4.MainKt` (line 34); packaged natively as Dmg/Msi/Deb (lines 35–38).

**VERIFIED:** `desktopApp/src/jvmMain/kotlin/com/lagradost/cloudstream4/Main.kt` is currently a *Hello-World skeleton* — it renders a window with buttons and a switch preference and contains no provider browsing, search, or playback. The desktop app is an early WIP. **No desktop plugin loader exists:** a repository-wide search found **no** `URLClassLoader` usage outside tests (**VERIFIED** by search), so `.cs3`/plugin loading remains Android-only in practice today, despite the cross-platform JAR build support in the Gradle plugin (§4).

### 1.5 `docs/` module

A Dokka-based documentation module (`docs/build.gradle.kts`) that publishes API docs for the `library` module (Dokka configuration lives in `library/build.gradle.kts:134–151`). Not application code.

### 1.6 Other root files

- `README.md` — project overview.
- `COMPOSE.md` — migration guide to Compose/MVI/KMP (quoted above).
- `AI-POLICY.md` — upstream policy requiring AI-usage disclosure in PRs (**VERIFIED**; relevant for how this project interacts with upstream — we do not contribute upstream).
- `discoverium.yml`, `jitpack.yml`, `fastlane/` (F-Droid metadata), `gradle/` (version catalog), `proguard` rules.

---

## 2. The extension ecosystem (distribution model)

CloudStream decouples the app from content sources entirely. Providers live in **extension repositories** distributed as plain JSON indexes + compiled packages (**VERIFIED** in both the official and third-party repos):

1. **Repository index (`repo.json`)** — official example `recloudstream/extensions/repo.json`:
   ```json
   {
     "name": "Cloudstream providers repository",
     "description": "Cloudstream extension Repository",
     "manifestVersion": 1,
     "pluginLists": ["https://raw.githubusercontent.com/recloudstream/extensions/builds/plugins.json"]
   }
   ```
   Parsed by `RepositoryManager.kt` data class `Repository` (`app/src/main/java/com/lagradost/cloudstream3/plugins/RepositoryManager.kt:34–40` — fields: `iconUrl`, `name`, `description`, `manifestVersion`, `pluginLists`).

2. **Plugin list (`plugins.json`)** — a JSON array of `SitePlugin` entries. Schema **VERIFIED** at `RepositoryManager.kt:50–78`: `url` (to the `.cs3` file), `status` (0 down / 1 ok / 2 slow / 3 beta-only, comment at lines 43–48), `version` (int; any change triggers auto-update), `apiVersion`, `name`, `internalName`, `authors`, `description`, `repositoryUrl`, `tvTypes`, `language`, `iconUrl`, `fileSize`, `fileHash`. The Gradle plugin additionally emits `jarUrl`/`jarHash`/`jarFileSize` for cross-platform JARs (`cloudstream-gradle-plugin/.../entities/PluginEntry.kt` — **VERIFIED**).

3. **Package (`.cs3`)** — a ZIP containing `manifest.json` + `classes.dex` (and optionally Android resources). Details in §4.

4. **Official source repo** `recloudstream/extensions` contains five providers as Gradle subprojects: DailymotionProvider, InternetArchiveProvider, InvidiousProvider, TwitchProvider, YoutubeProvider (**VERIFIED** by listing). Example `YoutubeProvider/build.gradle.kts` sets `isCrossPlatform = true` — i.e. upstream's own flagship cross-platform example provider is YouTube.

5. **Community wiki** (`cloudstream.miraheze.org/wiki/List_of_extensions`) catalogs dozens of third-party repos and marks closed-source ones with 🛑 (**VERIFIED** via web search of the wiki page).

---

## 3. Android-specific vs portable code inventory

**Android-specific (VERIFIED imports/usages):**

| Concern | Location | Android dependency |
|---|---|---|
| Plugin loading | `app/.../plugins/PluginManager.kt:61,611` | `dalvik.system.PathClassLoader` (dex bytecode) |
| Plugin resources | `PluginManager.kt:645–659` | `android.content.res.AssetManager`, `Resources` |
| Plugin runtime context | `PluginManager.kt` imports lines 3–20 | `android.app.Activity/Notification`, `android.widget.Toast`, `FragmentActivity` |
| WebView-based link resolution | `library/.../network/WebViewResolver.kt` (expect) + `androidMain/.../WebViewResolver.android.kt` (actual) | `android.webkit.WebView` |
| JVM stub for the same | `library/jvmMain/.../WebViewResolver.jvm.kt:63` | `TODO("Not yet implemented")` — desktop JVM has **no** WebView resolver today |
| Cloudflare bypass | `app/.../network/CloudflareKiller.kt:4,25–28` | `android.util.Log`, `android.webkit.CookieManager` (an okhttp `Interceptor`) |
| Playback | `app/.../ui/player/CS3IPlayer.kt:20–22` | androidx.media3 (ExoPlayer) |
| Preferences/storage | `shared/.../DevicePreferenceStore.android.kt`, `com/mihon/common/preference/AndroidPreference*.kt` | `android.content.SharedPreferences`/DataStore |
| HTTP for business logic | `nicehttp` (OkHttp) | JVM — portable to a *server*, not to a *browser* |

**Portable-in-principle (pure Kotlin/JVM logic, VERIFIED locations):**

- The entire provider contract and data model in `library/src/commonMain/.../MainAPI.kt` (no Android imports in commonMain).
- `ExtractorApi`/`ExtractorLink` model and `loadExtractor()` matching logic.
- Text/JS utilities: `JsUnpacker.kt`, `JsInterpreter.kt`, `JsHunter.kt`, `M3u8Helper.kt`, `HlsPlaylistParser.kt`, `Levenshtein.kt`, `StringUtils.kt`.
- Most built-in extractors in `library/.../extractors/` are plain HTTP + regex/HTML logic.
- `ksoup` HTML parsing; `kotlinx.serialization` JSON.

**Caveat (VERIFIED):** portability is *architectural*, not *binary*. All of the above compiles today to JVM bytecode (Android/JVM targets). A browser cannot execute JVM bytecode; upstream's answer for true web support is still in progress (uncompiled `webMain` source set, `COMPOSE.md` KMP mandate).

---

## 4. How a `.cs3` extension is built and packaged

From `recloudstream/gradle` at commit `32895ae` (**all VERIFIED** by reading task sources):

1. `CompileDexTask.kt:58–63` — compiles the plugin's JVM `.class` files to **`classes.dex`** using the Android build tools' `DexArchiveBuilder.createD8DexBuilder` (D8) *with desugaring* ("Make all plugins work on lower android versions").
2. `GenerateManifestTask.kt` — writes **`manifest.json`** into build intermediates: `{ name, pluginClassName, version, requiresResources }` (schema matches `BasePlugin.Manifest`, `library/.../plugins/BasePlugin.kt:65–77`).
3. `Tasks.kt:146–184` — the `make` **Zip task**: packs `manifest.json` + `classes.dex` (+ optional resources from a compiled resources APK, excluding `AndroidManifest.xml` when `requiresResources = true`), sets `archiveExtension.set("cs3")`. Output: `<pluginName>.cs3`.
4. `WriteCacheEntryTask.kt` / `MakePluginsJsonTask.kt` — emit `plugin-entry.json` / aggregate `plugins.json` with the raw download URL, `fileSize`, `fileHash`, `apiVersion`, `tvTypes`, etc. (`entities/PluginEntry.kt`).
5. **Cross-platform mode** — `CloudstreamExtension.kt` (bottom of file): `isCrossPlatform = false` by default; when `true`: *"Enable this if your plugin does not use any android imports or app references. This will generate jar files using :make and these files can be checked with :ensureJarCompatibility"*. `CompilePluginJarTask.kt` copies the full (non-dex) JAR; `EnsureJarCompatibilityTask.kt:39–50` runs `jdeps` and **fails the build if the JAR contains `android.` imports**. The resulting `plugin-entry.json` carries `jarUrl`, `jarHash`, `jarFileSize` (`PluginEntry.kt`).

Interpretation (INFERRED, strongly supported): upstream's own path to non-Android hosts is *pure-JVM plugin JARs* validated to be Android-free — a prerequisite for eventually running providers on desktop JVM and, later, other targets. It is **not** a browser solution by itself: browsers cannot execute JVM bytecode.

---

## 5. Extension runtime security model (what the host trusts)

The Android host does the following when loading a plugin (**VERIFIED**, `app/.../plugins/PluginManager.kt`):

- Downloads the `.cs3` from the repository URL, stores it at `context.filesDir/Extensions/<sanitized-repo-hash>/<sanitized-name-hash>.cs3` (`getPluginPath`, lines 747–755; `ONLINE_PLUGINS_FOLDER = "Extensions"` at `RepositoryManager.kt:99`), with optional SHA-256 verification (`RepositoryManager.sha256`, line 110; `fileHash` in `plugins.json`).
- Copies to app-external storage and marks the file **read-only** before loading (lines 527–533, 600–609) — a workaround for Android 14+ restrictions on dynamically loaded dex ("W^X" policy).
- Creates a `PathClassLoader(filePath, context.classLoader)` (line 611), reads `manifest.json` from the package (lines 613–621), reflectively instantiates `manifest.pluginClassName` (lines 631–634), and calls `load()` (lines 669–673).
- Registration happens through `BasePlugin.registerMainAPI()` / `registerExtractorAPI()` (`library/.../plugins/BasePlugin.kt:20–35`), which push instances into `APIHolder.allProviders` / `extractorApis` tagged with `sourcePlugin = filename` — enabling targeted unloading (`unloadPlugin`, `PluginManager.kt:689–731`).
- Safe mode: a file named `safe` in the CloudStream folder forces plugins not to load (`checkSafeModeFile`, lines 579–588).

**Assessment (INFERRED):** extensions run with **full host privileges** inside the app process — there is no sandbox, capability negotiation, or network/file permission layer. The only mitigations are user trust in repositories, `fileHash` pinning, remote `status` kill-switch, and read-only dex. This is a crucial lesson for our web architecture: a browser-based re-implementation should *not* replicate this trust model; server-side provider code must be sandboxed or first-party-authored.

---

## 6. Licensing implications

- **CloudStream app + library: GPL-3.0 (VERIFIED, `LICENSE`).** Consequences:
  - Copying any upstream *source* into this project would force the web project to GPL-3.0. Per the project brief, we do **not** copy code; we re-implement an interface contract inspired by the architecture in TypeScript. Interface/architecture ideas, method shapes, and JSON schemas are being used as a functional specification.
  - If we ever link/consume the `com.lagradost.api` JVM artifact server-side (e.g. a Kotlin microservice), that service would be a derivative work → GPL-3.0 obligations. Recommended posture: **no upstream code/artifact linking**; clean-room TypeScript implementation.
- **Official extensions repo** `recloudstream/extensions`: repository has no top-level LICENSE file (**VERIFIED** by listing); individual providers inherit the repo state. Treat as "all rights reserved" for code-copy purposes; the *behavioral* knowledge (which endpoints exist) is not licensable.
- **Phisher repo** (`cloudstream-extensions-phisher`): no LICENSE file (**VERIFIED**), and the CloudStream wiki explicitly marks it **closed-source** (**VERIFIED** via wiki page). Compiled `.cs3` files are distributed for use in the Android app only. Decompilation-derived reuse would be legally risky; this project does static, black-box inspection only.
- **Vendored third-party code inside cloudstream:** `shared/src/commonMain/kotlin/com/mihon/` carries its own LICENSE file (Apache-2.0 lineage from Mihon — **VERIFIED** that a LICENSE file exists there; exact text present in repo).

---

## 7. Findings specific to "can we reuse this for a browser app?"

1. **The architecture is reusable; the binaries are not.** `library` is a thoughtfully layered KMP core with Android confinement isolated to `androidMain`/`app` (expect/actual for `WebViewResolver`, `ContextHelper`, `Log`, `Coroutines`, `SubtitleHelperPlatform`). But it currently ships only Android+JVM bytecode. (**VERIFIED**)
2. **Upstream is converging toward cross-platform** (`COMPOSE.md`, `shared/`, `desktopApp/`, `isCrossPlatform` plugin JARs, `webMain` source set) but has **no working web target today**. (**VERIFIED**)
3. **The plugin trust model must not be ported.** Android plugins execute unsandboxed dex with full privileges. A web project should treat providers as server-side, first-party code, or sandbox them explicitly. (**INFERRED** from verified loading code)
4. **GPL-3.0 + closed-source third-party extensions** prohibit code copying in both directions. Behavioral-level reimplementation in a different language, from public documentation/observation, is the compliant path. (**INFERRED** from license texts)
5. **Cloudflare/anti-bot machinery is Android WebView-bound** (`CloudflareKiller`, `WebViewResolver.android.kt`); a web port must solve this with headless-browser tooling on the server or avoid protected hosts. (**VERIFIED** for the Android implementation; the server-side alternative is design guidance)
