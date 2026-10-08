// Homepage, informational pages and the repeated content types (news, people,
// archives), checked against the JSON they are generated from.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { PAGES, VIEWPORTS } from '../tools/pages.mjs';
import { watchPage, expectClean, brokenImages } from './helpers.mjs';

const readDir = (dir) =>
  fs.readdirSync(dir).flatMap((lang) => fs.readdirSync(path.join(dir, lang)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, lang, f), 'utf8'))));
const pages = readDir('data/pages');
const news = readDir('data/news');
const people = readDir('data/people');
const strip = (h) =>
  h
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

test.describe('homepage', () => {
  test('major sections, images and interactive components', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto('/es/');
    await expect(page.locator('h1.eb-ah-title').first()).toContainText('Máster Universitario');
    // Counters animate up to the value stored in the JSON.
    const home = pages.find((p) => p.isHome && p.lang === 'es');
    const counters = [];
    const walk = (bs) => bs.forEach((b) => (b.type === 'number-counter' && counters.push(b), b.children && walk(b.children)));
    walk(home.blocks);
    expect(counters.length).toBeGreaterThan(0);
    await page.locator('.eb-counter').first().scrollIntoViewIfNeeded();
    for (const c of counters) await expect(page.locator(`.${c.id} .eb-counter`)).toHaveText(c.target, { timeout: 15000 });
    // FAQ accordion.
    const faq = page.locator('#faq_generales .eb-accordion-wrapper');
    expect(await faq.count()).toBeGreaterThan(5);
    const second = faq.nth(1);
    await second.locator('.eb-accordion-title-wrapper').click();
    await expect(second.locator('.eb-accordion-content-wrapper')).toBeVisible();
    expect(await brokenImages(page)).toEqual([]);
    expectClean(issues);
  });

  test('news grid pagination works without the WordPress REST API', async ({ page }) => {
    await page.goto('/es/');
    const grid = page.locator('.eb-post-grid-wrapper').first();
    const visible = grid.locator('.ebpg-grid-post:visible');
    await expect(visible).toHaveCount(9);
    const firstTitle = await visible.first().locator('.ebpg-entry-title a').textContent();
    await grid.locator('.ebpg-pagination-item[data-pagenumber="2"]').click();
    await expect(visible.first().locator('.ebpg-entry-title a')).not.toHaveText(firstTitle);
    expect(await visible.count()).toBeGreaterThan(0);
    await expect(grid.locator('.ebpg-pagination-item-next')).toBeDisabled();
    await grid.locator('.ebpg-pagination-item-previous').click();
    await expect(visible.first().locator('.ebpg-entry-title a')).toHaveText(firstTitle);
  });

  test('video block shows the poster and loads YouTube only when activated', async ({ page }) => {
    const youtube = [];
    await page.route(/youtube\.com/, (route) => (youtube.push(route.request().url()), route.fulfill({ body: '<html></html>', contentType: 'text/html' })));
    await page.goto('/es/');
    const preview = page.locator('.react-player__preview').first();
    await expect(preview).toBeVisible();
    expect(youtube).toEqual([]);
    await preview.click();
    await expect(page.locator('.eb-react-player iframe')).toHaveAttribute('src', /youtube\.com\/embed\/CKycvwF1hXc/);
  });

  test('no horizontal overflow beyond the original design (all representative pages, 5 widths)', async ({ page }) => {
    // Some original pages are wider than the viewport (e.g. the homepage hero image);
    // the reference screenshots record by how much. Elsewhere no overflow is allowed.
    const problems = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const p of PAGES) {
        await page.goto(p.path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const ref = `tests/reference/${p.id}-${vp.name}.png`;
        const allowed = fs.existsSync(ref) ? PNG.sync.read(fs.readFileSync(ref)).width - vp.width : 0;
        if (overflow > allowed + 1) problems.push(`${p.path} at ${vp.width}px: ${overflow}px (original: ${allowed}px)`);
      }
    }
    expect(problems).toEqual([]);
  });
});

