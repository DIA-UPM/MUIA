// Phase 4: extract the site's content from the crawled HTML into the JSON files
// under data/. This is a one-off migration tool: once the JSON exists it is the
// source of truth and is edited by hand. Re-running it overwrites data/ (use
// --force), so it refuses to run when data/ already exists.
//
//   node scripts/crawl/extract.mjs --force
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { CACHE, ROOT, ORIGIN, sha, readJson, writeJson } from './lib.mjs';
import { parseChildren, stats, canonical } from './parse-blocks.mjs';
import { localizeHtml, localizeUrl } from './urlmap.mjs';
import { renderBlocks } from '../build/lib/blocks.mjs';
import { renderPersonLayout } from '../build/lib/person.mjs';

const personMismatches = [];

const DATA = path.join(ROOT, 'data');
if (fs.existsSync(DATA) && !process.argv.includes('--force')) {
  console.error('data/ already exists. Re-run with --force to overwrite it with freshly extracted content.');
  process.exit(1);
}

const pages = readJson(path.join(CACHE, 'pages.json'), []).filter(
  (p) => p.status === 200 && p.contentType.includes('html') && p.finalUrl === p.url && !p.url.endsWith('//'),
);
const load = (url) => cheerio.load(fs.readFileSync(path.join(CACHE, 'http', sha(url) + '.bin'), 'utf8'), { decodeEntities: false });
const pathOf = (url) => new URL(url).pathname;
const LANGS = { 'es-ES': 'es', 'en-US': 'en' };

function typeOf(p) {
  const bc = new Set(p.bodyClass.split(/\s+/));
  if (bc.has('home')) return 'home';
  if (bc.has('single-personal')) return 'person';
  if (bc.has('single-post')) return 'post';
  if (bc.has('page-template-default')) return 'page';
  if (bc.has('post-type-archive-personal')) return 'person-archive';
  if (bc.has('category')) return 'category-archive';
  if (bc.has('tag')) return 'tag-archive';
  if (bc.has('author')) return 'author-archive';
  return 'unknown';
}

// ---------------------------------------------------------------- head / SEO
// Only the metadata that cannot be derived from the record is stored; the
// build regenerates the Yoast-style tags and JSON-LD graph from the record
// fields (see scripts/build/lib/seo.mjs).
const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
function readSeo($) {
  const name = (n) => $(`meta[name="${n}"]`).attr('content');
  const prop = (n) => $(`meta[property="${n}"]`).attr('content');
  const seo = { title: $('title').first().text() };
  if (name('description') !== undefined) seo.description = name('description');
  if (prop('og:title') !== seo.title) seo.ogTitle = prop('og:title');
  if (prop('og:description') !== undefined && prop('og:description') !== seo.description) seo.ogDescription = prop('og:description');
  if (name('robots') !== DEFAULT_ROBOTS) seo.robots = name('robots');
  if (prop('og:image')) {
    seo.image = { src: localizeUrl(prop('og:image'), { resource: true }) };
    if (prop('og:image:width')) seo.image.width = Number(prop('og:image:width'));
    if (prop('og:image:height')) seo.image.height = Number(prop('og:image:height'));
    if (prop('og:image:type')) seo.image.type = prop('og:image:type');
  }
  const graph = $('script.yoast-schema-graph').length ? JSON.parse($('script.yoast-schema-graph').html())['@graph'] : [];
  const primary = graph.find((g) => g['@type'] === 'ImageObject' && String(g['@id']).endsWith('#primaryimage'));
  if (primary) {
    seo.schemaImage = { src: localizeUrl(primary.url, { resource: true }) };
    if (primary.width) seo.schemaImage.width = primary.width;
    if (primary.height) seo.schemaImage.height = primary.height;
    if (primary.caption) seo.schemaImage.caption = primary.caption;
  }
  const twitter = {};
  $('meta[name^="twitter:label"], meta[name^="twitter:data"]').each((_, e) => (twitter[$(e).attr('name')] = $(e).attr('content')));
  if (Object.keys(twitter).length) seo.twitter = twitter;
  // Hand-written structured data (e.g. FAQPage) is kept verbatim.
  const extra = $('script[type="application/ld+json"]:not(.yoast-schema-graph)')
    .toArray()
    .map((e) => $(e).html().trim());
  if (extra.length) seo.extraSchema = extra;
  return seo;
}

const yoastGraph = ($) => ($('script.yoast-schema-graph').length ? JSON.parse($('script.yoast-schema-graph').html())['@graph'] : []);

