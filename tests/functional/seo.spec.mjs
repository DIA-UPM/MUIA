// SEO and accessibility: the metadata generated from the JSON must equal the
// original pages' metadata (when the crawl cache is available), and the
// accessibility of the original must not get worse.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { PAGES } from '../tools/pages.mjs';

const ORIGIN = 'https://muia.dia.fi.upm.es';
const cacheFile = (url) => path.join('.cache/crawl/http', crypto.createHash('sha1').update(url).digest('hex') + '.bin');
const hasCache = fs.existsSync('.cache/crawl/pages.json');

function headOf(html) {
  const $ = cheerio.load(html);
  const m = (sel, attr = 'content') => $(sel).attr(attr);
  return {
    lang: $('html').attr('lang'),
    title: $('title').text(),
    description: m('meta[name="description"]'),
    robots: m('meta[name="robots"]'),
    canonical: m('link[rel="canonical"]', 'href'),
    hreflang: $('link[rel="alternate"][hreflang]').map((_, e) => `${$(e).attr('hreflang')}=${$(e).attr('href')}`).get().sort().join(' '),
    ogTitle: m('meta[property="og:title"]'),
    ogDescription: m('meta[property="og:description"]'),
    ogType: m('meta[property="og:type"]'),
    ogUrl: m('meta[property="og:url"]'),
    ogLocale: m('meta[property="og:locale"]'),
    ogImage: m('meta[property="og:image"]'),
    schemaTypes: (() => {
      const s = $('script.yoast-schema-graph').html();
      return s ? JSON.parse(s)['@graph'].map((g) => g['@type']).sort().join(',') : '';
    })(),
  };
}

test.describe('metadata equals the original site', () => {
  test.skip(!hasCache, 'needs the crawl cache (npm run crawl)');
  const all = JSON.parse(hasCache ? fs.readFileSync('.cache/crawl/pages.json', 'utf8') : '[]').filter((p) => p.status === 200 && p.finalUrl === p.url && !p.url.endsWith('//'));
  test('title, description, robots, canonical, hreflang, Open Graph and schema.org types of every page', async ({ request }) => {
    const mismatches = [];
    for (const p of all) {
      const original = headOf(fs.readFileSync(cacheFile(p.url), 'utf8'));
      const built = headOf(await (await request.get(new URL(p.url).pathname)).text());
      for (const k of Object.keys(original)) if (original[k] !== built[k]) mismatches.push(`${new URL(p.url).pathname} ${k}: "${original[k]}" ≠ "${built[k]}"`);
    }
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/seo-mismatches.txt', mismatches.join('\n'));
    expect(mismatches).toEqual([]);
  });
});

test.describe('accessibility basics', () => {
  for (const p of PAGES) {
    test(`${p.id}: semantics are not worse than on the original`, async ({ page }) => {
      await page.goto(p.path);
      const built = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        imgNoAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
        h1: document.querySelectorAll('h1').length,
        buttonsWithoutName: [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length,
        tablesWithoutHeaderCells: [...document.querySelectorAll('table')].filter((t) => !t.querySelector('th') && !t.closest('.dataTables_scrollBody')).length,
        landmarks: ['header', 'main', 'footer', 'nav'].every((t) => document.querySelector(t)),
      }));
      expect(built.lang).toMatch(/^(es-ES|en-US)$/);
      expect(built.landmarks).toBe(true);
      expect(built.h1).toBeGreaterThanOrEqual(1);
      if (hasCache && fs.existsSync(cacheFile(ORIGIN + p.path))) {
        const $ = cheerio.load(fs.readFileSync(cacheFile(ORIGIN + p.path), 'utf8'));
        expect(built.imgNoAlt, 'images without alt (original has ' + $('img:not([alt])').length + ')').toBeLessThanOrEqual($('img:not([alt])').length);
        expect(built.h1, 'number of h1 elements').toBe($('h1').length);
      }
      expect(built.buttonsWithoutName).toBe(0);
    });
  }
});
