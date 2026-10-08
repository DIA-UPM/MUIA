// Phase 4b: extract the site-wide content (settings, navigation menus, header,
// footer widgets) and the per-page block stylesheets.
//
//   node scripts/crawl/extract-site.mjs --force
//
// Like extract.mjs this is a one-off migration tool; it must run after it.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import postcss from 'postcss';
import safeParser from 'postcss-safe-parser';
import { CACHE, ROOT, ORIGIN, sha, readJson, writeJson, ensureDir } from './lib.mjs';
import { localizeHtml, localizeUrl, localPath } from './urlmap.mjs';

const DATA = path.join(ROOT, 'data');
const SRC_CSS = path.join(ROOT, 'src', 'css');
const load = (url) => cheerio.load(fs.readFileSync(path.join(CACHE, 'http', sha(url) + '.bin'), 'utf8'), { decodeEntities: false });
const assets = readJson(path.join(CACHE, 'assets.json'), []);
const bodyClasses = readJson(path.join(CACHE, 'extract', 'body-classes.json'), {});

const HOMES = { es: `${ORIGIN}/es/`, en: `${ORIGIN}/en/` };

// ---------------------------------------------------------------- navigation
function readMenu($, ul) {
  return $(ul)
    .children('li')
    .toArray()
    .filter((li) => !$(li).hasClass('lang-item'))
    .map((li) => {
      const $li = $(li);
      const c = $li.attr('class');
      const a = $li.children('a');
      const item = {
        id: Number(c.match(/\bmenu-item-(\d+)\b/)[1]),
        label: a.find('.menu-text').length ? a.find('.menu-text').first().html() : a.html(),
        url: localizeUrl(a.attr('href')),
        kind: c.match(/\bmenu-item-type-(\w+)/)[1] === 'post_type' ? 'page' : c.match(/\bmenu-item-object-(\w+)/)[1],
      };
      const sub = $li.children('ul.sub-menu');
      if (sub.length) item.children = readMenu($, sub);
      return item;
    });
}

const site = {
  name: 'Máster Universitario en Inteligencia Artificial',
  origin: ORIGIN,
  defaultLanguage: 'es',
  languages: {},
  logo: null,
  favicon: '/wp-content/uploads/sites/6/2023/12/logo-dia-actualizado.svg',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  layouts: {},
};