function readAlternates($) {
  const alt = {};
  $('link[rel=alternate][hreflang]').each((_, e) => {
    const h = $(e).attr('hreflang');
    if (h !== 'x-default') alt[h] = localizeUrl($(e).attr('href'));
  });
  return alt;
}

const postIdOf = (bc) => Number((bc.match(/\b(?:page-id|postid)-(\d+)/) || [])[1]) || undefined;

// ---------------------------------------------------------------- shared state
const out = { pages: [], news: [], people: [], taxonomies: { category: {}, post_tag: {} } };
const bodyClasses = {}; // type -> { classString: count }
const typeCounts = {};
const report = { pages: [], skipped: [] };
const imageSizes = {}; // src -> {width,height}
const archives = [];
const authors = {};
const dataTablesLanguage = {};

function noteBodyClass(type, bc, id) {
  const norm = bc.replace(new RegExp(`\\b(page-id|postid|post)-${id}\\b`, 'g'), '$1-{id}').trim();
  bodyClasses[type] ??= {};
  bodyClasses[type][norm] = (bodyClasses[type][norm] || 0) + 1;
  return norm;
}

// WordPress term ids → slugs, read from the body classes of the archive pages
// ("tag tag-<slug> tag-<id>").
const TERM_SLUGS = {};
for (const p of pages) {
  for (const m of p.bodyClass.matchAll(/\b(?:category|tag)-([a-z][\w-]*) (?:category|tag)-(\d+)\b/g)) TERM_SLUGS[m[2]] = m[1];
}

const renderCtx = { renderPostGrid: (b) => b.__original };
function blockCtx(url) {
  return {
    pageUrl: url,
    renderCtx,
    parsePostGrid($, inner, b) {
      const w = $(inner).children('.eb-post-grid-wrapper');
      const q = JSON.parse(w.attr('data-querydata'));
      const a = JSON.parse(w.attr('data-attributes'));
      b.preset = (w.attr('class').match(/\bstyle-\d+\b/) || [])[0];
      b.source = q.source === 'personal' ? 'people' : 'news';
      const tax = q.taxonomies || {};
      const terms = (k) => JSON.parse(tax[k]?.value || '[]').map((t) => TERM_SLUGS[t.value] ?? `unknown-term-${t.value}`);
      if (terms('category').length) b.categories = terms('category');
      if (terms('post_tag').length) b.tags = terms('post_tag');
      // The filter bar shows the terms with the names published on the page.
      const filter = w.find('.ebpg-category-filter-list-item').toArray();
      if (filter.length) b.filterTerms = filter.map((li) => ({ slug: $(li).attr('data-ebpgcategory'), name: $(li).html() }));
      if (w.find('.eb-post-grid-category-filter').attr('data-ebpgtaxonomy')) b.filterTaxonomy = w.find('.eb-post-grid-category-filter').attr('data-ebpgtaxonomy');
      b.orderBy = q.orderby;
      b.order = q.order;
      b.perPage = Number(q.per_page);
      b.pagination = !!a.loadMoreOptions?.enableMorePosts;
      b.showThumbnail = !!a.showThumbnail;
      b.showTaxonomyFilter = !!a.showTaxonomyFilter;
      b.showMeta = !!a.showMeta;
      if (b.showMeta) {
        b.headerMeta = JSON.parse(a.headerMeta || '[]').map((m) => m.value);
        b.footerMeta = JSON.parse(a.footerMeta || '[]').map((m) => m.value);
      }
      b.titleTag = a.titleTag || 'h2';
      if (a.titleLength) b.titleWords = Number(a.titleLength);
      // Item order/membership is re-derived from the collections at build time;
      // keep the original markup to verify that later.
      b.__original = $.html($(inner).parent());
      b.__items = w
        .find('article.ebpg-grid-post')
        .toArray()
        .map((art) => {
          const img = $(art).find('img').get(0);
          if (img) imageSizes[localizeUrl($(img).attr('src'), { resource: true })] = { width: Number($(img).attr('width')), height: Number($(img).attr('height')) };
          return localizeUrl($(art).find('a.ebpg-grid-post-link').attr('href'));
        });
    },
  };
}

function parseContent($, el, url) {
  // Localise URLs before parsing so the JSON only contains local paths.
  const html = localizeHtml($(el).html());
  const $$ = cheerio.load(`<div id="__root">${html}</div>`, { decodeEntities: false }, false);
  return parseChildren($$, $$('#__root').get(0), blockCtx(url));
}

