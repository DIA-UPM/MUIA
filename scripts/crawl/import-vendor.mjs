// Phase 5: copy the frontend resources the static site really needs out of the
// crawl cache into the project:
//   src/css/vendor/…   third-party / theme stylesheets (URLs rewritten to local paths)
//   src/css/theme/…    Astra "dynamic" stylesheets (one per page context)
//   src/css/site/…     inline <style> blocks of the original pages
//   src/js/vendor/…    third-party / theme scripts that are kept as they are
//   public/assets/…    fonts, icons and images referenced by those stylesheets
//   public/wp-content/uploads/…, public/assets/external/…  media referenced by data/
//
//   node scripts/crawl/import-vendor.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import safeParser from 'postcss-safe-parser';
import { CACHE, ROOT, ORIGIN, sha, readJson, writeJson, ensureDir, cachedGet } from './lib.mjs';
import { localPath } from './urlmap.mjs';

const assets = readJson(path.join(CACHE, 'assets.json'), []);
const byUrl = new Map(assets.map((a) => [a.url, a]));
const bodyOf = (url) => fs.readFileSync(path.join(CACHE, 'http', sha(url) + '.bin'));
const find = (prefix) => {
  const a = assets.find((r) => r.status === 200 && (r.url === prefix || r.url.split('?')[0] === prefix));
  if (!a) throw new Error(`not in crawl cache: ${prefix}`);
  return a;
};
const W = (rel, content) => {
  const f = path.join(ROOT, rel);
  ensureDir(path.dirname(f));
  fs.writeFileSync(f, content);
};
const copied = new Set();
const report = { css: [], js: [], binaries: [], missing: [] };

/** Copies a cached resource to public/<localPath>. */
function copyBinary(url) {
  const lp = localPath(url);
  if (!lp) return null;
  const file = decodeURIComponent(lp.split('#')[0]);
  if (copied.has(file)) return lp;
  const rec = byUrl.get(url) || assets.find((a) => a.url.split('?')[0] === url.split('?')[0] && a.status === 200);
  if (!rec || rec.status !== 200) {
    report.missing.push(url);
    return lp;
  }
  W(path.join('public', file), bodyOf(rec.url));
  copied.add(file);
  report.binaries.push(file);
  return lp;
}

/** Rewrites url(...) references of a stylesheet to local paths and copies the files. */
function rewriteCss(css, baseUrl) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, ref) => {
    if (/^(data:|#)/.test(ref)) return all;
    const abs = new URL(ref, baseUrl).toString();
    const hash = ref.includes('#') ? '#' + ref.split('#')[1] : '';
    const lp = copyBinary(abs.split('#')[0]);
    return lp ? `url(${q}${lp.split('#')[0]}${hash}${q})` : all;
  });
}

function importCss(url, dest, note) {
  const rec = find(url);
  const css = rewriteCss(bodyOf(rec.url).toString('utf8'), rec.finalUrl || rec.url);
  W(dest, `/* ${note}\n   Source: ${url.replace(ORIGIN, '')} */\n${css.trim()}\n`);
  report.css.push(dest);
}

