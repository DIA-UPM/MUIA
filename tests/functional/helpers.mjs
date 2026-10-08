// Shared helpers for the functional tests.
import { expect } from '@playwright/test';

/** Collects console errors, page errors, failed requests and requests to other hosts. */
export function watchPage(page) {
  const issues = { consoleErrors: [], pageErrors: [], failedRequests: [], externalRequests: [] };
  page.on('console', (m) => m.type() === 'error' && issues.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => issues.pageErrors.push(e.message));
  page.on('requestfailed', (r) => {
    // Aborted by the test itself (e.g. blocked external hosts) is not a site error.
    if (r.failure()?.errorText !== 'net::ERR_ABORTED' || !r.url().startsWith('http://localhost')) issues.failedRequests.push(`${r.url()} (${r.failure()?.errorText})`);
  });
  page.on('response', (r) => r.status() >= 400 && issues.failedRequests.push(`${r.url()} (HTTP ${r.status()})`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.hostname !== 'localhost') issues.externalRequests.push(r.url());
  });
  return issues;
}

export function expectClean(issues, { allowExternal = [] } = {}) {
  expect(issues.pageErrors, 'JavaScript exceptions').toEqual([]);
  expect(issues.consoleErrors, 'console errors').toEqual([]);
  expect(issues.failedRequests, 'failed requests').toEqual([]);
  expect(issues.externalRequests.filter((u) => !allowExternal.some((a) => u.includes(a))), 'requests to other hosts').toEqual([]);
}

/** Every <img> on the page that should be visible has loaded. */
export async function brokenImages(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 10000); })));
  });
  return page.evaluate(() => [...document.images].filter((i) => i.currentSrc && i.naturalWidth === 0).map((i) => i.currentSrc));
}
