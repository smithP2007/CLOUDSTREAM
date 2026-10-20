/* Diagnostic (not committed): why does the Mux HLS test fail? */
import { chromium } from 'playwright';

const title = Buffer.from('https://fixtures.local/title/harbor-lights-live').toString('base64url');
const data = Buffer.from('fixtures:live:harbor-lights-live').toString('base64url');
const url = `http://localhost:3000/watch/mock-fixtures/${title}/${data}`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || t.toUpperCase().includes('CONTENT SECURITY')) console.log(`[console.${m.type()}]`, t.slice(0, 300));
});
page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.method()} ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));

const probe = await page.request.get('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', { timeout: 10000 }).then((r) => `${r.status()} ok=${r.ok()}`).catch((e) => `PROBE-FAIL ${e.message}`);
console.log('probe:', probe);

await page.goto(url, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  const t = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="csw-video"]');
    return el ? `${el.currentTime.toFixed(2)}s ready=${el.readyState}` : 'no-video';
  });
  console.log(`t+${(i + 1) * 2.5}s video=${t}`);
}
await browser.close();
