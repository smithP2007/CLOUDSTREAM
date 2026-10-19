# CloudStream Web (investigation phase)

A browser-based movie, series and anime application **inspired by** [CloudStream](https://github.com/recloudstream/cloudstream) — designed to run in a PC browser without the Android app.

**Status: investigation complete, implementation not started** (per project brief).

## Documentation

| Document | Contents |
|---|---|
| [`docs/repository-analysis.md`](docs/repository-analysis.md) | Upstream module map (`app/`, `shared/`, `library/`, `desktopApp/`), KMP build system, `.cs3` packaging, extension ecosystem, licenses |
| [`docs/provider-architecture.md`](docs/provider-architecture.md) | `MainAPI` contract, data model, extractor pipeline, host orchestration, end-to-end sequence |
| [`docs/web-compatibility-report.md`](docs/web-compatibility-report.md) | Why Android plugins can't run in browsers, reuse assessment, AniKoto case study, CORS/playback/security risk register |
| [`docs/implementation-roadmap.md`](docs/implementation-roadmap.md) | Phase 0–7 roadmap ordered by dependency & risk, with the exact next task |

## Key facts from the investigation

- Upstream is **GPL-3.0**; `library/` is a Kotlin Multiplatform core (android+jvm targets) with an aspirational, not-yet-compiled `webMain` source set. No web target ships today.
- `.cs3` extensions are ZIPs of `manifest.json` + `classes.dex` loaded via `PathClassLoader` — **cannot execute in a browser** (dex bytecode + Android runtime + CORS).
- Upstream's cross-platform mechanism (`isCrossPlatform` pure-JVM JARs, `jdeps`-verified) proves plugins can be written without Android APIs — the right *model*, still not browser-executable.
- The portable asset is the **contract** (provider interface + data shapes + extractor registry semantics), re-implemented clean-room in TypeScript.
- AniKoto (Phisher repo) is **closed-source, unlicensed**; only a compliant behavioral re-implementation against public endpoints is viable, and only after legal review.

## Planned stack (recommended)

Next.js (App Router, TypeScript strict) · server-side provider adapters (undici + cookie jar + cheerio + zod) · hls.js / dash.js / native `<video>` playback behind an authenticated media relay · SQLite/Prisma user data.

## Compliance

No upstream code copied; no compiled extension executed or decompiled for code reuse; providers target lawful content only. See `docs/implementation-roadmap.md` Phase 0.
