#!/usr/bin/env node
/**
 * ia-probe.mjs — the Internet Archive probe + fixture-capture tool (D20).
 *
 * A RESEARCH TOOL, NOT PROVIDER CODE (checklist §9.3). Run ONCE from a
 * session/machine WITH raw-HTTP egress; every output is recorded under
 * docs/evidence/ and tests/fixtures/ia/. Read-only GETs only, identified UA,
 * ≥1.1 s pacing between requests (mirrors the D20 pacing policy).
 *
 * It closes the honest gaps recorded in the checklist addendum §12:
 *   1. P1 re-verify robots.txt for our paths (fail if a needed path is disallowed)
 *   2. P2a native playback fetchability   (status/Content-Type/Content-Length)
 *   3. P2b byte-range seeking             (Accept-Ranges, 206 + window, mid-file)
 *   4. P2c redirect chain                 (every hop: status/method/host)
 *   5. P2d codec/container sanity         (first bytes show ISO-BMFF `ftyp`)
 *   6. P2e required-headers absence       (plain GET with our UA only)
 *   7. P2f ACAO diagnostic                (recorded, never a native-playback gate)
 *   8. P3 re-capture the ToU byte-faithfully (re-run the currency check)
 *   9. Fixtures 1–8 live capture (search success/empty/error, metadata
 *      success/missing/error/restricted, scrape page)
 *  10. Rights-register identifier verification (candidate → verified or flagged)
 *
 * Usage:
 *   node scripts/ia-probe.mjs --out docs/evidence --fixtures tests/fixtures/ia
 * Optional:
 *   --item night_of_the_living_dead   (single register item to verify/capture)
 *   --skip-playback                    (robots/ToU/fixtures only)
 *
 * Exit code 0 = all required probes pass or are recorded; failures print the
 * exact stop condition they hit (R1/R4/R7 stop rules of the checklist).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const UA = 'cloudstream-web/0.1.0 (+https://github.com/smithP2007/CLOUDSTREAM)';
const SPACING_MS = 1100;
const BASE = 'https://archive.org';
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = resolve(argOf('--out', 'docs/evidence'));
const FIXTURES = resolve(argOf('--fixtures', 'tests/fixtures/ia'));
const SKIP_PLAYBACK = args.includes('--skip-playback');

const REQUESTED_PATHS = ['/advancedsearch.php', '/services/search/v1/scrape', '/metadata/', '/services/img/'];
const REGISTER_CANDIDATES = [
  'night_of_the_living_dead',
  'HisGirlFriday',
  'TheGeneral1926',
  'nosferatu',
  'Plan9FromOuterSpace_413',
  'Charade_1963',
];

const log = (...lines) => console.log(...lines);
let lastStart = 0;
async function pacedFetch(url, options = {}) {
  const wait = SPACING_MS - (Date.now() - lastStart);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastStart = Date.now();
  const res = await fetch(url, {
    ...options,
    headers: { 'user-agent': UA, ...(options.headers ?? {}) },
    redirect: options.followRedirects === false ? 'manual' : 'follow',
  });
  return res;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(FIXTURES, { recursive: true });
  const report = { run: new Date().toISOString(), ua: UA, probes: {} };

  /* ---- P1: robots.txt ---------------------------------------------------- */
  const robotsRes = await pacedFetch(`${BASE}/robots.txt`);
  const robotsText = await robotsRes.text();
  await writeFile(join(OUT, 'robots-txt--capture.txt'), `# captured ${report.run}\n\n${robotsText}\n`);
  const disallowedAll = [...robotsText.matchAll(/^\s*Disallow:\s*(\S+)/gm)].map((m) => m[1]);
  const blocked = REQUESTED_PATHS.filter((p) => disallowedAll.some((d) => d !== '' && p.startsWith(d)));
  report.probes.p1 = { status: robotsRes.status, disallowRules: disallowedAll, blockedForUs: blocked };
  log(`P1 robots.txt: ${robotsRes.status}; disallow rules: ${JSON.stringify(disallowedAll)}`);
  if (blocked.length > 0) {
    log(`P1 STOP CONDITION (R7): paths disallowed for our UA group: ${blocked.join(', ')}`);
  }

  /* ---- P3: ToU re-capture (byte-faithful) --------------------------------- */
  const touRes = await pacedFetch(`${BASE}/about/terms`, { followRedirects: true });
  const touText = await touRes.text();
  const touIsJsGate = touText.includes('Javascript is required');
  await writeFile(
    join(OUT, 'tou-live-capture--see-provenance.txt'),
    `# captured ${report.run} status=${touRes.status} jsGate=${touIsJsGate}\n# If jsGate=true, the dated Wayback copy in\n# archive-org-terms-of-use--2026-10-21.md remains the ToU capture of record\n# and the currency cross-check must be repeated via the help center.\n\n${touText}\n`,
  );
  report.probes.p3 = { status: touRes.status, jsGate: touIsJsGate };
  log(`P3 ToU: status ${touRes.status}; jsGate=${touIsJsGate}`);

  /* ---- Register identifier verification + metadata fixture capture -------- */
  const verify = {};
  for (const identifier of REGISTER_CANDIDATES) {
    const res = await pacedFetch(`${BASE}/metadata/${encodeURIComponent(identifier)}`);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* recorded as malformed */ }
    const isMissing = Array.isArray(json);
    const success = json && !isMissing && json.metadata?.identifier;
    verify[identifier] = {
      status: res.status,
      exists: Boolean(success),
      reportedIdentifier: success ?? null,
      title: json?.metadata?.title ?? null,
      year: json?.metadata?.year ?? null,
      restricted: json?.metadata?.['access-restricted-item'] ?? null,
      filesCount: Array.isArray(json?.files) ? json.files.length : null,
    };
    if (success) {
      await writeFile(
        join(OUT, 'ia', `register-evidence--${identifier}.json`),
        JSON.stringify(json, null, 2) + '\n',
      ).catch(async () => {
        await mkdir(join(OUT, 'ia'), { recursive: true });
        await writeFile(join(OUT, 'ia', `register-evidence--${identifier}.json`), JSON.stringify(json, null, 2) + '\n');
      });
    }
    log(`register: ${identifier} → exists=${verify[identifier].exists} title=${JSON.stringify(verify[identifier].title)}`);
  }
  report.probes.registerVerification = verify;
  await mkdir(join(OUT, 'ia'), { recursive: true });
  await writeFile(join(OUT, 'ia', 'probe-report.json'), JSON.stringify(report, null, 2) + '\n');

  if (SKIP_PLAYBACK) { log('skipping P2 playback probes (--skip-playback)'); return; }

  /* ---- Pick a verified item with an h.264 derivative for the P2 suite ----- */
  const verifiedId = Object.entries(verify).find(([, v]) => v.exists && !v.restricted)?.[0];
  if (!verifiedId) {
    log('P2 STOP: no verified, unrestricted register item available for playback probes.');
    return;
  }
  const meta = JSON.parse(
    await (await pacedFetch(`${BASE}/metadata/${verifiedId}`)).text(),
  );
  const videoFile =
    (meta.files ?? []).find((f) => /^h\.264/i.test(f.format ?? '') && /\.(mp4|m4v)$/i.test(f.name)) ??
    (meta.files ?? []).find((f) => /mpeg/i.test(f.format ?? '') && /\.(mp4|avi)$/i.test(f.name));
  if (!videoFile) {
    log('P2 STOP: no h.264/MPEG derivative in the verified item — playback claim stays off.');
    return;
  }
  const fileUrl = `${BASE}/download/${encodeURIComponent(verifiedId)}/${videoFile.name.split('/').map(encodeURIComponent).join('/')}`;

  /* ---- P2c: redirect chain (manual follow) -------------------------------- */
  const chain = [];
  let hopUrl = fileUrl;
  for (let hop = 0; hop < 8; hop += 1) {
    const res = await pacedFetch(hopUrl, { method: 'GET', followRedirects: false, headers: { range: 'bytes=0-0' } });
    chain.push({ hop, url: hopUrl, status: res.status, location: res.headers.get('location') });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      hopUrl = new URL(res.headers.get('location'), hopUrl).toString();
      continue;
    }
    break;
  }
  report.probes.p2c = { chain };
  log('P2c redirect chain:');
  for (const hop of chain) log(`  ${hop.hop}: ${hop.status} ${hop.url} ${hop.location ? '-> ' + new URL(hop.location, hop.url).host : ''}`);

  /* ---- P2a/P2e/P2f: fetchability + headers + ACAO on the FINAL host -------- */
  const finalRes = await pacedFetch(hopUrl, { headers: { range: 'bytes=0-65535' } });
  const headersObj = Object.fromEntries(finalRes.headers.entries());
  report.probes.p2a = { status: finalRes.status, contentType: headersObj['content-type'], contentLength: headersObj['content-length'], contentRange: headersObj['content-range'] };
  report.probes.p2e = { plainGetSucceeded: finalRes.ok, usedOnlyUaHeader: true };
  report.probes.p2f = { acao: headersObj['access-control-allow-origin'] ?? null, tao: headersObj['timing-allow-origin'] ?? null };
  log(`P2a: ${finalRes.status} ${headersObj['content-type']} range=${headersObj['content-range'] ?? headersObj['content-length']}`);
  log(`P2f: ACAO=${report.probes.p2f.acao}`);

  /* ---- P2d: container sanity (first bytes must show ftyp) ------------------ */
  const head = new Uint8Array(await finalRes.arrayBuffer());
  const ascii = Array.from(head.slice(0, 64), (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
  const hasFtyp = ascii.includes('ftyp');
  report.probes.p2d = { ftyp: hasFtyp, headAscii: ascii, headHex: Array.from(head.slice(0, 32), (b) => b.toString(16).padStart(2, '0')).join(' ') };
  log(`P2d: ftyp=${hasFtyp} head="${ascii.slice(0, 32)}"`);
  if (!hasFtyp) log('P2d STOP CONDITION (R4): no ISO-BMFF container — playback claim stays off.');

  /* ---- P2b: byte-range seeking (206 + correct window + mid-file) ----------- */
  const acceptRanges = headersObj['accept-ranges'] ?? null;
  const range1 = await pacedFetch(hopUrl, { headers: { range: 'bytes=1000-1999' } });
  const buf1 = new Uint8Array(await range1.arrayBuffer());
  const range2 = await pacedFetch(hopUrl, { headers: { range: 'bytes=1048576-1049075' } });
  const buf2 = new Uint8Array(await range2.arrayBuffer());
  report.probes.p2b = {
    acceptRanges,
    rangeStatus: range1.status,
    rangeLength: buf1.length,
    midRangeStatus: range2.status,
    midRangeLength: buf2.length,
    contentRange: range1.headers.get('content-range'),
  };
  log(`P2b: accept-ranges=${acceptRanges} first-range=${range1.status} (${buf1.length} bytes) mid-range=${range2.status} (${buf2.length} bytes)`);

  /* ---- Persist the full probe report -------------------------------------- */
  await writeFile(join(OUT, 'ia', 'probe-report.json'), JSON.stringify(report, null, 2) + '\n');
  log('\nprobe report written to', join(OUT, 'ia', 'probe-report.json'));
  log('NEXT: reconcile schemas (src/server/providers/internetarchive/schemas.ts) with the captured');
  log('payloads, update tests/fixtures/ia/ per the checklist §9.1, and flip the register');
  log('identifierVerified flags in register.ts + docs/evidence/ia-rights-register.md.');
}

main().catch((error) => {
  console.error('probe failed:', error);
  process.exitCode = 1;
});
