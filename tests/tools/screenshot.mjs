// Deterministic full-page screenshots (shared by the baseline capture and the
// visual regression tests).
//
// To compare like with like, both sides are captured in the same state: web
// fonts and every image loaded, entrance animations and counters finished (run
// by the page's own scripts while scrolling through it), back at the top,
// sticky header and scroll-to-top button hidden, no caret.
//
// The stabilising CSS must be in place before the page renders: changing styles
// after load makes the Masonry archive grid paint some cards blank in
// full-page captures.
export const STABILIZE_CSS = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }
  #ast-fixed-header { display: none !important; }
  #ast-scroll-top { display: none !important; }
`;

/** Call once per page (or context) before navigating. */
export async function stabilize(target) {
  await target.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
      // Load every image (lazy images below the fold would appear blank).
      document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
    });
  }, STABILIZE_CSS);
}

/** After navigation: scroll through the page, wait for fonts/images/animations. */
export async function prepare(page) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => !i.complete);
    await Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 20000); })));
    // Loaded is not painted: wait until every image is decoded.
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  // Counters run for 1 s after becoming visible.
  await page.waitForTimeout(2000);
  // Entrance animations that the scroll pass did not trigger (timing-dependent):
  // show their final state, as a visitor scrolling the page would see it. Pages
  // with these blocks have no Masonry grid, so the DOM change is safe here.
  await page.evaluate(() => {
    document.querySelectorAll('.eb___animated').forEach((el) => {
      [...el.classList].filter((c) => c.startsWith('eb___')).forEach((c) => el.classList.replace(c, c.replace('eb___', 'eb__')));
    });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}
