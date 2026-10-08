// <head> metadata: title, description, canonical, hreflang, Open Graph, Twitter
// and the schema.org graph – regenerated from the record fields in the same
// form the Yoast SEO plugin produced on the original site.
import { esc } from './html.mjs';

const meta = (k, v, attr = 'property') => (v === undefined || v === null ? '' : `<meta ${attr}="${k}" content="${esc(v)}">\n`);

/**
 * page: {
 *   kind: 'home'|'page'|'post'|'person'|'person-archive'|'category'|'tag'|'author',
 *   path, canonicalPath, lang, seo, record?, translations, prev?, next?, ogType, image?
 * }
 */
export function headTags(page, ctx) {
  const { site } = ctx;
  const L = site.languages[page.lang];
  const abs = (p) => (p && p.startsWith('/') ? site.origin + p : p);
  const seo = page.seo || {};
  const title = seo.title;
  const others = Object.entries(page.translations || {}).filter(([l]) => l !== page.lang);
  let h = '';
  h += `<meta name="robots" content="${esc(seo.robots ?? site.robots)}">\n`;
  if (others.length && page.alternates !== false) {
    // Polylang prints the alternates in language order (en, es).
    for (const [l, p] of Object.entries(page.translations).sort(([a], [b]) => (a < b ? -1 : 1))) h += `<link rel="alternate" href="${esc(abs(p))}" hreflang="${l}">\n`;
    if (page.isFront) h += `<link rel="alternate" href="${esc(site.origin)}/" hreflang="x-default">\n`;
  }
  h += `<title>${esc(title)}</title>\n`;
  h += meta('description', seo.description, 'name');
  h += `<link rel="canonical" href="${esc(abs(page.canonicalPath ?? page.path))}">\n`;
  if (page.prev) h += `<link rel="prev" href="${esc(abs(page.prev))}">\n`;
  if (page.next) h += `<link rel="next" href="${esc(abs(page.next))}">\n`;
  h += meta('og:locale', L.ogLocale);
  if (others.length) for (const [l] of others) h += meta('og:locale:alternate', site.languages[l].ogLocale);
  if (page.ogType) h += meta('og:type', page.ogType);
  h += meta('og:title', seo.ogTitle ?? title);
  h += meta('og:description', seo.ogDescription ?? seo.description);
  h += meta('og:url', abs(page.ogUrl ?? page.path));
  h += meta('og:site_name', site.name);
  const rec = page.record;
  if (page.kind === 'post' && rec?.date) h += meta('article:published_time', rec.date);
  if (['home', 'page', 'post', 'person'].includes(page.kind) && rec?.modified) h += meta('article:modified_time', rec.modified);
  if (seo.image) {
    h += meta('og:image', abs(seo.image.src));
    if (seo.image.width) h += meta('og:image:width', seo.image.width);
    if (seo.image.height) h += meta('og:image:height', seo.image.height);
    if (seo.image.type) h += meta('og:image:type', seo.image.type);
  }
  if (page.kind === 'post' && rec?.author) h += meta('author', rec.author, 'name');
  h += meta('twitter:card', 'summary_large_image', 'name');
  for (const [k, v] of Object.entries(seo.twitter || {})) h += meta(k, v, 'name');
  h += `<script type="application/ld+json" class="yoast-schema-graph">${JSON.stringify(schemaGraph(page, ctx))}</script>\n`;
  for (const s of seo.extraSchema || []) h += `<script type="application/ld+json">${s}</script>\n`;
  return h;
}