// ---------------------------------------------------------------- stylesheets
// Order matches the cascade of the original pages (see docs/site-audit.md).
const P = `${ORIGIN}/wp-content/plugins`;
importCss(`${ORIGIN}/wp-content/themes/astra/assets/css/minified/main.min.css`, 'src/css/vendor/astra/main.min.css', 'Astra theme 4.8.6 – main stylesheet (unchanged)');
importCss(`${ORIGIN}/wp-includes/css/dist/block-library/style.min.css`, 'src/css/vendor/wordpress/block-library.min.css', 'WordPress 6.7 block library styles (unchanged; styles core blocks used in the content)');
importCss(`${ORIGIN}/wp-includes/css/dashicons.min.css`, 'src/css/vendor/wordpress/dashicons.min.css', 'Dashicons icon font (used by feature-list icons)');
importCss(`${P}/elementor/assets/css/frontend.min.css`, 'src/css/vendor/elementor/frontend.min.css', 'Elementor 3.25 frontend CSS – a few generic rules (.screen-reader-text, h1.entry-title) still apply');
importCss(`${ORIGIN}/wp-content/uploads/sites/6/astra-addon/astra-addon-673c88a583eed8-79182470.css`, 'src/css/vendor/astra-addon/astra-addon.css', 'Astra Pro addon 4.8.6 – compiled stylesheet (sticky header, mega menu, blog layouts)');
importCss(`${ORIGIN}/wp-content/uploads/sites/6/tablepress-combined.min.css`, 'src/css/vendor/tablepress/tablepress.min.css', 'TablePress 2.4 table styles');
importCss(`${P}/elementor/assets/lib/font-awesome/css/fontawesome.css`, 'src/css/vendor/font-awesome-5/fontawesome.css', 'Font Awesome 5.15 (Elementor copy)');
importCss(`${P}/elementor/assets/lib/font-awesome/css/solid.css`, 'src/css/vendor/font-awesome-5/solid.css', 'Font Awesome 5.15 solid (Elementor copy)');
importCss(`${P}/essential-blocks/assets/admin/editor/editor.css`, 'src/css/vendor/essential-blocks/editor.css', 'Essential Blocks 5.0.4 shared styles (published on the frontend by the plugin)');
importCss(`${ORIGIN}/wp-content/uploads/sites/6/eb-style/reusable-blocks/eb-reusable-7274.min.css`, 'src/css/vendor/essential-blocks/reusable-7274.css', 'Essential Blocks styles of reusable block #7274');
importCss(`${ORIGIN}/wp-content/uploads/sites/6/eb-style/eb-style-widget.min.css`, 'src/css/vendor/essential-blocks/widgets.css', 'Essential Blocks styles of the footer widgets');
importCss(`${P}/essential-blocks/assets/css/animate.min.css`, 'src/css/vendor/essential-blocks/animate.min.css', 'animate.css (Essential Blocks build, "eb__" prefix) – entrance animations');
importCss(`${P}/essential-blocks/assets/fontawesome/css/all.min.css`, 'src/css/vendor/essential-blocks/fontawesome-all.min.css', 'Font Awesome 5 (Essential Blocks copy)');
importCss(`${P}/essential-blocks/assets/css/eb-common.css`, 'src/css/vendor/essential-blocks/eb-common.css', 'Essential Blocks common helpers (.eb-sr-only)');

