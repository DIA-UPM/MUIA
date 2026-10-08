// Static site generator: data/*.json + src/templates → dist/
//
//   npm run build            (validates data first; fails on invalid content)
//   DIST_DIR=… npm run build (build into another directory, used by tests)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { loadData } from './lib/data.mjs';
import { validate } from '../validation/validate.mjs';
import { renderBlocks } from './lib/blocks.mjs';
import { renderPersonLayout } from './lib/person.mjs';
import { renderPostGrid } from './lib/postgrid.mjs';
import { headerMenu, footerMenu, ARROW } from './lib/menu.mjs';
import { headTags } from './lib/seo.mjs';
import { buildAssets } from './lib/assets.mjs';
import { decodeEntities, formatDate, paginateLinks, excerptText } from './lib/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.resolve(ROOT, process.env.DIST_DIR || 'dist');
const quiet = process.argv.includes('--quiet');
const log = (...a) => !quiet && console.log(...a);

// ---------------------------------------------------------------- data
// DATA_DIR lets tests build from a temporary copy of the content.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const data = loadData(DATA_DIR);
const problems = validate(data, ROOT, DATA_DIR);
if (problems.length) {
  console.error(`\nContent validation failed (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n`);
  for (const p of problems) console.error(`  ${p.file}\n    ${p.field ? p.field + ': ' : ''}${p.message}\n`);
  process.exit(1);
}
const { site, taxonomies, authors, archives: archiveConfig } = data;

// Where the site is published. SITE_URL (e.g. https://usuario.github.io/repositorio)
// overrides data/site.json → origin; a path in it (/repositorio) is prefixed to every
// internal URL of the output, so the same content works at a domain root or in a
// sub-folder. SITE_NOINDEX=1 asks search engines not to index the copy (for
// temporary/staging deployments).
if (process.env.SITE_URL) site.origin = process.env.SITE_URL;
site.origin = site.origin.replace(/\/+$/, '');
const BASE = new URL(site.origin).pathname.replace(/\/+$/, '');
const NOINDEX = /^(1|true|yes)$/i.test(process.env.SITE_NOINDEX || '');
const withBase = (p) => (BASE && typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? BASE + p : p);
const pages = data.pages;
const news = data.news;
const people = data.people;

// ---------------------------------------------------------------- output folder
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
const assetUrls = buildAssets(ROOT, DIST);

const env = nunjucks.configure(path.join(ROOT, 'src', 'templates'), { autoescape: true, trimBlocks: false, lstripBlocks: false });
const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/js/config/theme.json'), 'utf8'));

// ---------------------------------------------------------------- shared helpers
const byPath = new Map([...pages, ...news, ...people].map((r) => [r.path, r]));
const term = (tax, slug) => taxonomies[tax]?.[slug];
const ctxBase = {
  site,
  authors,
  pages,
  news,
  people,
  term,
  decode: decodeEntities,
  wpIdOfPath: (url) => byPath.get(url.split('#')[0])?.wpId ?? '',
};
const written = [];