// ---------------------------------------------------------------- per type
for (const p of pages) {
  const type = typeOf(p);
  typeCounts[type] = (typeCounts[type] || 0) + 1;
  if (type.endsWith('-archive') && type !== 'person-archive' && !/category|tag|author/.test(type)) continue;
  const $ = load(p.url);
  const lang = LANGS[$('html').attr('lang')];
  const id = postIdOf(p.bodyClass);
  const urlPath = pathOf(p.url);

  if (type === 'home' || type === 'page') {
    if (urlPath === '/') {
      report.skipped.push({ url: p.url, reason: 'root URL serves the Spanish homepage (x-default); generated from the /es/ record' });
      continue;
    }
    const seo = readSeo($);
    const graph = yoastGraph($);
    const crumbs = graph.find((g) => g['@type'] === 'BreadcrumbList')?.itemListElement || [];
    const wp = graph.find((g) => g['@type'] === 'WebPage');
    const rec = {
      slug: type === 'home' ? 'home' : urlPath.split('/').filter(Boolean).pop(),
      lang,
      path: urlPath,
      title: crumbs.at(-1)?.name ?? seo.title.split(' - ')[0],
      wpId: id,
      date: wp?.datePublished,
      modified: wp?.dateModified,
      translations: readAlternates($),
      seo,
      bodyClass: noteBodyClass(type, p.bodyClass, id),
      blocks: parseContent($, $('.entry-content').get(0), p.url),
    };
    if (type === 'home') rec.isHome = true;
    if ($('article.ast-article-single').hasClass('has-post-thumbnail')) rec.hasFeaturedImage = true;
    // TablePress/DataTables initialisation (inline script on the original page).
    const dt = $('script:not([src])')
      .toArray()
      .map((e) => $(e).html())
      .find((t) => t.includes('.DataTable('));
    if (dt) {
      const lang = dt.match(/var DT_language=(\{[\s\S]*?\});\n/);
      if (lang) dataTablesLanguage[Object.keys(JSON.parse(lang[1]))[0]] = Object.values(JSON.parse(lang[1]))[0];
      rec.tables = [...dt.matchAll(/\$\('([^']+)'\)\.DataTable\((\{[\s\S]*?\})\);/g)].map((m) => {
        const options = JSON.parse(m[2].replace(/"language":DT_language\["(\w+)"\],?/, ''));
        return { selector: m[1], options };
      });
    }
    out.pages.push(rec);
  } else if (type === 'post') {
    const seo = readSeo($);
    const art = $('article.ast-article-single');
    const ac = art.attr('class');
    const thumb = $('.ast-single-entry-banner .post-thumb-img-content img');
    const graph = yoastGraph($);
    const article = graph.find((g) => g['@type'] === 'Article') || graph.find((g) => g['@type'] === 'WebPage');
    const rec = {
      slug: urlPath.split('/').filter(Boolean).pop(),
      lang,
      path: urlPath,
      title: $('.ast-single-entry-banner h1.entry-title').html(),
      wpId: id,
      date: article?.datePublished,
      modified: article?.dateModified,
      author: $('meta[name="author"]').attr('content'),
      categories: [...ac.matchAll(/\bcategory-([\w-]+)/g)].map((m) => m[1]),
      tags: [...ac.matchAll(/\btag-([\w-]+)/g)].map((m) => m[1]),
      translations: readAlternates($),
      seo,
      bodyClass: noteBodyClass(type, p.bodyClass, id),
      blocks: parseContent($, $('.entry-content').get(0), p.url),
    };
    if (thumb.length) rec.featuredImage = imageOf($, thumb);
    const person = graph.find((g) => g['@type'] === 'Person');
    if (person && !authors[person.name])
      authors[person.name] = {
        name: person.name,
        schemaId: person['@id'].split('#/schema/person/')[1],
        avatar: person.image?.url,
        sameAs: person.sameAs,
        url: person.url ? localizeUrl(person.url) : undefined,
      };
    if (article?.wordCount) rec.wordCount = article.wordCount;
    // WordPress marks the menu item of the post's parent page (post_parent) with "current-post-parent".
    const parentItem = $('#ast-hf-menu-1 li.menu-item-object-page.current-post-parent > a').attr('href');
    if (parentItem) rec.parentPage = localizeUrl(parentItem);
    out.news.push(rec);
  } else if (type === 'person') {
    const seo = readSeo($);
    const art = $('article.ast-article-single');
    const ac = art.attr('class');
    const graph = yoastGraph($);
    const wp = graph.find((g) => g['@type'] === 'WebPage');
    const rec = {
      slug: urlPath.split('/').filter(Boolean).pop(),
      lang,
      path: urlPath,
      name: $('.ast-single-entry-banner h1.entry-title').html(),
      wpId: id,
      date: wp?.datePublished,
      modified: wp?.dateModified,
      tags: [...ac.matchAll(/\btag-([\w-]+)/g)].map((m) => m[1]),
      translations: readAlternates($),
      seo,
      bodyClass: noteBodyClass(type, p.bodyClass, id),
      ...parsePerson($, p.url),
    };
    out.people.push(rec);
  } else if (/archive/.test(type)) {
    readArchive($, p, type, lang);
  } else report.skipped.push({ url: p.url, reason: `unknown page type (${p.bodyClass})` });
}

