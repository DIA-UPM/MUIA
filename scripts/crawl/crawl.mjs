// Phase 1 of the crawl: discover every public HTML page of the source site.
// Seeds from the Yoast sitemaps and the homepage, then follows internal links (BFS).
// Output: .cache/crawl/pages.json (inventory) – raw HTML lives in the HTTP cache.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { ORIGIN, CACHE, cachedGet, normalizeUrl, isInternal, isCmsEndpoint, DOC_EXT, ASSET_EXT, writeJson } from './lib.mjs';

const refresh = process.argv.includes('--refresh');
const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES ?? 2000);

async function sitemapUrls() {
  const out = [];
  const index = await cachedGet(`${ORIGIN}/sitemap_index.xml`, { refresh });
  const maps = [...index.body.toString().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const map of maps) {
    const res = await cachedGet(map, { refresh });
    for (const m of res.body.toString().matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (!m[1].includes('/wp-content/')) out.push({ url: m[1], sitemap: path.basename(new URL(map).pathname) });
    }
  }
  return out;
}

/** Extracts all resource-ish references from an HTML document. */
export function extractRefs(html, base) {
  const $ = cheerio.load(html);
  const links = new Set();
  const assets = new Set();
  const add = (set, v) => {
    const u = normalizeUrl(v, base);
    if (u) set.add(u);
  };
  $('a[href]').each((_, el) => add(links, $(el).attr('href')));
  const srcsetAttrs = ['srcset', 'data-srcset', 'data-lazy-srcset'];
  const srcAttrs = ['src', 'data-src', 'data-lazy-src', 'data-bg', 'data-background', 'poster', 'data-image', 'data-thumb'];
  $('*').each((_, el) => {
    for (const a of srcAttrs) if (el.attribs?.[a]) add(assets, el.attribs[a]);
    for (const a of srcsetAttrs)
      if (el.attribs?.[a])
        for (const part of el.attribs[a].split(','))
          add(assets, part.trim().split(/\s+/)[0]);
    if (el.attribs?.style) for (const m of el.attribs.style.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(assets, m[1]);
  });
  $('link[href]').each((_, el) => {
    const rel = ($(el).attr('rel') || '').toLowerCase();
    if (/stylesheet|icon|preload|apple-touch-icon|manifest/.test(rel)) add(assets, $(el).attr('href'));
  });
  $('meta[property="og:image"], meta[name="twitter:image"], meta[name="msapplication-TileImage"]').each((_, el) => add(assets, $(el).attr('content')));
  // WP Fastest Cache comments out the original <link>/<script> tags and adds a
  // combined bundle. The originals are the cleaner source, so collect them too.
  for (const c of html.matchAll(/<!--([\s\S]*?)-->/g))
    for (const m of c[1].matchAll(/<(?:link[^>]+href|script[^>]+src)=['"]([^'"]+)['"]/g)) add(assets, m[1]);
  $('style').each((_, el) => {
    for (const m of $(el).text().matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(assets, m[1]);
  });
  return { links: [...links], assets: [...assets] };
}

function classifyLink(u) {
  const p = new URL(u).pathname;
  if (DOC_EXT.test(p)) return 'document';
  if (ASSET_EXT.test(p)) return 'asset';
  return 'page';
}

async function main() {
  const seeds = await sitemapUrls();
  const queue = [{ url: `${ORIGIN}/`, from: 'seed' }, ...seeds.map((s) => ({ url: s.url, from: s.sitemap }))];
  const seen = new Map(); // url -> record
  const documents = new Map(); // url -> Set(pages)
  const externalLinks = new Map();
  const htmlAssets = new Map();

  while (queue.length && seen.size < MAX_PAGES) {
    const { url, from } = queue.shift();
    if (seen.has(url)) {
      seen.get(url).discoveredFrom.add(from);
      continue;
    }
    const rec = { url, discoveredFrom: new Set([from]) };
    seen.set(url, rec);
    const res = await cachedGet(url, { refresh });
    rec.status = res.status;
    rec.finalUrl = res.finalUrl;
    rec.redirects = res.redirects;
    rec.contentType = res.headers['content-type'] || '';
    rec.error = res.error;
    process.stdout.write(`${res.fromCache ? 'cache' : 'fetch'} ${res.status} ${url}\n`);
    if (res.status !== 200 || !rec.contentType.includes('html')) continue;

    const html = res.body.toString('utf8');
    const $ = cheerio.load(html);
    rec.title = $('title').first().text().trim();
    rec.lang = $('html').attr('lang');
    rec.bodyClass = $('body').attr('class') || '';
    rec.canonical = $('link[rel=canonical]').attr('href');
    const { links, assets } = extractRefs(html, res.finalUrl);
    for (const a of assets) {
      if (!htmlAssets.has(a)) htmlAssets.set(a, new Set());
      htmlAssets.get(a).add(url);
    }
    for (const l of links) {
      if (!isInternal(l)) {
        if (!externalLinks.has(l)) externalLinks.set(l, new Set());
        externalLinks.get(l).add(url);
        continue;
      }
      const kind = classifyLink(l);
      if (kind === 'document') {
        if (!documents.has(l)) documents.set(l, new Set());
        documents.get(l).add(url);
      } else if (kind === 'asset') {
        if (!htmlAssets.has(l)) htmlAssets.set(l, new Set());
        htmlAssets.get(l).add(url);
      } else if (!isCmsEndpoint(l) && !new URL(l).pathname.startsWith('/wp-content/')) {
        // Drop query strings that WordPress uses for UI state only.
        const clean = new URL(l);
        if (clean.search && !/^\?(page|paged)=/.test(clean.search)) {
          rec.queryLinks = (rec.queryLinks || []).concat(l);
          continue;
        }
        queue.push({ url: l, from: url });
      }
    }
  }

  const toObj = (m) => Object.fromEntries([...m].map(([k, v]) => [k, [...v].sort()]));
  const pages = [...seen.values()].map((r) => ({ ...r, discoveredFrom: [...r.discoveredFrom] }));
  writeJson(path.join(CACHE, 'pages.json'), pages);
  writeJson(path.join(CACHE, 'documents.json'), toObj(documents));
  writeJson(path.join(CACHE, 'external-links.json'), toObj(externalLinks));
  writeJson(path.join(CACHE, 'html-assets.json'), toObj(htmlAssets));
  const ok = pages.filter((p) => p.status === 200 && p.contentType?.includes('html'));
  console.log(`\npages: ${pages.length} (html ok: ${ok.length}), documents: ${documents.size}, html-referenced assets: ${htmlAssets.size}, external links: ${externalLinks.size}`);
}

if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