for (const [lang, url] of Object.entries(HOMES)) {
  const $ = load(url);
  const ul = $('#ast-hf-menu-1');
  const langItem = ul.children('li.lang-item');
  const navigation = {
    lang,
    ariaLabel: $('#primary-site-navigation-desktop').attr('aria-label'),
    items: readMenu($, ul),
    languageSwitcher: {
      targetLang: langItem.attr('class').match(/lang-item-(es|en)\b/)[1],
      itemId: langItem.attr('class').match(/menu-item-(\d+-\w+)/)[1],
      termId: Number(langItem.attr('class').match(/lang-item-(\d+)/)[1]),
      hreflang: langItem.children('a').attr('hreflang'),
      label: langItem.find('img').attr('alt'),
      flag: langItem.find('img').attr('src'),
    },
  };
  writeJson(path.join(DATA, 'navigation', `${lang}.json`), navigation);

  const logo = $('#ast-desktop-header .custom-logo');
  site.logo = {
    src: localizeUrl(logo.attr('src'), { resource: true }),
    width: Number(logo.attr('width')),
    height: Number(logo.attr('height')),
    srcset: localizeHtml(`srcset="${logo.attr('srcset')}"`).slice(8, -1),
    sizes: logo.attr('sizes'),
  };
  site.languages[lang] = {
    locale: $('html').attr('lang'),
    hreflang: lang,
    ogLocale: { es: 'es_ES', en: 'en_US' }[lang],
    home: `/${lang}/`,
    logoAlt: logo.attr('alt'),
    // Header strings (screen-reader texts etc.) as published by the theme.
    strings: {
      skipLink: $('.skip-link').text().trim(),
      skipLinkTitle: $('.skip-link').attr('title'),
      menuToggle: $('#ast-desktop-header .ast-menu-toggle .screen-reader-text').first().text(),
      dropdownToggle: $('#ast-desktop-header .dropdown-menu-toggle').first().attr('aria-label'),
      mainMenu: $('.menu-toggle .screen-reader-text').first().text(),
      closeMenu: $('#menu-toggle-close').attr('aria-label'),
      scrollTop: $('#ast-scroll-top .screen-reader-text').text(),
      feedTitle: $('link[type="application/rss+xml"]').first().attr('title'),
      commentsFeedTitle: $('link[type="application/rss+xml"]').eq(1).attr('title'),
      paginationLabel: null,
      next: null,
      previous: null,
      noResults: null,
      searchLabel: null,
      searchPlaceholder: null,
      searchSubmit: null,
    },
    headerHtml: $('#ast-desktop-header .ast-header-html-1 .ast-builder-html-element').html().trim(),
  };

  // Footer: widget areas in display order. Widgets are stored as HTML except the
  // navigation-menu widget, which is generated from navigation/<lang>.json.
  const columns = $('footer#colophon .site-primary-footer-inner-wrap > .site-footer-section')
    .toArray()
    .map((sec) => {
      const aside = $(sec).children('aside');
      return {
        section: $(sec).attr('class').match(/site-footer-primary-section-(\d)/)[1],
        area: aside.attr('data-section'),
        label: aside.attr('aria-label'),
        widgets: aside
          .children('section')
          .toArray()
          .map((w) => {
            const $w = $(w);
            const base = { id: $w.attr('id'), class: $w.attr('class') };
            if ($w.hasClass('widget_nav_menu'))
              return {
                ...base,
                type: 'menu',
                title: $w.find('.widget-title').html(),
                navLabel: $w.find('nav').attr('aria-label'),
                containerClass: $w.find('nav').attr('class'),
                menuId: $w.find('nav > ul').attr('id'),
              };
            return { ...base, type: 'html', html: localizeHtml($w.html().trim()) };
          }),
      };
    });
  const copyright = $('.ast-footer-copyright .ast-footer-copyright').length ? $('.ast-footer-copyright .ast-footer-copyright') : $('.ast-footer-copyright').last();
  writeJson(path.join(DATA, 'footer', `${lang}.json`), {
    lang,
    columns,
    // {year} is replaced with the current year at build time (WordPress [current_year]).
    copyright: copyright.html().trim().replace(/Copyright © \d{4}/, 'Copyright © {year}'),
  });
}

// Strings that only appear on specific page types.
{
  const pick = (url, fn) => fn(load(url));
  for (const [lang, archive] of Object.entries({ es: `${ORIGIN}/es/category/noticias-es/`, en: `${ORIGIN}/en/personal/` })) {
    pick(archive, ($) => {
      const s = site.languages[lang].strings;
      s.paginationLabel = $('.ast-pagination nav').attr('aria-label');
      s.next = $('.ast-pagination .next').html()?.trim();
    });
  }
  pick(`${ORIGIN}/es/category/noticias-es/page/2/`, ($) => (site.languages.es.strings.previous = $('.ast-pagination .prev').html()?.trim()));
  pick(`${ORIGIN}/en/personal/page/2/`, ($) => (site.languages.en.strings.previous = $('.ast-pagination .prev').html()?.trim()));
  for (const [lang, url] of Object.entries({ es: `${ORIGIN}/es/tag/catedraticos-de-universidad/`, en: `${ORIGIN}/en/tag/professors/` }))
    pick(url, ($) => {
      const s = site.languages[lang].strings;
      s.noResults = $('.no-results .page-content p').html();
      s.searchLabel = $('.search-form .screen-reader-text').text();
      s.searchPlaceholder = $('.search-form input.search-field').attr('placeholder');
      s.searchSubmit = $('.search-form input[type=submit]').attr('value');
      s.searchButton = $('.search-form button').attr('aria-label');
      s.searchHidden = $('.search-form button span[hidden]').text();
    });
}