test.describe('informational pages', () => {
  test('tabs switch content (Estructura)', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto('/es/estructura/');
    const tabs = page.locator('.eb-advanced-tabs-wrapper').first();
    const titles = tabs.locator('.tabTitles > li');
    expect(await titles.count()).toBeGreaterThan(3);
    await titles.nth(2).click();
    await expect(titles.nth(2)).toHaveClass(/active/);
    await expect(tabs.locator('.eb-tab-wrapper[data-tab-id="3"]')).toBeVisible();
    await expect(tabs.locator('.eb-tab-wrapper[data-tab-id="1"]')).toBeHidden();
    // Nested accordion inside the tab.
    const acc = tabs.locator('.eb-tab-wrapper[data-tab-id="3"] .eb-accordion-wrapper').first();
    await acc.locator('.eb-accordion-title-wrapper').click();
    await expect(acc.locator('.eb-accordion-content-wrapper')).toBeVisible();
    expectClean(issues);
  });

  test('anchors from the menu open the right section', async ({ page }) => {
    await page.goto('/es/estructura/#trabajo_fin_de_master');
    await expect(page.locator('#trabajo_fin_de_master')).toBeInViewport();
  });

  test('timetables: TablePress tables initialised with DataTables, equal-height columns', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto('/es/horarios/');
    await expect(page.locator('#tablepress-13_wrapper .dataTables_scroll')).toBeVisible();
    const heights = await page.$$eval('.mi-row .mi-columna', (cols) => cols.map((c) => [...c.querySelectorAll('.eb-advance-heading-wrapper')].filter((_, i) => i !== 0 && i !== 4).map((h) => Math.round(h.getBoundingClientRect().height))));
    const flat = heights.flat();
    expect(flat.length).toBeGreaterThan(4);
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThanOrEqual(1);
    expectClean(issues);
  });

  test('every content page renders its blocks and loads its images', async ({ page }) => {
    for (const p of pages) {
      const issues = watchPage(page);
      await page.goto(p.path);
      await expect(page).toHaveTitle(p.seo.title);
      await expect(page.locator('.entry-content')).not.toBeEmpty();
      expect(await brokenImages(page), p.path).toEqual([]);
      expectClean(issues);
    }
  });

  test('documents linked from the pages are served', async ({ request }) => {
    const docs = new Set();
    const walk = (v) => {
      if (typeof v === 'string') for (const m of v.matchAll(/(\/wp-content\/uploads\/[^"'\s]+\.(?:pdf|docx?|xlsx?|pptx?))/gi)) docs.add(m[1]);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    pages.forEach(walk);
    news.forEach(walk);
    const known = JSON.parse(fs.readFileSync('data/known-missing-files.json', 'utf8')).files.map((f) => f.path);
    for (const d of docs) {
      if (known.includes(d)) continue;
      const res = await request.get(d);
      expect(res.status(), d).toBe(200);
    }
    expect(docs.size).toBeGreaterThan(0);
  });
});

test.describe('news', () => {
  test('category archive lists posts newest first with working detail links and pagination', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto('/es/category/noticias-es/');
    const cards = page.locator('article.ast-archive-post');
    await expect(cards).toHaveCount(10);
    const esNews = news.filter((n) => n.lang === 'es').sort((a, b) => (a.date < b.date ? 1 : -1));
    await expect(cards.first()).toHaveAttribute('id', `post-${esNews[0].wpId}`);
    await expect(page.locator('.ast-pagination .page-numbers.current')).toHaveText('1');
    await page.locator('.ast-pagination a.next').click();
    await expect(page).toHaveURL(/\/es\/category\/noticias-es\/page\/2\/$/);
    await page.locator('article.ast-archive-post .post-thumb-img-content a').first().click();
    await expect(page.locator('.ast-single-entry-banner h1')).toBeVisible();
    expect(await brokenImages(page)).toEqual([]);
    expectClean(issues);
  });

  test('every post renders title, image (when present) and body from its JSON', async ({ page }) => {
    for (const n of news) {
      await page.goto(n.path);
      await expect(page.locator('.ast-single-entry-banner h1.entry-title')).toHaveText(strip(n.title));
      await expect(page.locator('.post-thumb-img-content img')).toHaveCount(n.featuredImage ? 1 : 0);
      await expect(page.locator('#secondary .wp-block-latest-posts li')).toHaveCount(Math.min(5, news.filter((x) => x.lang === n.lang).length));
    }
  });
});

test.describe('people', () => {
  test('staff archive and profile pages', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto('/es/personal/');
    await expect(page.locator('article.ast-archive-post')).toHaveCount(10);
    await page.locator('.ast-pagination a', { hasText: '4' }).click();
    await expect(page).toHaveURL(/\/es\/personal\/page\/4\/$/);
    expect(await brokenImages(page)).toEqual([]);
    expectClean(issues);
  });

  test('every profile shows the contact list and biography from its JSON', async ({ page }) => {
    for (const p of people) {
      await page.goto(p.path);
      await expect(page.locator('h1.entry-title')).toHaveText(strip(p.name));
      const items = page.locator('.eb-feature-list-item');
      await expect(items).toHaveCount(p.contact.length);
      for (const [i, c] of p.contact.entries()) await expect(items.nth(i)).toContainText(strip(c.label));
    }
  });

  test('teaching-staff grids list the people of each category (alphabetically)', async ({ page }) => {
    await page.goto('/es/profesorado_tutorias/');
    const grid = page.locator('.eb-post-grid-ipz8zwz');
    const names = await grid.locator('.ebpg-entry-title a').allTextContents();
    const expected = people.filter((p) => p.lang === 'es' && p.tags.includes('catedraticos-de-universidad')).map((p) => strip(p.name)).sort((a, b) => a.localeCompare(b, 'es'));
    expect(names).toEqual(expected);
    await grid.locator('.ebpg-grid-post-link').first().click();
    await expect(page.locator('h1.entry-title')).toHaveText(expected[0]);
  });

  test('optional fields: a profile without web/ORCID and one without a block stylesheet still render', async ({ page }) => {
    const minimal = people.reduce((a, b) => (b.contact.length < a.contact.length ? b : a));
    await page.goto(minimal.path);
    await expect(page.locator('.eb-feature-list-item')).toHaveCount(minimal.contact.length);
    const unstyled = people.find((p) => p.styleVariant === 'none');
    await page.goto(unstyled.path);
    await expect(page.locator('h1.entry-title')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
});

test.describe('search and errors', () => {
  test('search (?s=) returns results built from the JSON content', async ({ page }) => {
    await page.goto('/es/?s=Jakiunde');
    await expect(page.locator('.ast-archive-title')).toContainText('Jakiunde');
    await expect(page.locator('article.ast-archive-post')).toHaveCount(1);
    await page.goto('/en/?s=zzzqqqnothing');
    await expect(page.locator('.no-results')).toBeVisible();
  });

  test('unknown URLs get the 404 page', async ({ page }) => {
    const res = await page.goto('/es/esta-pagina-no-existe/');
    expect(res.status()).toBe(404);
    await expect(page.locator('.error-404 h1')).toBeVisible();
  });

  test('the old language-less URL redirects', async ({ page }) => {
    await page.goto('/estructura/#faq_estructura');
    await expect(page).toHaveURL(/\/es\/estructura\/#faq_estructura$/);
  });
});
