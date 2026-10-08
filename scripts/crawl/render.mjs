// Phase 2 of the crawl: render every discovered page in Chromium (Playwright) to
// learn which resources the *final rendered* page really loads (JS-injected images,
// lazy-loaded media, web fonts requested by CSS, …) and to keep the rendered DOM.
// Output: .cache/crawl/rendered/<sha>.html and .cache/crawl/rendered.json
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CACHE, sha, readJson, writeJson, ensureDir, sleep, USER_AGENT } from './lib.mjs';

const refresh = process.argv.includes('--refresh');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const pages = readJson(path.join(CACHE, 'pages.json'), []).filter((p) => p.status === 200 && p.contentType?.includes('html'));
const outFile = path.join(CACHE, 'rendered.json');
const results = refresh ? {} : readJson(outFile, {});
ensureDir(path.join(CACHE, 'rendered'));

const context = await chromium.launchPersistentContext(path.join(CACHE, 'chromium-profile'), {
  viewport: { width: 1440, height: 900 },
  userAgent: USER_AGENT + ' Chrome',
});

let n = 0;
for (const p of pages) {
  if (only && !p.url.includes(only)) continue;
  if (results[p.url] && !refresh && !only) continue;
  const page = await context.newPage();
  const requests = [];
  const consoleErrors = [];
  page.on('requestfinished', async (req) => {
    const res = await req.response();
    requests.push({ url: req.url(), type: req.resourceType(), status: res?.status() ?? 0 });
  });
  page.on('requestfailed', (req) => requests.push({ url: req.url(), type: req.resourceType(), status: 0, failure: req.failure()?.errorText }));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  try {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 60000 });
    // Scroll through the page to trigger lazy loading / scroll animations.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const html = await page.content();
    fs.writeFileSync(path.join(CACHE, 'rendered', sha(p.url) + '.html'), html);
    results[p.url] = { requests, consoleErrors, renderedAt: new Date().toISOString() };
    console.log(`${++n} rendered ${p.url} (${requests.length} requests, ${consoleErrors.length} console errors)`);
  } catch (err) {
    results[p.url] = { error: err.message, requests, consoleErrors };
    console.log(`FAILED ${p.url}: ${err.message}`);
  }
  await page.close();
  if (n % 10 === 0) writeJson(outFile, results);
  await sleep(800);
}
writeJson(outFile, results);
await context.close();