// Search results and 404 pages (fetched once from the original site).
for (const lang of ['es', 'en']) {
  const s = site.languages[lang].strings;
  const $r = load(`${ORIGIN}/${lang}/?s=zzzqqq`);
  s.searchResultsTitle = $r('.ast-archive-title').contents().first().text();
  s.searchDocumentTitle = $r('title').text().replace('zzzqqq', '{query}');
  s.breadcrumbsLabel = $r('.breadcrumb-trail').attr('aria-label');
  s.breadcrumbsHome = $r('.trail-begin span').text();
  s.searchResultsTrail = $r('.trail-end span span').text().replace('zzzqqq', '').trim() + ' ';
  s.searchNoResults = $r('.no-results .page-content p').html();
  site.layouts.search = { bodyClass: $r('body').attr('class').replace('search-no-results', '{results}') };
}
{
  const $e = load(`${ORIGIN}/es/esta-pagina-no-existe/`);
  site.notFound = {
    lang: 'es',
    title: $e('title').text(),
    heading: $e('.error-404 .page-title').html(),
    subtitle: $e('.error-404 .page-sub-title').html().trim(),
    bodyClass: $e('body').attr('class'),
  };
}

// Body classes: the most common variant per page type becomes the default; records keep
// their own value only when it differs.
for (const [type, variants] of Object.entries(bodyClasses)) {
  site.layouts[type] = { bodyClass: Object.entries(variants).sort((a, b) => b[1] - a[1])[0][0] };
}
for (const dir of ['pages', 'news', 'people'])
  for (const lang of ['es', 'en'])
    for (const f of fs.readdirSync(path.join(DATA, dir, lang))) {
      const file = path.join(DATA, dir, lang, f);
      const rec = readJson(file);
      const type = dir === 'pages' ? (rec.isHome ? 'home' : 'page') : dir === 'news' ? 'post' : 'person';
      if (rec.bodyClass === site.layouts[type].bodyClass) delete rec.bodyClass;
      writeJson(file, rec);
    }

// ---------------------------------------------------------------- per-page block CSS
// Essential Blocks writes one stylesheet per post (eb-style-<id>.min.css) keyed on the
// block ids. Admin/editor-only rules are dropped.
function cleanBlockCss(css) {
  // Browser-tolerant parser: some generated stylesheets contain syntax errors.
  const root = safeParser(css);
  root.walkRules((r) => {
    const sel = r.selectors.filter((s) => !/\.wp-admin\b|\.editor-styles-wrapper\b|\.block-editor/.test(s));
    if (!sel.length) r.remove();
    else r.selectors = sel;
  });
  root.walkAtRules((a) => {
    if (!a.nodes?.length) a.remove();
  });
  root.walkComments((c) => c.remove());
  // Background images: local copies instead of the original server / Templately CDN.
  const out = root.toString().trim().replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, u) => {
    const lp = /^data:/.test(u) ? null : localPath(new URL(u, ORIGIN + '/').toString());
    return lp ? `url(${q}${lp}${q})` : all;
  });
  return out + '\n';
}
const ebCss = (id) => {
  const rec = assets.find((r) => new RegExp(`/eb-style/eb-style-${id}\\.min\\.css`).test(r.url) && r.status === 200);
  return rec ? fs.readFileSync(path.join(CACHE, 'http', sha(rec.url) + '.bin'), 'utf8') : null;
};
const inlineBlockSupportCss = (url) => load(url)('#core-block-supports-inline-css').html() || '';

fs.rmSync(path.join(SRC_CSS, 'blocks'), { recursive: true, force: true });
ensureDir(path.join(SRC_CSS, 'blocks'));

// Pages and news: one stylesheet per record (only when it has block styles).
for (const dir of ['pages', 'news'])
  for (const lang of ['es', 'en'])
    for (const f of fs.readdirSync(path.join(DATA, dir, lang))) {
      const file = path.join(DATA, dir, lang, f);
      const rec = readJson(file);
      let css = ebCss(rec.wpId) || '';
      css += inlineBlockSupportCss(ORIGIN + rec.path);
      if (!css.trim()) continue;
      const name = `${dir}/${lang}-${rec.slug}.css`;
      ensureDir(path.join(SRC_CSS, 'blocks', dir));
      fs.writeFileSync(path.join(SRC_CSS, 'blocks', name), cleanBlockCss(css));
      rec.stylesheet = `blocks/${name}`;
      writeJson(file, rec);
    }