// Astra writes a "dynamic" stylesheet per context; identical files are shared.
const DYNAMIC = {
  'theme-page': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-post-527.css`,
  'theme-post': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-post-290.css`,
  'theme-person': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-post-678.css`,
  'theme-person-archive': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-archives.css`,
  'theme-category': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-category-311.css`,
  'theme-category-news': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-category-1.css`,
  'theme-tag': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-tag-291.css`,
  'theme-author': `${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-author-1.css`,
  'addon-single': `${ORIGIN}/wp-content/uploads/sites/6/astra-addon/astra-addon-dynamic-css-post-527.css`,
  'addon-archive': `${ORIGIN}/wp-content/uploads/sites/6/astra-addon/astra-addon-dynamic-css-archives.css`,
};
for (const [name, url] of Object.entries(DYNAMIC)) {
  const rec = assets.find((r) => r.status === 200 && r.url.split('?')[0] === url);
  if (!rec) throw new Error('missing ' + url);
  W(`src/css/theme/${name}.css`, `/* Astra customizer output for this page context (generated by WordPress, copied unchanged).\n   Source: ${url.replace(ORIGIN, '')} */\n${rewriteCss(bodyOf(rec.url).toString('utf8'), url).trim()}\n`);
  report.css.push(`src/css/theme/${name}.css`);
}

// Inline <style> blocks that are identical on every page.
{
  const $ = cheerio.load(bodyOf(`${ORIGIN}/es/`).toString('utf8'), { decodeEntities: false });
  const inline = (id) => rewriteCss($(`style#${id}`).html(), `${ORIGIN}/es/`).trim() + '\n';
  W('src/css/site/global-styles.css', `/* WordPress theme.json presets (colours, font sizes, spacing) – was inline style#global-styles-inline-css */\n${inline('global-styles-inline-css')}`);
  W('src/css/site/essential-blocks-globals.css', `/* Essential Blocks global colour/typography variables – was inline style#essential-blocks-frontend-style-inline-css */\n${inline('essential-blocks-frontend-style-inline-css')}`);
  W('src/css/site/custom.css', `/* Site-specific CSS added in the WordPress customizer ("Additional CSS") – was inline style#wp-custom-css */\n${inline('wp-custom-css')}`);
  W('src/css/site/duotone.css', `/* Duotone filters of the footer images – was inline style#core-block-supports-duotone-inline-css */\n${inline('core-block-supports-duotone-inline-css')}`);
  const sizes = $('head style:not([id])').first().html().trim();
  W('src/css/site/images.css', `/* WordPress default for images with sizes="auto" */\n${sizes}\n`);
  // SVG filter definitions used by the duotone CSS (printed at the end of <body>).
  W('src/templates/partials/duotone-svg.njk', $('body > svg').toArray().map((s) => $.html(s)).join('\n') + '\n');
}

// Google Fonts: merge every @font-face of every requested family into one local file.
{
  // Google Fonts answers with a different format per browser; requesting the CSS as
  // Chrome does yields the same woff2 files (with unicode-range subsets) that visitors
  // of the original site received.
  const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const faces = new Map();
  const fontUrls = new Set();
  for (const r of assets.filter((a) => a.url.startsWith('https://fonts.googleapis.com/css') && a.status === 200)) {
    const res = await cachedGet(r.url, { userAgent: CHROME_UA });
    if (res.status !== 200) throw new Error(`Google Fonts CSS ${r.url}: HTTP ${res.status}`);
    const root = safeParser(res.body.toString('utf8'));
    root.walkAtRules('font-face', (at) => {
      const get = (p) => at.nodes.find((n) => n.prop === p)?.value;
      const key = `${get('font-family')}|${get('font-style')}|${get('font-weight')}|${get('unicode-range')}`;
      if (faces.has(key)) return;
      for (const m of at.toString().matchAll(/url\(([^)]+)\)/g)) fontUrls.add(m[1].replace(/['"]/g, ''));
      faces.set(key, at.toString().replace(/url\(([^)]+)\)/g, (all, u) => `url(${localPath(u.replace(/['"]/g, ''))})`));
    });
  }
  for (const u of fontUrls) {
    const res = await cachedGet(u);
    if (res.status !== 200) throw new Error(`font ${u}: HTTP ${res.status}`);
    W(path.join('public', localPath(u)), res.body);
    report.binaries.push(localPath(u));
  }
  W('src/css/site/fonts.css', `/* Web fonts (Google Fonts, self-hosted). The original site loaded them from fonts.googleapis.com. */\n${[...faces.values()].join('\n')}\n`);
}

// ---------------------------------------------------------------- scripts
function importJs(url, dest, note) {
  const rec = find(url);
  W(dest, `/*! ${note} – source: ${url.replace(ORIGIN, '')} */\n${bodyOf(rec.url).toString('utf8')}\n`);
  report.js.push(dest);
}
importJs(`${ORIGIN}/wp-includes/js/jquery/jquery.min.js`, 'src/js/vendor/jquery.min.js', 'jQuery 3.7.1 (required by the Astra Pro sticky header, Masonry and DataTables)');
importJs(`${ORIGIN}/wp-includes/js/imagesloaded.min.js`, 'src/js/vendor/imagesloaded.min.js', 'imagesLoaded 5.0 (archive grid)');
importJs(`${ORIGIN}/wp-includes/js/masonry.min.js`, 'src/js/vendor/masonry.min.js', 'Masonry 4.2.2 (archive grid)');
importJs(`${ORIGIN}/wp-includes/js/jquery/jquery.masonry.min.js`, 'src/js/vendor/jquery.masonry.min.js', 'jQuery Masonry shim (archive grid)');
importJs(`${ORIGIN}/wp-content/themes/astra/assets/js/minified/frontend.min.js`, 'src/js/vendor/astra-frontend.min.js', 'Astra 4.8.6 frontend (menus, mobile drawer, scroll-to-top)');
importJs(`${ORIGIN}/wp-content/uploads/sites/6/astra-addon/astra-addon-673c88a5866ad6-06174553.js`, 'src/js/vendor/astra-addon.js', 'Astra Pro 4.8.6 compiled frontend (sticky header, blog masonry)');
importJs(`${P}/tablepress/js/jquery.datatables.min.js`, 'src/js/vendor/jquery.datatables.min.js', 'DataTables (TablePress build) – horizontal scrolling of timetables');
importJs(`${P}/essential-blocks/assets/admin/controls/frontend-controls.js`, 'src/js/vendor/eb-frontend-controls.js', 'Essential Blocks 5.0.4 shared helpers (window.eb_frontend) used by the accordion and tabs scripts');
importJs(`${P}/essential-blocks/assets/js/eb-animation-load.js`, 'src/js/vendor/eb-animation-load.js', 'Essential Blocks 5.0.4 entrance animations');
importJs(`${P}/essential-blocks/assets/blocks/accordion/frontend.js`, 'src/js/vendor/eb-accordion.js', 'Essential Blocks 5.0.4 accordion');
importJs(`${P}/essential-blocks/assets/blocks/advanced-tabs/frontend.js`, 'src/js/vendor/eb-tabs.js', 'Essential Blocks 5.0.4 tabs');
importJs(`${P}/essential-blocks/assets/blocks/number-counter/frontend.js`, 'src/js/vendor/eb-counter.js', 'Essential Blocks 5.0.4 number counter');

// ---------------------------------------------------------------- media used by content
// Every /wp-content/uploads/… and /assets/external/… path mentioned in data/ or in the
// block stylesheets is copied from the cache. Missing ones are reported (they are
// broken on the original site as well).
const media = new Set();
const scan = (text) => {
  for (const m of text.matchAll(/(\/(?:wp-content\/uploads|assets\/external|assets\/vendor)\/[^"'\s)?#,\\]+)/g)) media.add(m[1]);
};
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(json|css|njk|html)$/.test(f.name)) scan(fs.readFileSync(p, 'utf8'));
  }
};
walk(path.join(ROOT, 'data'));
walk(path.join(ROOT, 'src'));
// localPath() inverse: find the cached URL for each local path.
const reverse = new Map();
for (const a of assets) {
  if (a.status !== 200) continue;
  const lp = localPath(a.url);
  if (lp && !reverse.has(lp)) reverse.set(lp, a.url);
}
// Inverse of localPath() for resources that were never requested during the crawl.
const sourceUrl = (lp) => {
  let m;
  if ((m = lp.match(/^\/assets\/external\/([^/]+)(\/.*)$/))) return `https://${m[1]}${m[2]}`;
  if ((m = lp.match(/^\/assets\/vendor\/wp-includes\/(.*)$/))) return `${ORIGIN}/wp-includes/${m[1]}`;
  if ((m = lp.match(/^\/assets\/vendor\/(astra|astra-child)\/(.*)$/))) return `${ORIGIN}/wp-content/themes/${m[1]}/${m[2]}`;
  if ((m = lp.match(/^\/assets\/vendor\/(.*)$/))) return `${ORIGIN}/wp-content/plugins/${m[1]}`;
  return ORIGIN + lp;
};
for (const m of media) {
  let url = reverse.get(m);
  if (!url) {
    // Not requested during the crawl (e.g. only referenced from a data attribute): fetch it now.
    const res = await cachedGet(sourceUrl(m));
    if (res.status === 200) {
      W(path.join('public', decodeURIComponent(m)), res.body);
      report.binaries.push(m);
    } else report.missing.push(`${m} (HTTP ${res.status})`);
    continue;
  }
  copyBinary(url);
}

writeJson(path.join(CACHE, 'import-report.json'), report);
console.log(`css ${report.css.length}, js ${report.js.length}, binaries ${report.binaries.length}, missing ${report.missing.length}`);
for (const m of report.missing) console.log('  missing:', m);