function writePage(urlPath, html) {
  const file = path.join(DIST, decodeURIComponent(urlPath), 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.push(urlPath);
}

/** Renders a full page with the base layout. */
function render(template, page, vars) {
  const L = site.languages[page.lang];
  const nav = data.navigation[page.lang];
  const ctx = { ...ctxBase, lang: page.lang, strings: L.strings, homePath: L.home };
  const menuPage = { ...page.menu, homePath: L.home, translations: page.menuTranslations ?? page.translations };
  const menus = {
    'ast-hf-menu-1': headerMenu(nav, menuPage, ctx, { id: 'ast-hf-menu-1', className: 'main-header-menu ast-menu-shadow ast-nav-menu ast-flex  submenu-with-border stack-on-mobile ast-mega-menu-enabled', withId: true }),
    'ast-hf-menu-1-sticky': headerMenu(nav, menuPage, ctx, { id: 'ast-hf-menu-1-sticky', className: 'main-header-menu ast-menu-shadow ast-nav-menu ast-flex  submenu-with-border stack-on-mobile ast-mega-menu-enabled' }),
    'ast-hf-mobile-menu': headerMenu(nav, menuPage, ctx, { id: 'ast-hf-mobile-menu', className: 'main-header-menu ast-nav-menu ast-flex  submenu-with-border astra-menu-animation-fade  stack-on-mobile ast-mega-menu-enabled' }),
    'ast-desktop-toggle-menu': headerMenu(nav, menuPage, ctx, { id: 'ast-desktop-toggle-menu', className: 'main-header-menu ast-nav-menu ast-flex  submenu-with-border astra-menu-animation-fade  stack-on-mobile ast-mega-menu-enabled' }),
  };
  const logo = site.logo;
  const logoHtml = `<a href="${L.home}" class="custom-logo-link" rel="home"${page.isFront ? ' aria-current="page"' : ''}><img fetchpriority="high" width="${logo.width}" height="${logo.height}" src="${logo.src}" class="custom-logo" alt="${L.logoAlt}" decoding="async" srcset="${logo.srcset}" sizes="${logo.sizes}"></a>`;

  const astra = { ...theme.astra, ...theme.i18n[page.lang], site_url: site.origin, infinite_total: String(page.totalPages ?? 0) };
  let inlineConfig = `var astra = ${JSON.stringify(astra)};\nvar astraAddon = ${JSON.stringify(theme.astraAddon)};\nvar eb_conditional_localize = [];`;
  // Strings of the search results page (src/js/site/search.js).
  const s = L.strings;
  inlineConfig += `\nwindow.MUIA_SEARCH = ${JSON.stringify({ index: withBase(`/assets/search/${page.lang}.json`), home: withBase(L.home), title: s.searchResultsTitle, documentTitle: s.searchDocumentTitle, breadcrumbsLabel: s.breadcrumbsLabel, breadcrumbsHome: s.breadcrumbsHome, trail: s.searchResultsTrail, noResults: s.searchNoResults })};`;
  const scripts = [assetUrls.js.main];
  if (page.tables?.length) {
    inlineConfig += `\nwindow.MUIA_TABLES = ${JSON.stringify({ language: site.dataTablesLanguage[page.lang], tables: page.tables })};`;
    scripts.push(assetUrls.js.tables);
  }
  const stylesheets = [assetUrls.css[page.styleContext], ...(page.blockStyles || []).map((s) => assetUrls.blocks[s]), assetUrls.css.site];
  const html = env.render(template, {
    ...vars,
    site,
    L,
    nav,
    menus,
    logoHtml,
    arrow: ARROW,
    footer: data.footer[page.lang],
    footerMenu: (w) => footerMenu(nav, menuPage, ctx, w),
    year: new Date().getFullYear(),
    head: headTags(page, ctx),
    stylesheets,
    scripts,
    inlineConfig,
    bodyClass: page.bodyClass,
  });
  writePage(page.path, html);
}

const layoutClass = (type, rec) => (rec.bodyClass ?? site.layouts[type].bodyClass).replace(/\{id\}/g, rec.wpId);
const otherTranslations = (t) => t || {};

// Content (blocks) of a record, with access to the collections for post grids.
function contentHtml(blocks, lang) {
  const ctx = { ...ctxBase, lang };
  ctx.renderPostGrid = (b) => renderPostGrid(b, ctx);
  return renderBlocks(blocks, ctx);
}

// ---------------------------------------------------------------- pages
for (const rec of pages) {
  const type = rec.isHome ? 'home' : 'page';
  const page = {
    kind: type,
    isFront: !!rec.isHome,
    lang: rec.lang,
    path: rec.path,
    record: rec,
    seo: rec.seo,
    translations: otherTranslations(rec.translations),
    ogType: rec.isHome ? 'website' : 'article',
    breadcrumb: rec.isHome ? [{ name: rec.title }] : [{ name: site.languages[rec.lang].breadcrumbHome ?? 'Portada', path: site.languages[rec.lang].home }, { name: rec.title }],
    bodyClass: layoutClass(type, rec),
    styleContext: 'page',
    blockStyles: rec.stylesheet ? [rec.stylesheet] : [],
    tables: rec.tables,
    menu: { kind: 'page', basePath: rec.path, wpId: rec.wpId, isFront: !!rec.isHome },
  };
  const articleClass = `post-${rec.wpId} page type-page status-publish${rec.hasFeaturedImage ? ' has-post-thumbnail' : ''} ast-article-single`;
  render('pages/page.njk', page, { record: rec, articleClass, content: contentHtml(rec.blocks, rec.lang) });
  // The site root serves the Spanish homepage (x-default), as WordPress did.
  if (rec.isHome && rec.lang === site.defaultLanguage) render('pages/page.njk', { ...page, path: '/', canonicalPath: rec.path, ogUrl: rec.path, schemaId: site.origin + rec.path, menu: { ...page.menu, basePath: '/' } }, { record: rec, articleClass, content: contentHtml(rec.blocks, rec.lang) });
}

// ---------------------------------------------------------------- news
// Newest first; posts published at the same second keep their WordPress id order.
const sortByDate = (list) => [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.wpId - b.wpId));
for (const rec of news) {
  const latest = sortByDate(news.filter((n) => n.lang === rec.lang)).slice(0, 5);
  const articleClass = ['post-' + rec.wpId, 'post', 'type-post', 'status-publish', 'format-standard', rec.featuredImage && 'has-post-thumbnail', 'hentry', ...rec.categories.map((c) => `category-${c}`), ...rec.tags.map((t) => `tag-${t}`), 'ast-article-single'].filter(Boolean).join(' ');
  render(
    'pages/post.njk',
    {
      kind: 'post',
      lang: rec.lang,
      path: rec.path,
      record: rec,
      seo: rec.seo,
      translations: otherTranslations(rec.translations),
      ogType: 'article',
      breadcrumb: [{ name: 'Portada', path: site.languages[rec.lang].home }, { name: rec.title }],
      bodyClass: layoutClass('post', rec),
      styleContext: 'post',
      blockStyles: rec.stylesheet ? [rec.stylesheet] : [],
      menu: { kind: 'post', basePath: rec.path, categoryPaths: rec.categories.map((c) => term('category', c)?.path).filter(Boolean), parentPage: rec.parentPage },
    },
    { record: rec, articleClass, content: contentHtml(rec.blocks, rec.lang), latestPosts: latest },
  );
}

