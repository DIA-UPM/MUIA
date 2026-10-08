// Captures the visual baseline of the LIVE site (tests/reference/) or, with
// --base http://localhost:8080 --out <dir>, of any other copy of the site.
//
//   npm run baseline                         (live site → tests/reference/)
//   node tests/tools/capture-baseline.mjs --base http://localhost:8080 --out .cache/local-shots
//
// Requests are sequential to be gentle with the source server.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PAGES, VIEWPORTS } from './pages.mjs';
import { prepare, stabilize } from './screenshot.mjs';
import { useOriginalMirror } from './original-mirror.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'https://muia.dia.fi.upm.es');
const OUT = path.resolve(arg('out', 'tests/reference'));
const only = arg('only', null);
const vpOnly = arg('viewports', null);
// --mirror: capture the original from the crawl cache instead of the network
// (identical HTML/CSS/JS/images, no load on the source server).
const MIRROR = process.argv.includes('--mirror');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const manifest = [];
for (const vp of VIEWPORTS.filter((v) => !vpOnly || vpOnly.split(',').includes(v.name))) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, locale: 'es-ES', reducedMotion: 'no-preference' });
  if (MIRROR) await useOriginalMirror(context);
  await stabilize(context);
  for (const p of PAGES.filter((x) => !only || only.split(',').includes(x.id))) {
    const page = await context.newPage();
    const file = `${p.id}-${vp.name}.png`;
    try {
      await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 90000 });
      await prepare(page);
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      manifest.push({ page: p.id, viewport: vp.name, file, url: BASE + p.path });
      console.log('captured', file);
    } catch (err) {
      console.log('FAILED', file, err.message);
    }
    await page.close();
    if (!BASE.includes('localhost') && !BASE.includes('127.0.0.1') && !MIRROR) await new Promise((r) => setTimeout(r, 700));
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ base: BASE, source: MIRROR ? 'crawl cache of the live site (.cache/crawl)' : 'live network', capturedAt: new Date().toISOString(), shots: manifest }, null, 1));
