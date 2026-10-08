// Structural comparison of the static build against the crawled original pages.
//
//   node tests/tools/compare-dom.mjs [filter]
//
// For every page, the canonical DOM (attributes sorted, class lists sorted,
// whitespace collapsed, URLs made root-relative) of the main regions is
// compared. Requires the crawl cache (.cache/crawl), i.e. `npm run crawl`.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { CACHE, ROOT, sha, readJson } from '../../scripts/crawl/lib.mjs';
import { localizeHtml } from '../../scripts/crawl/urlmap.mjs';
import { canonical } from '../../scripts/crawl/parse-blocks.mjs';

const DIST = path.resolve(ROOT, process.env.DIST_DIR || 'dist');
const filter = process.argv[2];
const REGIONS = {
  header: '#masthead',
  content: '#content',
  popup: '#ast-mobile-popup-wrapper',
  footer: '#colophon',
  banner: '.ast-single-entry-banner',
};

// Differences that are intentional (see docs/site-audit.md, "Removed"):
function normalizeOriginal($) {
  $('script, noscript, style, link').remove();
  // Lazy-loading hints that WordPress adds per request.
  $('img').removeAttr('loading').removeAttr('fetchpriority').removeAttr('decoding');
  // Post grid query/attribute blobs for the removed REST pagination.
  $('.eb-post-grid-wrapper').removeAttr('data-querydata').removeAttr('data-attributes');
}
function normalizeBuilt($) {
  $('script, noscript, style, link').remove();
  $('img').removeAttr('loading').removeAttr('fetchpriority').removeAttr('decoding');
  $('.eb-post-grid-wrapper').removeAttr('data-per-page');
  // All post-grid items are in the HTML; the original printed only the first page.
  $('.eb-post-grid-wrapper').each((_, w) => {
    const per = Number($(w).attr('data-per-page-orig'));
    if (per) $(w).find('.ebpg-grid-post').slice(per).remove();
    $(w).removeAttr('data-per-page-orig');
  });
}

export function compareUrl(url) {
  const origFile = path.join(CACHE, 'http', sha(url) + '.bin');
  const u = new URL(url);
  const builtFile = path.join(DIST, decodeURIComponent(u.pathname), 'index.html');
  if (!fs.existsSync(builtFile)) return { url, missing: true };
  const $o = cheerio.load(localizeHtml(fs.readFileSync(origFile, 'utf8')), { decodeEntities: true });
  const $b = cheerio.load(fs.readFileSync(builtFile, 'utf8'), { decodeEntities: true });
  normalizeOriginal($o);
  // Grids with pagination contain every item in the static build.
  $b('.eb-post-grid-wrapper[data-per-page]').each((_, w) => $b(w).attr('data-per-page-orig', $b(w).attr('data-per-page')));
  normalizeBuilt($b);
  const diffs = {};
  for (const [name, sel] of Object.entries(REGIONS)) {
    const a = canonical($o.html($o(sel).first()) || '');
    const b = canonical($b.html($b(sel).first()) || '');
    if (a !== b) {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      diffs[name] = { at: i, original: a.slice(Math.max(0, i - 200), i + 300), built: b.slice(Math.max(0, i - 200), i + 300) };
    }
  }
  const bc = (x) => [...new Set(x('body').attr('class').split(/\s+/))].sort().join(' ');
  if (bc($o) !== bc($b)) diffs.bodyClass = { original: bc($o), built: bc($b) };
  if ($o('html').attr('lang') !== $b('html').attr('lang')) diffs.lang = { original: $o('html').attr('lang'), built: $b('html').attr('lang') };
  return { url, diffs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, path.sep)) {
  const pages = readJson(path.join(CACHE, 'pages.json'), []).filter((p) => p.status === 200 && p.finalUrl === p.url && !p.url.endsWith('//') && (!filter || p.url.includes(filter)));
  const summary = {};
  const results = [];
  for (const p of pages) {
    const r = compareUrl(p.url);
    results.push(r);
    if (r.missing) summary.missing = (summary.missing || 0) + 1;
    for (const k of Object.keys(r.diffs || {})) summary[k] = (summary[k] || 0) + 1;
  }
  const out = path.join(CACHE, 'compare-dom.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  console.log(`${pages.length} pages compared`, summary);
  const show = Number(process.env.SHOW || 3);
  const shown = {};
  for (const r of results) {
    if (r.missing) {
      console.log('MISSING', r.url);
      continue;
    }
    for (const [k, d] of Object.entries(r.diffs)) {
      if ((shown[k] = (shown[k] || 0) + 1) > show) continue;
      console.log(`\n## ${k} ${r.url}`);
      if (d.at !== undefined) {
        console.log('  ORIG :', d.original);
        console.log('  BUILT:', d.built);
      } else {
        const o = new Set(d.original.split(' ')), b = new Set(d.built.split(' '));
        console.log('  only original:', [...o].filter((x) => !b.has(x)).join(' '), '\n  only built:', [...b].filter((x) => !o.has(x)).join(' '));
      }
    }
  }
}