// People share one layout (same block ids); a few profiles were saved with
// different block settings, so identical stylesheets are grouped into variants.
const declSet = (css) => {
  const set = [];
  safeParser(css).walkDecls((d) => {
    let p = d.parent;
    const ctx = [];
    while (p && p.type !== 'root') {
      ctx.unshift(p.type === 'atrule' ? `@${p.name} ${p.params}` : p.selector.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ','));
      p = p.parent;
    }
    set.push(`${ctx.join('/')}::${d.prop}:${d.value.replace(/\s+/g, ' ')}${d.important ? '!' : ''}`);
  });
  return [...new Set(set)].sort().join('\n');
};
const variants = new Map();
for (const lang of ['es', 'en'])
  for (const f of fs.readdirSync(path.join(DATA, 'people', lang))) {
    const file = path.join(DATA, 'people', lang, f);
    const rec = readJson(file);
    // A few profiles load no block stylesheet at all on the original site.
    const css = ebCss(rec.wpId);
    const key = css ? declSet(css) : '__none__';
    if (!variants.has(key)) variants.set(key, { css, records: [] });
    variants.get(key).records.push(file);
  }
const sorted = [...variants.values()].sort((a, b) => b.records.length - a.records.length);
ensureDir(path.join(SRC_CSS, 'blocks', 'people'));
let n = 0;
sorted.forEach((v, i) => {
  const name = !v.css ? 'none' : i === 0 ? 'default' : `variant-${++n}`;
  if (v.css) fs.writeFileSync(path.join(SRC_CSS, 'blocks', 'people', `${name}.css`), cleanBlockCss(v.css));
  for (const file of v.records) {
    const rec = readJson(file);
    if (i > 0) rec.styleVariant = name;
    else delete rec.styleVariant;
    writeJson(file, rec);
  }
  console.log(`people style ${name}: ${v.records.length} records`);
});

// Astra prints a context stylesheet per archive; the terms whose stylesheet differs
// from the default of their taxonomy record the variant (see scripts/build/lib/assets.mjs).
{
  const sha1Of = (url) => assets.find((a) => a.status === 200 && a.url.split('?')[0] === url)?.sha1;
  const variants = {
    category: sha1Of(`${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-category-311.css`),
    'category-news': sha1Of(`${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-category-1.css`),
    tag: sha1Of(`${ORIGIN}/wp-content/uploads/sites/6/astra/astra-theme-dynamic-css-tag-291.css`),
  };
  const taxFile = path.join(DATA, 'taxonomies.json');
  const tax = readJson(taxFile);
  for (const [kind, terms] of Object.entries(tax))
    for (const t of Object.values(terms)) {
      const html = fs.readFileSync(path.join(CACHE, 'http', sha(ORIGIN + t.path) + '.bin'), 'utf8');
      const href = (html.match(/href=['"]([^'"]*astra-theme-dynamic-css-[^'"]+)['"]/) || [])[1];
      const h = href && sha1Of(href.replace(/^\/\//, 'https://').split('?')[0]);
      const name = Object.entries(variants).find(([, v]) => v === h)?.[0];
      const def = kind === 'category' ? 'category' : 'tag';
      if (name && name !== def) t.themeStyle = name;
      else delete t.themeStyle;
    }
  writeJson(taxFile, tax);
}

// DataTables translations used by the TablePress tables (keyed by language).
const dtl = readJson(path.join(CACHE, 'extract', 'datatables-language.json'), {});
site.dataTablesLanguage = { es: dtl.es_ES || {}, en: dtl.en_US || {} };

writeJson(path.join(DATA, 'site.json'), site);
console.log('site.json, navigation/*.json, footer/*.json and block stylesheets written');
