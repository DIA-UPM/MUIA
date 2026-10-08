// Network and CMS-independence tests: the built site must render completely
// from the local server with every other host blocked (in particular the
// original WordPress server), without JavaScript errors or failed requests.
import { test, expect } from '@playwright/test';
import { PAGES } from '../tools/pages.mjs';
import { watchPage, expectClean, brokenImages } from './helpers.mjs';

const SOURCE = 'muia.dia.fi.upm.es';

test.describe('local-only (all external hosts blocked)', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(/^https?:\/\/(?!localhost)/, (route) => route.abort('blockedbyclient'));
  });

  for (const p of PAGES) {
    test(`${p.id}: renders with CSS, fonts, images and scripts from the local build`, async ({ page }) => {
      const issues = watchPage(page);
      await page.goto(p.path, { waitUntil: 'networkidle' });
      // CSS applied: the Astra header layout (flex) and the theme font.
      const header = await page.locator('#ast-desktop-header .ast-builder-grid-row').first().evaluate((e) => getComputedStyle(e).display);
      expect(['flex', 'grid']).toContain(header);
      // Fonts: the theme fonts were loaded from /assets/fonts.
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
      });
      expect(fonts).toContain('Syne');
      expect(await brokenImages(page)).toEqual([]);
      // Visual effects initialised: entrance animations run, Astra scripts loaded.
      expect(await page.evaluate(() => typeof window.jQuery === 'function' && typeof window.astra === 'object')).toBe(true);
      // Basic content is present.
      expect((await page.locator('#content').innerText()).length).toBeGreaterThan(50);
      expect(issues.externalRequests.filter((u) => u.includes(SOURCE)), 'requests to the original WordPress server').toEqual([]);
      expect(issues.pageErrors).toEqual([]);
      expect(issues.consoleErrors.filter((e) => !/net::ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(e))).toEqual([]);
    });
  }
});

test('no request leaves the local server on any representative page (network not blocked)', async ({ page }) => {
  for (const p of PAGES) {
    const issues = watchPage(page);
    await page.goto(p.path, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    await page.waitForLoadState('networkidle');
    expectClean(issues);
  }
});

test('the HTML contains no reference to the WordPress runtime', async ({ request }) => {
  for (const p of PAGES) {
    const html = await (await request.get(p.path)).text();
    expect(html, p.path).not.toMatch(/\/wp-(admin|json|includes)\/|\/wp-content\/(plugins|themes|cache)\/|xmlrpc\.php|admin-ajax/);
    expect(html, p.path).not.toMatch(/(src|href)="https?:\/\/muia\.dia\.fi\.upm\.es\/(?!(es|en)\/)[^"]*\.(css|js|png|jpe?g|svg|woff2?|ttf)/);
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('basic content stays available', async ({ page }) => {
    await page.goto('/es/estructura/');
    await expect(page.locator('h1').first()).toBeVisible();
    expect((await page.locator('.entry-content').innerText()).length).toBeGreaterThan(1000);
    await page.goto('/es/profesorado_tutorias/');
    expect(await page.locator('.ebpg-grid-post').count()).toBeGreaterThan(20);
    await page.goto('/es/personal/corcho-garcia-oscar/');
    await expect(page.locator('.eb-feature-list-item').first()).toBeVisible();
  });
});
