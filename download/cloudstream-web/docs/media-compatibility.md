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
| UI components: picker upload, source selector states, subtitle selection, playlist removal/clear, conversion progress/cancel/error | `tests/player-components.test.tsx` (jsdom) |
| Lazy loading: hls.js / Shaka / ffmpeg wrapper appear ONLY in lazy chunks (demo build: main 352 KB; hls.js 564 KB and shaka 848 KB isolated) | Vite build output inspection |

## 2. Stream/container formats

| Format | Native browser playback | Conversion path | Verification status |
|---|---|---|---|
| MP4 (H.264/AAC) | Where the browser reports support (Chrome/Firefox/Edge/Safari do) | n/a (native first) | Detection + decision UNIT-VERIFIED; decode BROWSER-VERIFIED only on Chromium builds WITH proprietary codecs (manual elsewhere) — OSS Chromium cannot decode H.264 |
| WebM (VP9/VP8/Opus) | Chrome/Firefox/Edge/Chromium | n/a | **BROWSER-VERIFIED** (E2E: real VP9/Opus decode, play/pause/seek semantics) |
| Ogg (Theora/Vorbis) | Only where `canPlayType` says so | via ffmpeg.wasm when unsupported | Detection UNIT-VERIFIED; playback MANUAL ONLY |
| MOV (H.264/AAC) | Browser-dependent (Safari yes; Chromium typically no) | via ffmpeg.wasm | Detection UNIT-VERIFIED; playback MANUAL ONLY |
| MKV (Matroska) | Generally NOT native (browsers demux WebM, not Matroska) | **yes — ffmpeg.wasm remux/transcode to MP4/WebM** | Decision path UNIT-VERIFIED (offer-conversion); actual conversion MANUAL ONLY |
| AVI (e.g. MPEG-4/MP3) | No native support anywhere | via ffmpeg.wasm | Decision UNIT-VERIFIED (local: offer; remote: honest unsupported) |
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

## 4. Conversion engine (ffmpeg.wasm) — capability scope and limits

- Wrapper `@ffmpeg/ffmpeg@0.12.15` (MIT) + `@ffmpeg/util@0.12.2` (MIT) — dynamically imported
  only when a conversion runs (D22).
- Core `@ffmpeg/core@0.12.10` is **GPL-2.0-or-later**; its pinned build was verified to carry
  `--enable-gpl --enable-libx264 --enable-libvpx --enable-libvorbis --enable-libtheora
  --enable-libopus --enable-libmp3lame --enable-zlib`. Output profiles offered: **MP4 (H.264 +
  AAC)** preferred, **WebM (VP9 + Opus)** fallback — chosen by PROBING the actual browser.
- Bounds: input ≤ 1.5 GiB by default (wasm32 practical ceiling ~2 GiB); exec timeout 30 min;
  cancellation terminates the worker; the original file is never modified and never uploaded.
- **Conversion execution itself is NOT browser-verified in this environment** — unit tests run
  against a fake wasm module. Manual verification steps are listed below. This is an explicit,
  recorded gap: do not treat "convertible" in the UI as "verified end-to-end" until §5 is done.

## 5. Manual verification outstanding (NOT executed in this environment)

1. **Real conversion run**: open `npm run demo`, `npm run fixtures:ffmpeg-core` (self-hosted
   core) or allow the pinned CDN, add `demo/public/fixtures/sample-mkv.mkv` / `sample-avi.avi`,
   press "Convert and play", confirm playback of the output, cancel mid-run, and confirm the
   original file is untouched.
2. **HLS with H.264-capable browsers** (Chrome/Edge/Safari release builds): local HLS fixture
   (`/fixtures/hls/index.m3u8`) and the Mux/Apple demo streams; seek + segment gap behavior.
3. **DASH via Shaka** on the Akamai test vector (Chrome/Firefox/Edge release builds).
4. **Safari**: native HLS path (`application/vnd.apple.mpegurl`) and MOV probe behavior.
5. **Firefox**: canPlayType variance for Matroska/MOV; VP9 in Ogg; subtitle track rendering.
6. **Subtitle cue rendering** on real browsers (jsdom cannot verify `<track>` cue display):
   VTT and converted SRT timing sync after seeking.
7. **Keyboard navigation** pass (Space/K, arrows, M, F, N, P) in a real browser.
8. **Large-file memory pressure**: a multi-GB local file plays via object URL without UI stall
   (sniffing reads only 4 KiB, but the browser streams the rest).

## 6. Known limitations (honest list)

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
- **StrictMode caveat**: React's mount→cleanup→mount simulation disposes the controller and
  re-runs effects without an intervening render; the hook swaps in a fresh instance when the
  render body observes disposal, but the dev-only demo page runs without StrictMode. The
  Phase 5 app shell must make (and record) its own StrictMode decision when integrating the
  player (see `usePlaybackController.ts` header note).
- **Local media never leaves the device**: the player contains no upload code path; files are
  read via the File API (4 KiB head sniff) and object URLs only. Verified by code review +
  the E2E network assertions.
