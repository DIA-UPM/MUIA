// Checks the built site (dist/) for broken internal links, missing images,
// stylesheets, scripts, fonts and documents, invalid #anchors, malformed URLs
// and leftover dependencies on the WordPress runtime.
//
//   npm run check-links            (after npm run build)
//   node scripts/validation/check-links.mjs --external   also HEAD-checks external links (slow)
//
// Problems that already existed on the original site are listed in
// data/known-missing-files.json and reported as warnings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.resolve(ROOT, process.env.DIST_DIR || 'dist');
// A build made with SITE_URL records its public URL and sub-folder in the manifest.
const manifestFile = path.join(DIST, 'build-manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
const ORIGIN = manifest.siteUrl || JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8')).origin;
const BASE = manifest.basePath || '';
const known = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/known-missing-files.json'), 'utf8'));
const KNOWN = new Map([...known.files, ...(known.links || [])].map((k) => [k.path, k.reason]));
const CMS = /^\/(wp-admin|wp-json|wp-includes|wp-content\/(plugins|themes|cache))\/|^\/(xmlrpc|wp-login|wp-cron)\.php|\/feed\/$|admin-ajax/;

const errors = [];
const warnings = [];
const report = (list, page, what, url, why) => list.push({ page, what, url, why });

function fileFor(urlPath) {
  let p = decodeURIComponent(urlPath.split(/[?#]/)[0]).replace(/\/{2,}/g, '/');
  if (BASE) {
    if (p !== BASE && !p.startsWith(BASE + '/')) return null; // outside the site's sub-folder
    p = p.slice(BASE.length) || '/';
  }
  const f = path.join(DIST, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  if (fs.existsSync(path.join(f, 'index.html'))) return path.join(f, 'index.html');
  return null;
}

const htmlFiles = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
};
walk(DIST);

const ids = new Map(); // file -> Set(ids)
const idsOf = (file) => {
  if (!ids.has(file)) {
    const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
    const s = new Set();
    $('[id]').each((_, e) => s.add($(e).attr('id')));
    $('a[name]').each((_, e) => s.add($(e).attr('name')));
    ids.set(file, s);
  }
  return ids.get(file);
};

const external = new Map(); // url -> pages
let checked = 0;
for (const file of htmlFiles) {
  const page = BASE + '/' + path.relative(DIST, file).replace(/\\/g, '/').replace(/index\.html$/, '');
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const refs = [];
  $('a[href]').each((_, e) => refs.push(['link', $(e).attr('href')]));
  $('img[src], script[src], iframe[src], source[src], video[src]').each((_, e) => refs.push([e.name === 'img' ? 'image' : e.name, $(e).attr('src')]));
  $('img[srcset], source[srcset]').each((_, e) => $(e).attr('srcset').split(',').forEach((part) => refs.push(['image', part.trim().split(/\s+/)[0]])));
  $('link[href]').each((_, e) => refs.push([$(e).attr('rel') === 'stylesheet' ? 'stylesheet' : 'link-tag', $(e).attr('href')]));
  $('[style*="url("]').each((_, e) => {
    for (const m of $(e).attr('style').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.push(['image', m[1]]);
  });
  $('[data-light], [data-playicon]').each((_, e) => ['data-light', 'data-playicon'].forEach((a) => $(e).attr(a) && refs.push(['image', $(e).attr(a)])));
  for (let [what, raw] of refs) {
    checked++;
    if (!raw || /^(mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
    if (/\s/.test(raw.trim()) && !raw.includes('%20')) {
      const reason = KNOWN.get(raw.trim());
      report(reason ? warnings : errors, page, what, raw, reason ? `malformed URL (known: ${reason})` : 'malformed URL (contains spaces)');
      continue;
    }
    let url = raw.trim();
    if (url.startsWith(ORIGIN)) {
      if (what === 'link-tag') continue; // canonical / hreflang / og URLs are absolute on purpose
      url = url.slice(ORIGIN.length) || '/';
    }
    if (/^https?:\/\//.test(url) || url.startsWith('//')) {
      if (what === 'link') {
        if (!external.has(url)) external.set(url, new Set());
        external.get(url).add(page);
      } else if (what !== 'link-tag') report(errors, page, what, url, 'resource loaded from another site');
      continue;
    }
    if (url.startsWith('#')) {
      const id = decodeURIComponent(url.slice(1));
      if (id && !idsOf(file).has(id)) report(errors, page, what, url, 'anchor not found on the page');
      continue;
    }
    const abs = new URL(url, `http://x${page}`);
    if (CMS.test(BASE && abs.pathname.startsWith(BASE + '/') ? abs.pathname.slice(BASE.length) : abs.pathname)) report(errors, page, what, url, 'depends on the WordPress runtime');
    const target = fileFor(abs.pathname);
    if (!target) {
      const unbased = (p) => (BASE && p.startsWith(BASE + '/') ? p.slice(BASE.length) : p);
      const reason = KNOWN.get(unbased(abs.pathname)) || KNOWN.get(unbased(url.split('#')[0]));
      report(reason ? warnings : errors, page, what, url, reason ? `missing (known: ${reason})` : 'target does not exist');
      continue;
    }
    if (abs.hash && target.endsWith('.html')) {
      const id = decodeURIComponent(abs.hash.slice(1));
      if (!idsOf(target).has(id)) report(warnings, page, what, url, `anchor #${id} not found on the target page (also missing on the original site)`);
    }
  }
}

// Stylesheets: url() references.
const cssDir = path.join(DIST, 'assets', 'css');
const cssFiles = [];
const walkCss = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walkCss(path.join(d, e.name)) : e.name.endsWith('.css') && cssFiles.push(path.join(d, e.name))));
walkCss(cssDir);
for (const f of cssFiles) {
  const css = fs.readFileSync(f, 'utf8');
  const rel = BASE + '/' + path.relative(DIST, f).replace(/\\/g, '/');
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const u = m[2];
    checked++;
    if (/^(data:|#)/.test(u)) continue;
    if (/^https?:|^\/\//.test(u)) {
      report(errors, rel, 'css url()', u, 'resource loaded from another site');
      continue;
    }
    const abs = new URL(u, `http://x${rel}`).pathname;
    if (!fileFor(abs)) {
      const reason = KNOWN.get(BASE && abs.startsWith(BASE + '/') ? abs.slice(BASE.length) : abs);
      // Theme stylesheets reference a few optional images that the site never uses.
      report(reason ? warnings : warnings, rel, 'css url()', u, reason ? `missing (known: ${reason})` : 'not copied (not referenced by any page of the site)');
    }
  }
}

async function checkExternal() {
  let broken = 0;
  for (const [url, pages] of external) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (res.status >= 400 && res.status !== 405 && res.status !== 403) {
        broken++;
        report(warnings, [...pages][0], 'external link', url, `HTTP ${res.status}`);
      }
    } catch (err) {
      report(warnings, [...pages][0], 'external link', url, `unreachable (${err.cause?.code || err.name})`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return broken;
}
if (process.argv.includes('--external')) await checkExternal();

const group = (list) => {
  const m = new Map();
  for (const e of list) {
    const k = `${e.what} ${e.url} – ${e.why}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e.page);
  }
  return m;
};
const out = { checked, pages: htmlFiles.length, externalLinks: external.size, errors, warnings };
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test-results', 'link-check.json'), JSON.stringify(out, null, 1));
for (const [k, pages] of group(warnings)) console.log(`warning: ${k}  (${pages.length} page${pages.length > 1 ? 's' : ''}, e.g. ${pages[0]})`);
for (const [k, pages] of group(errors)) console.log(`ERROR:   ${k}  (${pages.length} page${pages.length > 1 ? 's' : ''}, e.g. ${pages[0]})`);
console.log(`\nChecked ${checked} references in ${htmlFiles.length} HTML files and ${cssFiles.length} stylesheets: ${errors.length} errors, ${warnings.length} warnings, ${external.size} distinct external links${process.argv.includes('--external') ? ' (checked)' : ' (not checked; use --external)'}.`);
if (errors.length) process.exit(1);
