# Media Compatibility Report — Player Milestone (Phase 4, task 2 partial)

**Status:** Player implemented; media relay (Phase 4 task 1) deliberately NOT built (D21). This
document records what playback/conversion behavior is **actually verified**, with the evidence
type for every claim. **No format is claimed supported merely because its extension is
recognized** (owner instruction §12; D21.2).

**Verification vocabulary used below:**

- **UNIT-VERIFIED** — pinned by automated tests in this repo (vitest; deterministic, no network).
- **BROWSER-VERIFIED (headless Chromium)** — pinned by the Playwright E2E suite
  (`tests/e2e/`, Playwright's bundled Chromium headless shell, real decode).
- **MANUAL ONLY** — requires a human in a real browser; NOT executed in this environment and
  therefore **not claimed as verified**. Listed under "Manual verification outstanding".

---

## 1. Verified pipeline behaviors (all UNIT-VERIFIED unless noted)

| Behavior | Evidence |
|---|---|
| Container sniffing from signatures: MP4 (ftyp brands), MOV (qt), WebM vs Matroska (EBML DocType), Ogg, AVI (RIFF/AVI), FLV, MPEG-TS (sync bytes); unknown stays unknown | `tests/player-format-support.test.ts` |
| Extensions are HINTS only; playability comes from `canPlayType`/MSE probes at runtime | same |
| Decision flow order: validate → relay-required → native → HLS/DASH engine → conversion offer → honest typed failure | `tests/player-decision.test.ts` |
| Same-origin relative paths (/, ./, ../) playable; absolute http(s) playable; every other scheme (ftp/javascript/data/garbage) rejected as `invalid-source` | same |
| Provider links carrying headers/referer → `relay-required`, never played, never proxied (D8 scope pointed to) | same + E2E `demo-streams.spec.ts` (zero requests observed) |
| HLS strategy: MSE → hls.js; native HLS fallback (Safari-class); neither → unsupported | unit (probe-injected) |
| DASH strategy: MSE → Shaka Player; no MSE → unsupported (no native DASH exists) | unit (probe-injected) |
| Quality/source ordering reuses the CORE sort (desc, unknown last, stable) + URL dedupe | `tests/player-controller.test.ts` |
| Bounded source fallback after engine-fatal errors (no infinite retry; typed error when exhausted) | same |
| Object-URL lifecycle: create on add, revoke on remove/clear/dispose; revokeAll idempotent | same |
| Local subtitle intake: content-based VTT/SRT detection, SRT→VTT transform (CRLF/BOM safe), garbage → typed error | `tests/player-srt.test.ts` |
| Provider subtitles fetched ONCE, converted if SRT, served from local blob URLs (no cross-origin media mode needed); fetch failure = notice, not fatal | `tests/player-controller.test.ts` |
| Controller state machine (idle/loading/ready/playing/paused/buffering/ended/error), media-error code mapping (1/2/3/4 → typed codes) | same |
| Engine/session cleanup on source replacement and dispose; listeners removed; dispose idempotent | same |
| Playlist auto-advance on ended; next/previous wrap; per-item notes ("needs conversion", "needs relay") | same |
| Conversion: size bound enforced before any load; argv composed directly (no shell); progress clamped (non-finite ignored); abort → worker terminate + instance invalidation + `aborted`; non-zero exit → `conversion-failed`; no worker/WASM → `conversion-unavailable`; virtual-FS cleanup | `tests/player-conversion.test.ts` (fake wasm module — see §5) |
| **Real conversion end-to-end in a real browser** (Playwright Chromium): self-hosted ESM core loads (HTTP 200, ~0.4 s); the committed synthetic AVI (MPEG-4 part 2 + MP3) genuinely converts to MP4 (H.264 + AAC), exit code 0, 60 KiB output; the browser decodes the produced file and the clock advances; zero POST/PUT/PATCH requests — local media never transmitted | `tests/e2e/conversion-real.spec.ts` (BROWSER-VERIFIED; also `scripts/audit-ffmpeg-real.mjs` captured the full FFmpeg log stream) |
| **Mid-run cancellation + recovery in a real browser**: on a 60 s input the progress bar reports > 0 %; Cancel → worker terminated → typed "Conversion cancelled." surface, no output item; a fresh run afterwards rebuilds the engine and converts again | same (BROWSER-VERIFIED) |
| Output-profile probing is honest: the profile named in the UI equals what THAT browser's `canPlayType` sequence picks (MP4 preferred, WebM fallback, none → no offer) | same (BROWSER-VERIFIED — assertion mirrors `pickConversionProfile` and is evaluated against the live browser) |
| UI components: picker upload, source selector states, subtitle selection, playlist removal/clear, conversion progress/cancel/error | `tests/player-components.test.tsx` (jsdom) |
| Lazy loading: hls.js / Shaka / ffmpeg wrapper appear ONLY in lazy chunks (demo build: main 352 KB; hls.js 564 KB and shaka 848 KB isolated) | Vite build output inspection |

## 2. Stream/container formats

| Format | Native browser playback | Conversion path | Verification status |
|---|---|---|---|
| MP4 (H.264/AAC) | Where the browser reports support (Chrome/Firefox/Edge/Safari do) | n/a (native first) | Detection + decision UNIT-VERIFIED; decode BROWSER-VERIFIED only on Chromium builds WITH proprietary codecs (manual elsewhere) — OSS Chromium cannot decode H.264 |
| WebM (VP9/VP8/Opus) | Chrome/Firefox/Edge/Chromium | n/a | **BROWSER-VERIFIED** (E2E: real VP9/Opus decode, play/pause/seek semantics) |
| Ogg (Theora/Vorbis) | Only where `canPlayType` says so | via ffmpeg.wasm when unsupported | Detection UNIT-VERIFIED; playback MANUAL ONLY |
| MOV (H.264/AAC) | Browser-dependent (Safari yes; Chromium typically no) | via ffmpeg.wasm | Detection UNIT-VERIFIED; playback MANUAL ONLY |
| MKV (Matroska) | Generally NOT native (browsers demux WebM, not Matroska) | **yes — ffmpeg.wasm remux/transcode to MP4/WebM** | Decision path UNIT-VERIFIED (offer-conversion); the conversion pipeline itself is BROWSER-VERIFIED on the AVI input (same demux→decode→encode machinery); an MKV-specific run is still MANUAL ONLY |
| AVI (e.g. MPEG-4/MP3) | No native support anywhere | via ffmpeg.wasm | Decision UNIT-VERIFIED (local: offer; remote: honest unsupported); **conversion + output playback BROWSER-VERIFIED (real wasm run)** |
| FLV / MPEG-TS (raw) | No (TS via HLS engines only) | TS via HLS engines; FLV conversion-only | Decision UNIT-VERIFIED |
| HLS (`type:'hls'`) | hls.js under MSE; native HLS on Safari-class | n/a | Engine selection UNIT-VERIFIED; E2E exercised engine selection on the local HLS fixture; full segment playback MANUAL ONLY (OSS Chromium lacks H.264 decode) |
| DASH (`type:'dash'`) | Shaka Player under MSE (no native path) | n/a | Engine selection UNIT-VERIFIED; playback MANUAL ONLY (demo page carries the Akamai DASH test vector) |
| DRM (Widevine/FairPlay/PlayReady) | **OUT OF SCOPE — policy D7.** Shaka errors map to a typed `unsupported-format` with the D7 reference | none | Decision UNIT-VERIFIED (category mapping) |
| Torrent / magnet | Not in the v1 contract | none | Contract-level exclusion (Phase 1) |

## 3. Verified runtime behaviors in a real browser (Playwright, headless Chromium)

- Local WebM file: sniffed → native engine → object-URL playback with advancing clock; pause
  freezes, play resumes; no error surface (`tests/e2e/local-file.spec.ts`).
- Provider-shaped demo source (WebM fixture) plays through the SourceSelector with the decision
  reason shown (`tests/e2e/demo-streams.spec.ts`).
- Header-gated source → error overlay names the relay requirement + D8, and the page makes ZERO
  network requests for it.
- Remote AVI → typed unsupported-format limitation, zero requests.
- **Real ffmpeg.wasm conversion** (`tests/e2e/conversion-real.spec.ts`, run during the
  post-implementation audit): AVI fixture → MP4 output, converted and played; profile choice
  asserted against the browser's own probe; progress observed > 0 % and cancellation verified on
  a 60 s input; engine rebuild verified after terminate; zero upload verbs; all traffic on the
  demo origin plus the demo's documented public test-stream hosts.

## 4. Conversion engine (ffmpeg.wasm) — capability scope and limits

- Wrapper `@ffmpeg/ffmpeg@0.12.15` (MIT) + `@ffmpeg/util@0.12.2` (MIT) — dynamically imported
  only when a conversion runs (D22).
- Core `@ffmpeg/core@0.12.10` is **GPL-2.0-or-later**; the pinned build's full embedded
  configuration was extracted from the shipped binary (see §5 for the complete record).
  Output profiles offered: **MP4 (H.264 + AAC)** preferred, **WebM (VP9 + Opus)** fallback —
  chosen by PROBING the actual browser.
- Bounds: input ≤ 1.5 GiB by default (wasm32 practical ceiling ~2 GiB); exec timeout 30 min;
  cancellation terminates the worker; the original file is never modified and never uploaded
  (input SHA-256 verified unchanged after the real conversion run).
- **Core loading requires the ESM core build.** `@ffmpeg/ffmpeg@0.12.15` always spawns its
  internal worker with `{ type: "module" }`; `importScripts` does not exist there, so the
  wrapper's fallback does `await import(coreURL).default` — satisfiable only by the ESM core
  (`dist/esm`, which ends `export default createFFmpegCore`). The UMD core under a module
  worker fails with `ERROR_IMPORT_FAILURE` ("failed to import ffmpeg-core.js"). This was a
  real defect found and fixed during the post-implementation audit: the default CDN base and
  the copy script pointed at `dist/umd`; both now use `dist/esm` (the wasm payload is
  byte-identical between the two builds — sha256 `9f57947a…b7b7` — only the JS loader
  differs). Verified by the real-conversion E2E run above.
- **Conversion execution IS now browser-verified** (Playwright Chromium, real wasm core):
  initialization from the self-hosted path, real conversion (exit code 0), real output
  playback, progress events, mid-run cancellation, engine recovery, and resource cleanup
  (`deleteFile` cleanup ok; cancel → worker terminated → lazy rebuild).

## 5. FFmpeg core — exact version, license, and serving obligations (audit record)

**Artifact.** `@ffmpeg/core@0.12.10` (npm, registry metadata; `wasm` payload sha256
`9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`, 30.7 MiB, byte-identical
between `dist/umd` and `dist/esm`; the ESM loader JS sha256 is
`67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3`). Wrapper
`@ffmpeg/ffmpeg@0.12.15` and `@ffmpeg/util@0.12.2` (both MIT).

**License of the actual core: GPL-2.0-or-later.** Evidence: (a) the package's npm
`license` field; (b) the embedded configure line `--enable-gpl`; (c) GPL-only external
codecs compiled in (libx264, libx265). FFmpeg itself is LGPL-2.1-or-later; `--enable-gpl`
makes the resulting binary GPL. The wrapper/util stay MIT — the GPL applies to the core
artifact this app loads at runtime.

**Library lineage (read from the binary's own output during the verified conversion run):**
`Lavf61.7.103` (libavformat 61.7.x) and `Lavc59.37.100` (libavcodec 59.37.100) correspond to
the FFmpeg 7.1 series; x264 reports `core 164`. Upstream release notes were not reachable from
this environment, so the binary-embedded versions are the recorded evidence.

**Embedded build configuration (extracted verbatim from the shipped wasm):**
`--target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping
--disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect
--disable-autodetect --cc=emcc --cxx=em++ --disable-pthreads --disable-w32threads
--disable-os2threads --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx
--enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib
--enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg`
(single line in the binary; abbreviated here only at the emscripten toolchain flags).
`--disable-autodetect` means the table below is EXHAUSTIVE — no other external library is
compiled in (notably: no AV1 encoder/decoder — no libaom/dav1d; no HEVC decode beyond
libx265 encode; no libssh/tensorflow/etc.).

| Enabled external library | License |
|---|---|
| libx264 (H.264 encode) | GPL-2.0-or-later |
| libx265 (HEVC encode) | GPL-2.0-or-later |
| libvpx (VP8/VP9) | BSD-3-Clause |
| libmp3lame (MP3 encode) | LGPL-2.0-or-later |
| libtheora / libvorbis | BSD-3-Clause |
| libopus | BSD-3-Clause |
| libwebp | BSD-3-Clause |
| zlib / libzimg | zlib License |
| libfreetype | FTL / GPL-2.0-or-later dual |
| libfribidi | LGPL-2.1-or-later |
| libass | ISC |

**Serving obligations — they DO apply.** Serving the core files to site visitors conveys the
object code to their browsers (the GPL-2.0 obligations attach at that point). Dev-dependency
status and keeping the 30.7 MiB core out of Git do NOT remove them; they only mean the core is
acquired at deploy time from the pinned npm artifact.

1. **License text.** Include the GPL-2.0 text with any deployment that serves the core. The
   npm packages ship NO license file (verified) — the text must be taken from FFmpeg's
   `COPYING.GPLv2` / the ffmpeg.wasm repository LICENSE and committed as part of the
   deployment's legal files (e.g. `NOTICE`/`LICENSES/`), flagged for the Phase 7 NOTICE audit
   (D15-F gate).
2. **Corresponding source offer (GPL-2.0 §3).** For the pinned artifact: link the
   ffmpeg.wasm source repository (github.com/ffmpegwasm/ffmpeg.wasm, the build scripts that
   produced `@ffmpeg/core@0.12.10`) and the corresponding FFmpeg 7.1-series source, written
   into the same legal/notice files alongside the license text.
3. **Attribution & notices.** FFmpeg/x264 copyright and license notices must be preserved;
   libx264's banner explicitly states "Copyleft" — do not strip log metadata in a way that
   misrepresents provenance.
4. **Local-only development** (this repo's demo: `npm run fixtures:ffmpeg-core` + `npm run
   demo`) does not convey to third parties and carries no distribution obligation — the
   obligation starts when a deployment serves the core to users.
5. **CDN fallback caveat.** Loading from the pinned unpkg URL delegates delivery to a third
   party but does not transfer the obligations of whoever deploys the app, and the bytes are
   currently fetched WITHOUT integrity verification (no SRI/subresource hash on the blob
   fetch — recorded gap). **Deployment recommendation: self-host the pinned core** (one
   script copies the npm-pinned artifact into the served tree), ship the license text +
   source links next to it, and keep the CDN only as a documented dev fallback. If served
   under a CSP, the loading path requires `script-src`/`worker-src` allowing blob: workers
   and `'wasm-unsafe-eval'` for wasm compilation.

## 6. Manual verification outstanding (NOT executed in this environment)

1. **MKV and MOV conversion runs**: the conversion pipeline is browser-verified end-to-end on
   the AVI input (same demux → decode → encode machinery); MKV/MOV inputs have NOT been
   individually executed. Steps: `npm run fixtures:ffmpeg-core`, `npm run demo`, add
   `demo/public/fixtures/sample-mkv.mkv` / `sample-mov.mov`, "Convert and play", confirm
   output playback.
2. **HLS with H.264-capable browsers** (Chrome/Edge/Safari release builds): local HLS fixture
   (`/fixtures/hls/index.m3u8`) and the Mux/Apple demo streams; seek + segment gap behavior.
3. **DASH via Shaka** on the Akamai test vector (Chrome/Firefox/Edge release builds).
4. **Safari**: native HLS path (`application/vnd.apple.mpegurl`) and MOV probe behavior.
5. **Firefox**: canPlayType variance for Matroska/MOV; VP9 in Ogg; subtitle track rendering.
6. **Subtitle cue rendering** on real browsers (jsdom cannot verify `<track>` cue display):
   VTT and converted SRT timing sync after seeking.
7. **Keyboard navigation** pass (Space/K, arrows, M, F, N, P) in a real browser.
8. **Large-file memory pressure**: a multi-GB local file plays via object URL without UI stall
   (sniffing reads only 4 KiB, but the browser streams the rest); conversion of a genuinely
   large input (the audit ran tiny fixtures — bounded by design) under real memory pressure.
9. **CDN-fallback conversion run** (pinned unpkg ESM core) — the audit verified the
   self-hosted path; the CDN path uses the identical artifact but was not exercised.

## 7. Known limitations (honest list)

- **No media relay**: header/referer-gated provider sources are unplayable until the future
  authenticated, quota-limited relay (roadmap Phase 4 task 1, D8 scope) exists. The UI says so.
- **No DRM**: policy D7; DRM-protected DASH manifests surface as unsupported.
- **Codec support is per-browser**: any claim about MP4/MKV/MOV playback depends on the
  runtime `canPlayType` result of THAT browser; the UI shows the actual decision.
- **ffmpeg.wasm conversion is slow** (10–100× realtime), single-threaded (the MT core needs
  cross-origin isolation headers), memory-bound (wasm32), and its progress hook is
  experimental (upstream statement, recorded in D22).
- **Live demo streams** (Mux/Apple/Akamai/MDN) are third-party public test endpoints —
  availability is not guaranteed; failures surface as typed network errors.
- **StrictMode caveat (RESOLVED for the app, D24)**: React's mount→cleanup→mount simulation
  disposes the controller and re-runs effects without an intervening render; the hook swaps in
  a fresh instance when the render body observes disposal. The Phase 5 app runs WITH
  StrictMode enabled (recorded in D24) and the app-side player effects are keyed by controller
  instance; the dev-only demo page still runs without StrictMode. The no-duplicate-playlist
  behavior under StrictMode is pinned by a component test.
- **Next.js integration (Phase 5, D24)**: Turbopack cannot bundle `@ffmpeg/ffmpeg` 0.12.15
  (runtime-value `classWorkerURL` Worker construct). The Next build aliases the MIT wrapper +
  util packages to runtime-loader shims (`src/player/conversion/next-shims/`) that load
  byte-identical, pinned ESM copies self-hosted at `public/ffmpeg-lib/` (staged by
  `scripts/copy-fixtures-web.mjs`). Serving obligations are unchanged and tracked in
  `deployment-requirements.md`; conversion in the Next app additionally requires the core to
  be staged at `public/ffmpeg-core/` (mirror of the demo copy), otherwise it fails with the
  honest typed error rather than silently degrading.
- **Local media never leaves the device**: the player contains no upload code path; files are
  read via the File API (4 KiB head sniff) and object URLs only. Verified by code review +
  the E2E network assertions.
