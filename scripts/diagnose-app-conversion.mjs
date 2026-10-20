/* Diagnostic (not committed): capture the real error behind the app-path conversion failure. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const avi = fileURLToPath(new URL('../download/cloudstream-web/demo/public/fixtures/sample-avi.avi', import.meta.url));
const title = Buffer.from('https://fixtures.local/title/aurora-drift').toString('base64url');
const data = Buffer.from('fixtures:play:aurora-drift').toString('base64url');
const url = `http://localhost:3000/watch/mock-fixtures/${title}/${data}`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)));
page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.getByLabel('Add local media files').setInputFiles(avi);
const entry = page.locator('.csw-playlist-item', { hasText: 'sample-avi.avi' });
await entry.waitFor({ state: 'visible', timeout: 15000 });
await entry.locator('.csw-playlist-main').click();
await page.locator('.csw-conversion').waitFor({ state: 'visible', timeout: 15000 });
console.log('--- panel visible, clicking Convert and play ---');
await page.getByRole('button', { name: 'Convert and play' }).click();
await page.waitForTimeout(12000);
const panelText = await page.locator('.csw-conversion').textContent().catch(() => '(panel gone)');
console.log('--- panel text:', panelText);
await browser.close();