function imageOf($, img) {
  const i = { src: localizeUrl(img.attr('src'), { resource: true }) };
  if (img.attr('width')) i.width = Number(img.attr('width'));
  if (img.attr('height')) i.height = Number(img.attr('height'));
  i.alt = img.attr('alt') ?? '';
  if (img.attr('srcset')) i.srcset = localizeHtml(`srcset="${img.attr('srcset')}"`).slice(8, -1);
  if (img.attr('sizes')) i.sizes = img.attr('sizes');
  return i;
}

// Person pages: a fixed layout (photo + contact list) followed by a free-text biography.
function parsePerson($, url) {
  const content = $('.entry-content');
  const html = localizeHtml(content.html().replace(/<!--[sS]*?-->/g, ''));
  const $$ = cheerio.load(`<div id="__root">${html}</div>`, { decodeEntities: false }, false);
  const root = $$('#__root');
  const wrapper = root.children('.wp-block-essential-blocks-wrapper').first();
  const inner = wrapper.find('.eb-wrapper-inner-blocks').first();
  const row = inner.children('.wp-block-essential-blocks-row').first();
  const result = { photo: null, contact: [], biography: [] };
  const img = row.find('img.my-custom-image').first();
  result.photo = { src: img.attr('src') };
  if (img.attr('alt')) result.photo.alt = img.attr('alt');
  // Text that precedes the photo in the same column (the English profiles show a stray "<").
  const photoCol = img.closest('.eb-column-inner');
  const prefix = photoCol.contents().toArray().filter((n) => n.type === 'text').map((n) => n.data).join('').trim();
  if (prefix) result.photoPrefixHtml = $$.html(photoCol.contents().toArray().find((n) => n.type === 'text' && n.data.trim())).trim();
  row.find('li.eb-feature-list-item').each((_, li) => {
    const $li = $$(li);
    const titleEl = $li.find('.eb-feature-list-title');
    const a = titleEl.children('a.acf-custom-link');
    const th = titleEl.html();
    const colon = th.indexOf(':');
    const item = { icon: $li.attr('data-icon'), label: th.slice(0, colon) };
    const rest = th.slice(colon + 1);
    const sep = rest.match(/^\s*/)[0];
    if (sep !== ' ') item.separator = ':' + sep;
    if (a.length) {
      item.value = a.html();
      item.href = a.attr('href');
      if (a.attr('target')) item.target = a.attr('target');
    } else item.value = rest.slice(sep.length);
    if ($li.attr('data-new-tab') === 'true') item.itemNewTab = true;
    if ($li.attr('data-icon-color') !== undefined) item.iconColor = $li.attr('data-icon-color');
    if ($li.attr('data-icon-background-color') !== 'rgba(219,173,119,1)') item.iconBackground = $li.attr('data-icon-background-color');
    result.contact.push(item);
  });
  row.remove();
  result.biography = parseChildren($$, inner.get(0), blockCtx(url));
  // Content placed after the profile wrapper (rare, e.g. a separator).
  wrapper.remove();
  const after = parseChildren($$, root.get(0), blockCtx(url));
  if (after.length) result.afterProfile = after;
  // Verify that the profile template reproduces the original markup.
  const rendered = renderPersonLayout(result, renderBlocks(result.biography, renderCtx)) + (after.length ? `\n${renderBlocks(after, renderCtx)}` : '');
  if (canonical(rendered) !== canonical(html)) personMismatches.push({ url, original: canonical(html), rendered: canonical(rendered) });
  return result;
}

// ---------------------------------------------------------------- archives