// ---------------------------------------------------------------- people
for (const rec of people) {
  const archive = archiveConfig.people[rec.lang];
  const bio = contentHtml(rec.biography, rec.lang);
  let content = renderPersonLayout(rec, bio);
  if (rec.afterProfile) content += `\n${contentHtml(rec.afterProfile, rec.lang)}`;
  const articleClass = ['post-' + rec.wpId, 'personal', 'type-personal', 'status-publish', 'has-post-thumbnail', 'hentry', ...rec.tags.map((t) => `tag-${t}`), 'ast-article-single'].join(' ');
  render(
    'pages/person.njk',
    {
      kind: 'person',
      lang: rec.lang,
      path: rec.path,
      record: rec,
      seo: rec.seo,
      translations: otherTranslations(rec.translations),
      ogType: 'article',
      breadcrumb: [{ name: 'Portada', path: site.languages[rec.lang].home }, { name: archive.title, path: archive.path }, { name: rec.name }],
      bodyClass: layoutClass('person', rec),
      styleContext: 'person',
      blockStyles: rec.styleVariant === 'none' ? [] : [`blocks/people/${rec.styleVariant ?? 'default'}.css`],
      menu: { kind: 'person', basePath: rec.path },
    },
    { record: rec, articleClass, content },
  );
}

