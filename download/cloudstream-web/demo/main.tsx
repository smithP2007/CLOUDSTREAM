/**
 * DEV-ONLY player demo page (decision D23). This page:
 *  - is NOT part of the library build and NOT reachable from `src/`;
 *  - registers NO provider and never touches `ProviderRegistry`;
 *  - plays (a) files the user opens locally (never uploaded), (b) tiny
 *    generated fixtures served by this dev server, (c) a few LAWFUL public
 *    test streams with documented provenance (see PROVENANCE below).
 */

import { createRoot } from 'react-dom/client';
import { MediaPlayer } from '../src/player/MediaPlayer';
import type { PlaybackLink, SubtitleFile } from '../src/core/types';
import './demo.css';

/**
 * PROVENANCE (lawful demo sources only):
 *  - Big Buck Bunny: (c) Blender Foundation | peach.blender.org, CC BY 3.0.
 *    Hosted as PUBLIC TEST streams by Mux (test-streams.mux.dev) and Akamai
 *    (dash.akamaized.net). Availability is not guaranteed.
 *  - Apple BipBop advanced example stream: Apple's public HLS test stream
 *    (devstreaming-cdn.apple.com), test content by Apple.
 *  - MDN flower.mp4: CC0 sample media published by MDN for documentation.
 * None of these are bundled or committed; failures surface as typed errors.
 */
const demoLinks: PlaybackLink[] = [
  {
    source: 'fixture',
    name: 'Generated fixture — MP4 (H.264 + AAC)',
    url: '/fixtures/sample-mp4.mp4',
    type: 'video',
    quality: 180,
    headers: null,
    referer: null,
  },
  {
    source: 'fixture',
    name: 'Generated fixture — WebM (VP9 + Opus)',
    url: '/fixtures/sample-webm.webm',
    type: 'video',
    quality: 180,
    headers: null,
    referer: null,
  },
  {
    source: 'fixture',
    name: 'Generated fixture — HLS VOD (MPEG-TS segments)',
    url: '/fixtures/hls/index.m3u8',
    type: 'hls',
    quality: 180,
    headers: null,
    referer: null,
  },
  {
    source: 'mux-test',
    name: 'Big Buck Bunny — HLS (Mux public test stream)',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    type: 'hls',
    quality: 720,
    headers: null,
    referer: null,
  },
  {
    source: 'apple-test',
    name: 'Apple BipBop — advanced HLS example',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
    type: 'hls',
    quality: 1080,
    headers: null,
    referer: null,
  },
  {
    source: 'akamai-test',
    name: 'Big Buck Bunny — DASH (Akamai public test vector)',
    url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
    type: 'dash',
    quality: 720,
    headers: null,
    referer: null,
  },
  {
    source: 'mdn',
    name: 'MDN flower — progressive MP4 (CC0)',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    type: 'video',
    quality: 394,
    headers: null,
    referer: null,
  },
  {
    // Demo of the relay-required path: this link is DISABLED with an honest
    // explanation; it is never fetched by anything.
    source: 'demo',
    name: 'Header-gated source (relay-required demo — never fetched)',
    url: 'https://example.com/protected/video.m3u8',
    type: 'hls',
    quality: 1080,
    headers: { 'X-Demo-Auth': 'required' },
    referer: null,
  },
  {
    // Demo of the unsupported-container path for remote streams.
    source: 'demo',
    name: 'Remote AVI (unsupported container demo)',
    url: 'https://example.com/movie.avi',
    type: 'video',
    quality: null,
    headers: null,
    referer: null,
  },
];

const demoSubtitles: SubtitleFile[] = [
  { url: '/fixtures/subs/sample-en.vtt', language: 'en', filename: 'sample-en.vtt' },
  { url: '/fixtures/subs/sample-en.srt', language: 'en (SRT)', filename: 'sample-en.srt' },
];

function App() {
  return (
    <main className="demo-page">
      <header className="demo-header">
        <h1>CloudStream Web — Player Demo</h1>
        <p className="demo-banner" role="note">
          Development-only page. No providers are registered here; the provider system is untouched.
          Local files never leave your device. Remote demo entries are lawful public test streams —
          see the provenance notes at the bottom.
        </p>
      </header>

      <MediaPlayer
        links={demoLinks}
        subtitles={demoSubtitles}
        showLocalPicker
        conversionCoreBaseUrl="/ffmpeg-core"
        ariaLabel="Player demo"
      />

      <section className="demo-provenance">
        <h2>Fixture &amp; demo-stream provenance</h2>
        <ul>
          <li>
            <strong>Generated fixtures</strong> (<code>/fixtures/*</code>): created locally by{' '}
            <code>scripts/generate-fixtures.sh</code> from synthetic test patterns — no copyrighted
            material, a few KiB each (MP4, WebM, Ogg, MKV, AVI, MOV, HLS VOD, VTT/SRT).
          </li>
          <li>
            <strong>Big Buck Bunny</strong> (HLS via Mux, DASH via Akamai): © Blender Foundation |
            peach.blender.org — Creative Commons Attribution 3.0. Public test endpoints; availability
            not guaranteed (failures show typed network errors).
          </li>
          <li>
            <strong>Apple BipBop</strong>: Apple's public HLS example stream (test content).
          </li>
          <li>
            <strong>MDN flower.mp4</strong>: CC0 documentation sample published by MDN.
          </li>
          <li>
            <strong>Header-gated / AVI entries</strong>: intentionally unplayable demos of the
            player's honest limitation reporting (relay-required / unsupported). Never fetched.
          </li>
        </ul>
        <h2>Local conversion</h2>
        <p>
          The conversion engine (ffmpeg.wasm) is optional and lazy. For self-hosted core loading run{' '}
          <code>npm run fixtures:ffmpeg-core</code> (copies the pinned GPL core into the gitignored{' '}
          <code>demo/public/ffmpeg-core/</code>); otherwise it loads from the pinned CDN. Conversion
          runs entirely in your browser; original files are kept.
        </p>
      </section>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