function readArchive($, p, type, lang) {
  const items = $('article.ast-archive-post')
    .toArray()
    .map((art) => {
      const $a = $(art);
      const link = localizeUrl($a.find('.post-thumb-img-content a, .entry-title a').first().attr('href') || $a.find('a').first().attr('href'));
      const img = $a.find('.post-thumb-img-content img');
      const excerpt = $a.find('.ast-excerpt-container').html()?.trim();
      const date = $a.find('.published').text().trim();
      const wpId = Number(($a.attr('id') || '').replace('post-', ''));
      return { link, wpId, excerpt, date, image: img.length ? imageOf($, img) : null, articleClass: $a.attr('class') };
    });
  archives.push({
    url: pathOf(p.url),
    type,
    lang,
    title: $('.ast-archive-title').html(),
    description: $('.ast-archive-description').children(':not(h1)').toString() || undefined,
    seo: readSeo($),
    translations: readAlternates($),
    bodyClass: p.bodyClass,
    items,
    pagination: $('.ast-pagination').html()?.trim(),
    noResults: $('.no-results').length > 0,
  });
}

// Excerpts, list dates and archive thumbnails live only in archive listings.
// The cached archive pages of the original were generated at different times and a few
// excerpts differ only by a trailing "[…]"; the version of the main news archive wins.
const MAIN_ARCHIVE = /\/category\/(noticias-es|news)\/(page\/\d+\/)?$/;
const archiveOrder = [...archives].sort((x, y) => Number(MAIN_ARCHIVE.test(y.url)) - Number(MAIN_ARCHIVE.test(x.url)));
for (const a of archiveOrder)
  for (const it of a.items) {
    const rec = out.news.find((n) => n.wpId === it.wpId && n.lang === a.lang) || out.people.find((n) => n.wpId === it.wpId && n.lang === a.lang);
    if (!rec) continue;
    if (it.excerpt && !rec.excerpt) rec.excerpt = it.excerpt;
    if (it.image) rec.listImage = it.image;
  }

// ---------------------------------------------------------------- taxonomies
// Names come from archive titles; slugs from archive URLs.
for (const a of archives) {
  const m = a.url.match(/^\/(es|en)\/(category|tag)\/(?:[\w-]+\/)*?([\w-]+)\/(?:page\/\d+\/)?$/);
  if (!m || /\/page\/\d+\/$/.test(a.url)) continue;
  const tax = m[2] === 'category' ? 'category' : 'post_tag';
  const slug = m[3];
  const parent = m[2] === 'category' ? a.url.split('/').filter(Boolean).slice(2, -1).pop() : undefined;
  const wpId = Number((a.bodyClass.match(new RegExp(`\\b${m[2]}-(\\d+)\\b`)) || [])[1]);
  out.taxonomies[tax][slug] = { slug, lang: m[1], name: a.title, path: a.url, wpId, parent, translations: a.translations, seo: a.seo };
  if (a.description) out.taxonomies[tax][slug].description = a.description;
}

// ---------------------------------------------------------------- write
const used = new Set();
// Fields starting with "__" are migration-time helpers (kept in .cache only).
const stripPrivate = (v) => (Array.isArray(v) ? v.map(stripPrivate) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('__')).map(([k, x]) => [k, stripPrivate(x)])) : v);
function writeRecord(dir, rec) {
  const rel = path.join(dir, rec.lang, `${rec.slug}.json`);
  if (used.has(rel)) throw new Error(`duplicate record ${rel}`);
  used.add(rel);
  writeJson(path.join(DATA, rel), stripPrivate(rec));
  writeJson(path.join(CACHE, 'extract', 'private', rel), rec);
}
// Only the extracted collections are replaced; hand-maintained files (archives.json …) are kept.
for (const d of ['pages', 'news', 'people']) fs.rmSync(path.join(DATA, d), { recursive: true, force: true });
for (const r of out.pages) writeRecord('pages', r);
for (const r of out.news) writeRecord('news', r);
for (const r of out.people) writeRecord('people', r);
writeJson(path.join(DATA, 'taxonomies.json'), out.taxonomies);
writeJson(path.join(DATA, 'authors.json'), authors);
writeJson(path.join(CACHE, 'extract', 'datatables-language.json'), dataTablesLanguage);
writeJson(path.join(CACHE, 'extract', 'archives.json'), archives);
writeJson(path.join(CACHE, 'extract', 'body-classes.json'), bodyClasses);
writeJson(path.join(CACHE, 'extract', 'image-sizes.json'), imageSizes);
writeJson(path.join(CACHE, 'extract', 'report.json'), { typeCounts, skipped: report.skipped, typed: stats.typed, fallback: stats.fallback, mismatches: stats.mismatches });
console.log('page types', typeCounts);
console.log(`pages ${out.pages.length}, news ${out.news.length}, people ${out.people.length}, archives ${archives.length}`);
console.log('typed blocks', stats.typed);
console.log('fallback blocks', stats.fallback);
console.log('person layout mismatches', personMismatches.length);
writeJson(path.join(CACHE, 'extract', 'person-mismatches.json'), personMismatches);