// ---------------------------------------------------------------- archives
const perPage = archiveConfig.perPage;
const firstImage = (items) => {
  const img = items.find((r) => r.listImage)?.listImage;
  return img && { src: img.src, width: img.width, height: img.height, caption: img.alt || undefined };
};
function renderArchive({ kind, lang, basePath, items, title, description, seoTitle, styleContext, menuKind, translations, menuTranslations, bodyTokens, breadcrumbName, extraHead }) {
  const total = Math.max(1, Math.ceil(items.length / perPage));
  const L = site.languages[lang];
  for (let n = 1; n <= total; n++) {
    const pagePath = n === 1 ? basePath : `${basePath}page/${n}/`;
    const slice = items.slice((n - 1) * perPage, n * perPage);
    const pageLabel = archiveConfig.pageLabel[lang].replace('{n}', n).replace('{total}', total);
    const fullTitle = kind === 'author' ? (n > 1 ? `${seoTitle} - ${pageLabel}` : seoTitle) : n > 1 ? `${seoTitle} - ${pageLabel} - ${site.name}` : `${seoTitle} - ${site.name}`;
    const hasItems = slice.length > 0;
    const container = kind === 'person-archive' || !hasItems ? 'ast-separate-container ast-two-container' : 'ast-plain-container';
    const bodyClass = [
      'archive',
      n > 1 && 'paged',
      ...bodyTokens,
      'wp-custom-logo',
      n > 1 && `paged-${n}`,
      n > 1 && `${kind === 'person-archive' ? 'post-type' : kind === 'category' ? 'category' : kind === 'tag' ? 'tag' : 'author'}-paged-${n}`,
      'ehf-template-astra ehf-stylesheet-astra-child ast-desktop',
      container,
      'ast-no-sidebar astra-4.8.6 group-blog ast-inherit-site-logo-transparent ast-hfb-header',
      hasItems && 'blog-masonry',
      'ast-blog-grid-3 ast-blog-layout-4 ast-pagination-default ast-full-width-layout ast-sticky-main-shrink ast-sticky-below-shrink ast-sticky-header-shrink ast-inherit-site-logo-sticky ast-primary-sticky-enabled elementor-default',
      hasItems && 'elementor-kit-',
      'astra-addon-4.8.6',
    ]
      .filter(Boolean)
      .join(' ');
    const cards = slice.map((rec) => {
      const isPerson = !!rec.name;
      const image = rec.listImage ?? null;
      const articleClass = [
        'post-' + rec.wpId,
        isPerson ? 'personal type-personal' : 'post type-post',
        'status-publish',
        !isPerson && 'format-standard',
        image && 'has-post-thumbnail',
        'hentry',
        ...(rec.categories || []).map((c) => `category-${c}`),
        ...(rec.tags || []).map((t) => `tag-${t}`),
        'ast-grid-common-col ast-full-width ast-article-post remove-featured-img-padding ast-width-md-4 ast-archive-post ast-separate-posts',
      ]
        .filter(Boolean)
        .join(' ');
      return { record: rec, image, articleClass, date: formatDate(rec.date, lang) };
    });
    const page = {
      kind,
      lang,
      path: pagePath,
      // Yoast used the image of the first listed item as the page's primary image.
      seo: { title: fullTitle, schemaImage: firstImage(slice) },
      translations,
      menuTranslations,
      alternates: n === 1,
      ogType: kind === 'author' ? 'profile' : kind === 'person-archive' ? 'website' : 'article',
      ogUrl: basePath,
      schemaId: kind === 'category' || kind === 'tag' || kind === 'person-archive' ? site.origin + basePath : undefined,
      prev: n > 1 ? (n === 2 ? basePath : `${basePath}page/${n - 1}/`) : undefined,
      next: n < total ? `${basePath}page/${n + 1}/` : undefined,
      breadcrumb: [{ name: 'Portada', path: L.home }, { name: breadcrumbName }],
      bodyClass,
      styleContext,
      totalPages: total,
      authorName: kind === 'author' ? 'admin' : undefined,
      menu: { kind: menuKind, basePath },
    };
    if (extraHead?.seo) page.seo = { ...page.seo, ...extraHead.seo, title: fullTitle };
    render('pages/archive.njk', page, {
      archive: { title, description, kind, sectionClass: kind === 'author' ? 'ast-archive-description ast-author-box' : 'ast-archive-description' },
      items: cards,
      pagination: total > 1 ? paginateLinks(n, total, basePath, L.strings) : '',
    });
  }
}

const postsOf = (lang, pred) => sortByDate(news.filter((r) => r.lang === lang && pred(r)));
const descendantCategories = (slug) => [slug, ...Object.values(taxonomies.category).filter((t) => t.parent === slug).flatMap((t) => descendantCategories(t.slug))];

