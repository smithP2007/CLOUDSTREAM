#!/usr/bin/env node
/**
 * STANDALONE AUDIT DIAGNOSTIC — runs the REAL @ffmpeg/core wasm conversion in
 * a real (Playwright) Chromium against the self-hosted core, capturing the
 * full FFmpeg log stream. This bypasses the app UI to obtain ground truth on
 * core init, conversion success/failure, progress events, and timing.
 *
 * Usage: node scripts/audit-ffmpeg-real.mjs [profile: mp4|webm] [input-url]
 * Requires the demo server on http://localhost:5173 and
 * `npm run fixtures:ffmpeg-core` to have copied the core.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const PROFILE = process.argv[2] ?? 'mp4';
const INPUT = process.argv[3] ?? '/fixtures/sample-avi.avi';

const ARGV = {
  mp4: ['-i', 'input.avi', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-movflags', 'faststart', '-y', 'output.mp4'],
  webm: ['-i', 'input.avi', '-c:v', 'libvpx-vp9', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-b:a', '128k', '-y', 'output.webm'],
}[PROFILE];

const WATCHDOG_MS = 9 * 60_000;

const result = await chromium.launch({ headless: true }).then(async (browser) => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/`);
  return page.evaluate(
    async ({ argv, input, watchdogMs }) => {
      const logs = [];
      const progress = [];
      const mod = await import('/@id/@ffmpeg/ffmpeg');
      const util = await import('/@id/@ffmpeg/util');
      const ffmpeg = new mod.FFmpeg();
      ffmpeg.on('log', (e) => logs.push(String(e.message)));
      ffmpeg.on('progress', (e) => progress.push(Number(e.progress)));

      const t0 = performance.now();
      const coreURL = await util.toBlobURL('/ffmpeg-core/ffmpeg-core.js', 'text/javascript');
      const wasmURL = await util.toBlobURL('/ffmpeg-core/ffmpeg-core.wasm', 'application/wasm');

      // PROBE: replicate the wrapper's importScripts outside it, capturing the
      // REAL error the wrapper swallows ("failed to import ffmpeg-core.js").
      const probe = await new Promise((resolve) => {
        const src = `
          self.onmessage = (e) => {
            const { url } = e.data;
            try {
              importScripts(url);
              self.postMessage({ ok: true, hasCore: typeof self.createFFmpegCore });
            } catch (err) {
              self.postMessage({ ok: false, error: String(err && err.message), stack: String(err && err.stack).slice(0, 500) });
            }
          };`;
        const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        w.onmessage = (e) => { resolve(e.data); w.terminate(); };
        w.onerror = (e) => { resolve({ ok: false, error: `worker onerror: ${e.message}` }); w.terminate(); };
        w.postMessage({ url: e_coreBlob() });
        function e_coreBlob() { return coreURL; }
      });
      const probeRaw = await new Promise((resolve) => {
        const src = `
          self.onmessage = (e) => {
            try {
              importScripts(e.data.url);
              self.postMessage({ ok: true, hasCore: typeof self.createFFmpegCore });
            } catch (err) {
              self.postMessage({ ok: false, error: String(err && err.message), stack: String(err && err.stack).slice(0, 500) });
            }
          };`;
        const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        w.onmessage = (e) => { resolve(e.data); w.terminate(); };
        w.onerror = (e) => { resolve({ ok: false, error: `worker onerror: ${e.message}` }); w.terminate(); };
        w.postMessage({ url: '/ffmpeg-core/ffmpeg-core.js' });
      });

      let loadOk = false;
      let loadError = null;
      try {
        loadOk = await ffmpeg.load({ coreURL, wasmURL });
      } catch (e) {
        loadError = String(e && e.message ? e.message : e);
      }
      const loadMs = Math.round(performance.now() - t0);
      if (!loadOk) {
        return { phase: 'load', loadOk, loadError, loadMs, probe, probeRaw, logTail: logs.slice(-20) };
      }

      const file = await util.fetchFile(`${location.origin}${input}`);
      await ffmpeg.writeFile('input.avi', file);

      // Cancellation probe: separate run to verify terminate() behaviour.
      let execMs;
      let exitCode = null;
      let execError = null;
      const t1 = performance.now();
      const watchdog = setTimeout(() => {
        try { ffmpeg.terminate(); } catch { /* already dead */ }
      }, watchdogMs);
      try {
        exitCode = await ffmpeg.exec(argv);
      } catch (e) {
        execError = String(e && e.message ? e.message : e);
      } finally {
        clearTimeout(watchdog);
      }
      execMs = Math.round(performance.now() - t1);

      let outSize = null;
      let readError = null;
      try {
        const out = await ffmpeg.readFile('output.mp4');
        outSize = out instanceof Uint8Array ? out.byteLength : String(out).length;
      } catch (e) {
        readError = String(e && e.message ? e.message : e);
      }

      let cleanup = null;
      try {
        await ffmpeg.deleteFile('input.avi');
        cleanup = 'ok';
      } catch (e) {
        cleanup = `deleteFile failed: ${String(e && e.message ? e.message : e)}`;
      }

      return {
        phase: 'exec',
        loadOk,
        loadMs,
        execMs,
        exitCode,
        execError,
        outSize,
        readError,
        cleanup,
        inputBytes: file.byteLength,
        progressEvents: progress.length,
        maxProgress: progress.length ? Math.max(...progress) : null,
        lastProgress: progress.length ? progress[progress.length - 1] : null,
        logCount: logs.length,
        logTail: logs.slice(-30),
      };
    },
    { argv: ARGV, input: INPUT, watchdogMs: WATCHDOG_MS },
  ).finally(() => browser.close());
});

console.log(JSON.stringify(result, null, 2));