function schemaGraph(page, ctx) {
  const { site } = ctx;
  const L = site.languages[page.lang];
  const home = site.origin + L.home;
  const url = site.origin + (page.canonicalPath ?? page.path);
  const inLanguage = page.lang === 'en' ? 'en-US' : 'es';
  const seo = page.seo || {};
  const rec = page.record || {};
  const img = seo.schemaImage;
  const g = [];
  const mainType = { home: 'WebPage', page: 'WebPage', post: 'WebPage', person: 'WebPage', author: 'ProfilePage' }[page.kind] || 'CollectionPage';
  if (page.kind === 'post') {
    const author = ctx.authors[rec.author];
    g.push({
      '@type': 'Article',
      '@id': `${url}#article`,
      isPartOf: { '@id': url },
      author: author ? { name: author.name, '@id': `${home}#/schema/person/${author.schemaId}` } : undefined,
      headline: rec.title,
      datePublished: rec.date,
      dateModified: rec.modified,
      mainEntityOfPage: { '@id': url },
      wordCount: rec.wordCount,
      publisher: { '@id': `${home}#organization` },
      image: img ? { '@id': `${url}#primaryimage` } : undefined,
      thumbnailUrl: img ? site.origin + img.src : undefined,
      articleSection: (rec.categories || []).map((c) => ctx.term('category', c)?.name).filter(Boolean),
      inLanguage,
    });
  }
  const webPage = {
    '@type': mainType,
    '@id': page.schemaId ?? url,
    url: site.origin + page.path,
    name: seo.title,
    isPartOf: { '@id': `${home}#website` },
    about: page.isFront ? { '@id': `${home}#organization` } : undefined,
    primaryImageOfPage: img ? { '@id': `${site.origin + page.path}#primaryimage` } : undefined,
    image: img ? { '@id': `${site.origin + page.path}#primaryimage` } : undefined,
    thumbnailUrl: img ? site.origin + img.src : undefined,
    datePublished: ['home', 'page', 'post', 'person'].includes(page.kind) ? rec.date : undefined,
    dateModified: ['home', 'page', 'post', 'person'].includes(page.kind) ? rec.modified : undefined,
    description: seo.description,
    breadcrumb: { '@id': `${site.origin + page.path}#breadcrumb` },
    inLanguage,
    potentialAction: ['home', 'page', 'post', 'person', 'author'].includes(page.kind) ? [{ '@type': 'ReadAction', target: [site.origin + page.path] }] : undefined,
  };
  g.push(webPage);
  if (img) {
    g.push({
      '@type': 'ImageObject',
      inLanguage,
      '@id': `${site.origin + page.path}#primaryimage`,
      url: site.origin + img.src,
      contentUrl: site.origin + img.src,
      width: img.width,
      height: img.height,
      caption: img.caption,
    });
  }
  g.push({
    '@type': 'BreadcrumbList',
    '@id': `${site.origin + page.path}#breadcrumb`,
    itemListElement: (page.breadcrumb || []).map((c, i, all) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: i < all.length - 1 ? site.origin + c.path : undefined })),
  });
  g.push({
    '@type': 'WebSite',
    '@id': `${home}#website`,
    url: home,
    name: site.name,
    description: '',
    publisher: { '@id': `${home}#organization` },
    potentialAction: [{ '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${home}?s={search_term_string}` }, 'query-input': { '@type': 'PropertyValueSpecification', valueRequired: true, valueName: 'search_term_string' } }],
    inLanguage,
  });
  g.push({
    '@type': 'Organization',
    '@id': `${home}#organization`,
    name: site.name,
    url: home,
    logo: { '@type': 'ImageObject', inLanguage, '@id': `${home}#/schema/logo/image/`, url: site.origin + site.logo.src, contentUrl: site.origin + site.logo.src, width: site.logo.width, height: site.logo.height, caption: site.name },
    image: { '@id': `${home}#/schema/logo/image/` },
  });
  const personName = page.kind === 'post' ? rec.author : page.kind === 'author' ? page.authorName : null;
  const person = personName && ctx.authors[personName];
  if (person)
    g.push({
      '@type': 'Person',
      '@id': `${home}#/schema/person/${person.schemaId}`,
      name: person.name,
      image: { '@type': 'ImageObject', inLanguage, '@id': `${home}#/schema/person/image/`, url: person.avatar, contentUrl: person.avatar, caption: person.name },
      sameAs: person.sameAs,
      url: page.kind === 'post' && person.url ? site.origin + person.url : undefined,
      mainEntityOfPage: page.kind === 'author' ? { '@id': url } : undefined,
    });
  return { '@context': 'https://schema.org', '@graph': g };
}