for (const t of Object.values(taxonomies.category)) {
  const cats = descendantCategories(t.slug);
  renderArchive({
    kind: 'category',
    lang: t.lang,
    basePath: t.path,
    items: postsOf(t.lang, (r) => r.categories.some((c) => cats.includes(c))),
    title: t.name,
    seoTitle: `${decodeEntities(t.name)} archivos`,
    styleContext: t.themeStyle ?? 'category',
    menuKind: 'category',
    translations: t.translations,
    bodyTokens: ['category', `category-${t.slug}`, `category-${t.wpId}`],
    breadcrumbName: t.name,
  });
}
for (const t of Object.values(taxonomies.post_tag)) {
  renderArchive({
    kind: 'tag',
    lang: t.lang,
    basePath: t.path,
    items: postsOf(t.lang, (r) => r.tags.includes(t.slug)),
    title: t.name,
    seoTitle: `${decodeEntities(t.name)} archivos`,
    styleContext: t.themeStyle ?? 'tag',
    menuKind: 'tag',
    translations: t.translations,
    bodyTokens: ['tag', `tag-${t.slug}`, `tag-${t.wpId}`],
    breadcrumbName: t.name,
  });
}
for (const [lang, a] of Object.entries(archiveConfig.people)) {
  renderArchive({
    kind: 'person-archive',
    lang,
    basePath: a.path,
    items: sortByDate(people.filter((r) => r.lang === lang)),
    title: a.title,
    description: a.description,
    seoTitle: a.seoTitle,
    styleContext: 'person-archive',
    menuKind: 'archive',
    translations: { [lang]: a.path, [lang === 'es' ? 'en' : 'es']: a.translationPath },
    bodyTokens: ['post-type-archive', 'post-type-archive-personal'],
    breadcrumbName: a.title,
  });
}
for (const author of archiveConfig.authors) {
  for (const lang of Object.keys(site.languages)) {
    const a = author[lang];
    renderArchive({
      kind: 'author',
      lang,
      basePath: `/${lang}/author/${author.slug}/`,
      items: postsOf(lang, (r) => r.author === author.name),
      title: a.heading,
      description: `<div class="ast-author-bio">\n<h1 class="page-title ast-archive-title">${a.heading}</h1>\n<p></p>\n</div><div class="ast-author-avatar">\n<img alt="" src="${author.avatar.src}" srcset="${author.avatar.srcset}" class="avatar avatar-120 photo" height="120" width="120" decoding="async">					</div>`,
      seoTitle: a.seoTitle,
      styleContext: 'author',
      menuKind: 'author',
      translations: {},
      menuTranslations: a.switchTo ? { [lang]: `/${lang}/author/${author.slug}/`, [a.switchTo.lang]: a.switchTo.path } : {},
      bodyTokens: ['author', `author-${author.slug}`, `author-${author.wpId}`],
      breadcrumbName: a.breadcrumb,
      extraHead: { seo: { image: { src: author.ogImage } } },
    });
  }
}

