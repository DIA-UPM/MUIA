// Phase 3 of the crawl: download every static resource referenced by the pages
// (HTML attributes, CSS url()/@import, and requests observed while rendering),
// plus downloadable documents. Everything is cached under .cache/crawl/http.
// Output: .cache/crawl/assets.json – one record per resource with a category:
//   A = needed by the static site            B = needed only by the CMS runtime
//   C = duplicate (same bytes as another URL) D = obsolete / broken
//   E = intentionally external (not downloaded)
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE, HOST, cachedGet, normalizeUrl, readJson, writeJson, DOC_EXT } from './lib.mjs';

const refresh = process.argv.includes('--refresh');

// Third-party hosts whose files are needed to render the page (fonts, sister-site
// images embedded in the footer). Everything else external stays external.
const DOWNLOADABLE_EXTERNAL = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'mucd.dia.fi.upm.es', 'www.fi.upm.es']);

const CMS_RUNTIME = [
  /\/wp-json\//,
  /\/wp-admin\//,
  /xmlrpc\.php/,
  /wp-emoji-release/,
  /\/wp-includes\/js\/dist\//, // React, wp.apiFetch, i18n … only used by plugin runtimes
  /\/wp-includes\/js\/(jquery|masonry|imagesloaded)/,
  /\/feed\/?$/,
  /\/oembed\//,
  /essential-blocks\/assets\/(vendors|admin)\//,
  /essential-blocks\/assets\/js\/(react-player|eb-blocks-localize)/,
  /essential-addons-for-elementor-lite\/.*\.js/,
  /astra-addon\/assets\/js\/minified\/purify/,
  /flexibility\.min\.js/,
  /wp-video-lightbox\/js\//,
];

function category(url) {
  const u = new URL(url);
  if (u.host !== HOST && !DOWNLOADABLE_EXTERNAL.has(u.host)) return 'E';
  if (CMS_RUNTIME.some((re) => re.test(url))) return 'B';
  return 'A';
}

const htmlAssets = readJson(path.join(CACHE, 'html-assets.json'), {});
const documents = readJson(path.join(CACHE, 'documents.json'), {});
const rendered = readJson(path.join(CACHE, 'rendered.json'), {});

const refs = new Map(); // url -> Set(referrers)
const addRef = (u, from) => {
  if (!u) return;
  if (!refs.has(u)) refs.set(u, new Set());
  refs.get(u).add(from);
};
for (const [u, pages] of Object.entries(htmlAssets)) for (const p of pages) addRef(u, p);
for (const [page, r] of Object.entries(rendered))
  for (const req of r.requests || []) if (req.type !== 'document' && !req.url.startsWith('data:')) addRef(normalizeUrl(req.url), page);

const records = new Map();
const queue = [...refs.keys()];
const byHash = new Map();
while (queue.length) {
  const url = queue.shift();
  if (records.has(url)) continue;
  const cat = category(url);
  const rec = { url, category: cat, referencedBy: [...(refs.get(url) || [])].sort(), isDocument: DOC_EXT.test(new URL(url).pathname) };
  records.set(url, rec);
  if (cat === 'E') continue;
  const res = await cachedGet(url, { refresh });
  rec.status = res.status;
  rec.finalUrl = res.finalUrl;
  rec.redirects = res.redirects;
  rec.contentType = (res.headers['content-type'] || '').split(';')[0];
  rec.bytes = res.body.length;
  if (res.status !== 200) {
    rec.category = 'D';
    console.log(`BROKEN ${res.status} ${url}`);
    continue;
  }
  const hash = crypto.createHash('sha1').update(res.body).digest('hex');
  rec.sha1 = hash;
  if (byHash.has(hash) && byHash.get(hash) !== url.split('?')[0]) {
    rec.duplicateOf = byHash.get(hash);
    if (rec.category === 'A') rec.category = 'C';
  } else byHash.set(hash, url.split('?')[0]);
  console.log(`${res.fromCache ? 'cache' : 'fetch'} ${res.status} ${rec.category} ${url}`);

  if (rec.contentType.includes('css') || /\.css(\?|$)/.test(url)) {
    const css = res.body.toString('utf8');
    for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+['"]([^'"]+)['"]/g)) {
      const raw = m[2] || m[3];
      if (!raw || raw.startsWith('data:') || raw.startsWith('#')) continue;
      const abs = normalizeUrl(raw, res.finalUrl);
      if (!abs) continue;
      addRef(abs, url);
      if (!records.has(abs)) queue.push(abs);
    }
  }
}
// Documents linked from pages.
for (const [url, pages] of Object.entries(documents)) {
  if (records.has(url)) {
    records.get(url).isDocument = true;
    continue;
  }
  const res = await cachedGet(url, { refresh });
  records.set(url, {
    url,
    isDocument: true,
    category: res.status === 200 ? 'A' : 'D',
    referencedBy: pages,
    status: res.status,
    finalUrl: res.finalUrl,
    redirects: res.redirects,
    contentType: (res.headers['content-type'] || '').split(';')[0],
    bytes: res.body.length,
  });
  console.log(`doc ${res.status} ${url}`);
}
for (const rec of records.values()) rec.referencedBy = [...(refs.get(rec.url) || rec.referencedBy || [])].sort();

const all = [...records.values()];
writeJson(path.join(CACHE, 'assets.json'), all);
const count = (c) => all.filter((r) => r.category === c).length;
console.log(`\nresources: ${all.length}  A:${count('A')} B:${count('B')} C:${count('C')} D:${count('D')} E:${count('E')}  documents:${all.filter((r) => r.isDocument).length}`);
