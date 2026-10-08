// Global navigation: desktop menu with dropdowns, mobile drawer, logo, language
// switcher and the internal links of the menus.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { watchPage, expectClean } from './helpers.mjs';

const nav = (lang) => JSON.parse(fs.readFileSync(`data/navigation/${lang}.json`, 'utf8'));

test('desktop menu shows the menu from data/navigation/es.json and opens dropdowns on hover', async ({ page }) => {
  const issues = watchPage(page);
  await page.goto('/es/estructura/');
  const menu = page.locator('#ast-hf-menu-1');
  const data = nav('es');
  for (const item of data.items) await expect(menu.locator(`#menu-item-${item.id} > a .menu-text`)).toHaveText(item.label.replace(/<[^>]+>/g, ''));
  const parent = menu.locator(`#menu-item-${data.items[1].id}`);
  const sub = parent.locator('> .sub-menu');
  await expect(sub).toBeHidden();
  await parent.hover();
  await expect(sub).toBeVisible();
  await expect(sub.locator('> li')).toHaveCount(data.items[1].children.length);
  // Current page is highlighted the way WordPress marked it.
  await expect(menu.locator(`#menu-item-${data.items[1].id}`)).toHaveClass(/current-menu-item/);
  expectClean(issues);
});

test('logo links to the homepage of the current language', async ({ page }) => {
  await page.goto('/en/structure/');
  await page.locator('#masthead > #ast-desktop-header .custom-logo-link').click();
  await expect(page).toHaveURL(/\/en\/$/);
});

test('language switcher goes to the translated page (or the other homepage)', async ({ page }) => {
  await page.goto('/es/estructura/');
  await page.locator('#ast-hf-menu-1 .lang-item a').click();
  await expect(page).toHaveURL(/\/en\/structure\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  // A post without translation links to the other language's homepage.
  await page.goto('/es/topdia/');
  await expect(page.locator('#ast-hf-menu-1 .lang-item')).toHaveClass(/no-translation/);
  await expect(page.locator('#ast-hf-menu-1 .lang-item a')).toHaveAttribute('href', '/en/');
});

test('every internal menu link resolves', async ({ page, request }) => {
  for (const lang of ['es', 'en']) {
    const urls = new Set();
    const walk = (items) => items.forEach((i) => (urls.add(i.url.split('#')[0]), i.children && walk(i.children)));
    walk(nav(lang).items);
    for (const u of urls) expect((await request.get(u)).status(), u).toBe(200);
  }
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('menu toggle opens and closes the off-canvas drawer with submenus', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto('/es/');
    const toggle = page.locator('#masthead > #ast-mobile-header .menu-toggle');
    await expect(toggle).toBeVisible();
    await expect(page.locator('#masthead > #ast-desktop-header')).toBeHidden();
    await toggle.click();
    const drawer = page.locator('#ast-mobile-popup');
    await expect(drawer).toHaveClass(/active/);
    await expect(page.locator('#ast-hf-mobile-menu')).toBeVisible();
    // Expand a submenu.
    const parent = page.locator('#ast-hf-mobile-menu > li.menu-item-has-children').nth(1);
    await parent.locator('> .ast-menu-toggle').click();
    await expect(parent.locator('> .sub-menu')).toBeVisible();
    // The close button sticks out of a 390px viewport (same on the original site), so the click is dispatched directly.
    await page.locator('#menu-toggle-close').dispatchEvent('click');
    await expect(drawer).not.toHaveClass(/active/);
    expectClean(issues);
  });

  test('keyboard: the drawer can be opened with the keyboard', async ({ page }) => {
    await page.goto('/es/');
    await page.locator('#masthead > #ast-mobile-header .menu-toggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#ast-mobile-popup')).toHaveClass(/active/);
  });
});

test('skip link and visible focus', async ({ page }) => {
  await page.goto('/es/');
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute('href', '#content');
  // The focused skip link becomes visible (theme CSS).
  const box = await skip.boundingBox();
  expect(box && box.width > 1 && box.height > 1).toBeTruthy();
});