// ---------------------------------------------------------------- search index
for (const lang of Object.keys(site.languages)) {
  const docs = [...pages, ...news, ...people]
    .filter((r) => r.lang === lang)
    .map((r) => {
      const text = excerptText(r, (blocks) => contentHtml(blocks, lang));
      // WordPress' automatic excerpt: first 20 words + " […]".
      const words = text.split(' ');
      const auto = words.length > 20 ? `${words.slice(0, 20).join(' ')} […]` : text;
      return {
        url: withBase(r.path),
        title: decodeEntities((r.title ?? r.name).replace(/<[^>]+>/g, '')),
        excerpt: decodeEntities((r.excerpt ?? '').replace(/<[^>]+>/g, '')).trim() || auto,
        date: r.date,
        dateText: formatDate(r.date, lang),
        image: withBase(r.listImage?.src ?? r.featuredImage?.src),
        text,
      };
    });
  const file = path.join(DIST, 'assets', 'search', `${lang}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(docs));
}

// ---------------------------------------------------------------- 404, redirects, sitemaps, robots
{
  const nf = site.notFound;
  const L = site.languages[nf.lang];
  render(
    'pages/404.njk',
    {
      kind: '404',
      lang: nf.lang,
      path: '/404/',
      seo: { title: nf.title, robots: 'noindex, follow' },
      translations: {},
      breadcrumb: [{ name: 'Portada', path: L.home }, { name: nf.title }],
      bodyClass: nf.bodyClass,
      styleContext: 'page',
      menu: { kind: '404', basePath: '/404/' },
    },
    { notFound: nf },
  );
  fs.renameSync(path.join(DIST, '404', 'index.html'), path.join(DIST, '404.html'));
  fs.rmSync(path.join(DIST, '404'), { recursive: true });
  written.splice(written.indexOf('/404/'), 1);
}

for (const r of data.redirects) {
  const html = `<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n<title>Redirecting…</title>\n<link rel="canonical" href="${site.origin}${r.to}">\n<meta name="robots" content="noindex">\n<meta http-equiv="refresh" content="0; url=${withBase(r.to)}">\n</head>\n<body>\n<p><a href="${r.to}">${r.to}</a></p>\n<script>location.replace(${JSON.stringify(withBase(r.to))} + location.hash);</script>\n</body>\n</html>\n`;
  const file = path.join(DIST, r.from, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

{
  const sitemap = (urls) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `\t<url>\n\t\t<loc>${site.origin}${u.path}</loc>${u.lastmod ? `\n\t\t<lastmod>${u.lastmod}</lastmod>` : ''}\n\t</url>`).join('\n')}\n</urlset>\n`;
  const maps = {
    'post-sitemap.xml': news.map((r) => ({ path: r.path, lastmod: r.modified })),
    'page-sitemap.xml': pages.map((r) => ({ path: r.path, lastmod: r.modified })),
    'personal-sitemap.xml': [...Object.values(archiveConfig.people).map((a) => ({ path: a.path })), ...people.map((r) => ({ path: r.path, lastmod: r.modified }))],
    'category-sitemap.xml': Object.values(taxonomies.category).map((t) => ({ path: t.path })),
    'post_tag-sitemap.xml': Object.values(taxonomies.post_tag).map((t) => ({ path: t.path })),
  };
  for (const [name, urls] of Object.entries(maps)) fs.writeFileSync(path.join(DIST, name), sitemap(urls));
  fs.writeFileSync(
    path.join(DIST, 'sitemap_index.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(maps).map((n) => `\t<sitemap>\n\t\t<loc>${site.origin}/${n}</loc>\n\t</sitemap>`).join('\n')}\n</sitemapindex>\n`,
  );
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nDisallow:\n\nSitemap: ${site.origin}/sitemap_index.xml\n`);
}

// ---------------------------------------------------------------- publishing location
// Sub-folder deployments (e.g. GitHub Pages project sites): prefix the internal
// root-relative URLs ("/es/…", "/assets/…") of every HTML and CSS file.
if (BASE || NOINDEX) {
  const prefixHtml = (html) =>
    html
      .replace(/\b(href|src|action|poster|content|data-[\w-]+)=(["'])\/(?!\/)/g, `$1=$2${BASE}/`)
      .replace(/\b(srcset)=(["'])([^"']*)\2/g, (all, a, q, v) => `${a}=${q}${v.split(',').map((part) => part.replace(/^(\s*)\/(?!\/)/, `$1${BASE}/`)).join(',')}${q}`)
      .replace(/url\((['"]?|&quot;)\/(?!\/)/g, `url($1${BASE}/`);
  const prefixCss = (css) => css.replace(/url\((\s*['"]?)\/(?!\/)/g, `url($1${BASE}/`);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) {
        let html = fs.readFileSync(p, 'utf8');
        if (BASE) html = prefixHtml(html);
        if (NOINDEX) html = html.replace(/<meta name="robots" content="[^"]*">/g, '<meta name="robots" content="noindex, nofollow">');
        fs.writeFileSync(p, html);
      } else if (BASE && e.name.endsWith('.css')) fs.writeFileSync(p, prefixCss(fs.readFileSync(p, 'utf8')));
    }
  };
  walk(DIST);
  if (NOINDEX) fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
}
// GitHub Pages: publish the files as they are (no Jekyll processing).
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

fs.writeFileSync(path.join(DIST, 'build-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), siteUrl: site.origin, basePath: BASE, noindex: NOINDEX, pages: written.sort() }, null, 1));
log(`Built ${written.length} pages into ${path.relative(ROOT, DIST) || '.'}`);
