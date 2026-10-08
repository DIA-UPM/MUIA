// Visual regression: full-page screenshots of the local build compared with the
// baseline of the live site in tests/reference/ (npm run baseline).
//
// Both sides are captured in the same deterministic state (tests/tools/screenshot.mjs).
// Thresholds: see THRESHOLDS; differences above them fail. Every diff image is
// written to test-results/visual/ for inspection.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PAGES, VIEWPORTS } from '../tools/pages.mjs';
import { prepare, stabilize } from '../tools/screenshot.mjs';
import { compareImages } from '../tools/diff-shots.mjs';

const REF = 'tests/reference';
const OUT = 'test-results/visual';
fs.mkdirSync(OUT, { recursive: true });

// Maximum share of differing pixels per page (anti-aliasing ignored).
const DEFAULT_THRESHOLD = 0.01;
const THRESHOLDS = {
  // Archive excerpts: the original's cached listings disagree on a trailing "[…]" (docs/site-audit.md).
  category: 0.02,
};

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    for (const p of PAGES) {
      const ref = path.join(REF, `${p.id}-${vp.name}.png`);
      test(`${p.id}`, async ({ page }) => {
        test.skip(!fs.existsSync(ref), 'no baseline screenshot (npm run baseline)');
        await stabilize(page);
        await page.goto(p.path, { waitUntil: 'networkidle' });
        await prepare(page);
        const cand = path.join(OUT, `${p.id}-${vp.name}.png`);
        await page.screenshot({ path: cand, fullPage: true });
        const r = compareImages(ref, cand, path.join(OUT, `${p.id}-${vp.name}`));
        test.info().annotations.push({ type: 'mismatch', description: `${(r.mismatch * 100).toFixed(2)}% (ref ${r.refSize.join('x')}, local ${r.candSize.join('x')})` });
        expect(Math.abs(r.refSize[1] - r.candSize[1]), 'page height difference (px)').toBeLessThanOrEqual(Math.max(8, r.refSize[1] * 0.002));
        expect(r.mismatch, 'share of differing pixels').toBeLessThanOrEqual(THRESHOLDS[p.id] ?? DEFAULT_THRESHOLD);
      });
    }
  });
}
