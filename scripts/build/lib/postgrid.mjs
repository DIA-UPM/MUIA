// "Post grid" blocks: lists of news or people selected from the collections in
// data/news and data/people (the original Essential Blocks block ran a database
// query; here the same query runs at build time).
//
// All matching items are written into the HTML; when the block has pagination,
// src/js/site/post-grid.js shows one page at a time (without JavaScript every
// item stays visible).
import { esc } from './html.mjs';

export function selectItems(b, ctx) {
  const source = b.source === 'people' ? ctx.people : ctx.news;
  let items = source.filter((r) => r.lang === ctx.lang);
  if (b.tags?.length) items = items.filter((r) => r.tags?.some((t) => b.tags.includes(t)));
  if (b.categories?.length) items = items.filter((r) => r.categories?.some((c) => b.categories.includes(c)));
  const title = (r) => (r.name ?? r.title).replace(/<[^>]+>/g, '');
  const key = b.orderBy === 'title' ? (r) => title(r).toLocaleLowerCase('es') : (r) => r.date;
  items = [...items].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  if (b.order === 'desc') items.reverse();
  return items;
}

const truncateWords = (s, n) => {
  if (!n) return s;
  const words = s.split(/\s+/);
  return words.length > n ? words.slice(0, n).join(' ') + '...' : s;
};

function article(r, b, ctx) {
  const titleHtml = r.name ?? r.title;
  const titleText = titleHtml.replace(/<[^>]+>/g, '');
  const attrTitle = esc(ctx.decode(titleText).replace(/[«»]/g, '"').replace(/’/g, "'"));
  const thumb = r.listImage || r.featuredImage;
  let media = '';
  if (b.showThumbnail && thumb) {
    media =
      `<div class="ebpg-entry-media">\n<div class="ebpg-entry-thumbnail">\n<a class="ebpg-post-link-wrapper eb-sr-only" href="${esc(r.path)}">${titleHtml}</a>\n` +
      `<img decoding="async" width="${thumb.width}" height="${thumb.height}" src="${esc(thumb.src)}" class="attachment-full size-full" alt="${esc(thumb.alt ?? '')}">\n</div>\n</div>`;
  }
  const header = `<header class="ebpg-entry-header">\n<${b.titleTag} class="ebpg-entry-title">\n<a class="ebpg-grid-post-link" href="${esc(r.path)}" title="${r.titleAttr ?? attrTitle}">${truncateWords(titleHtml, b.titleWords)}</a>\n</${b.titleTag}>\n</header>`;
  let meta = '';
  if (b.showMeta) {
    const metaItems = (list) =>
      list
        .map((m) => {
          if (m === 'post_tag')
            return `<div class="ebpg-meta ebpg-tags-meta">${(r.tags || [])
              .map((t) => ctx.term('post_tag', t))
              .filter(Boolean)
              .map((t) => `<a href="${esc(t.path)}" title="${esc(ctx.decode(t.name))}">${t.name}</a>`)
              .join('')}</div>`;
          return '';
        })
        .join('');
    meta = `<div class="ebpg-entry-meta ebpg-header-meta"><div class="ebpg-entry-meta-items">${metaItems(b.headerMeta || [])}</div></div><div class="ebpg-entry-meta ebpg-footer-meta"><div class="ebpg-entry-meta-items">${metaItems(b.footerMeta || [])}</div></div>`;
  }
  return `<article class="ebpg-grid-post ebpg-post-grid-column" data-id="${r.wpId}"><div class="ebpg-grid-post-holder"><div class="ebpg-entry-wrapper">${media}${header}${meta}</div></div></article>`;
}

export function renderPostGrid(b, ctx) {
  const items = selectItems(b, ctx);
  const pages = b.pagination ? Math.ceil(items.length / b.perPage) : 1;
  const visible = b.pagination ? items : items.slice(0, b.perPage);
  const filter = b.showTaxonomyFilter && b.filterTerms?.length
    ? `<div class="eb-post-grid-category-filter" data-ebpgtaxonomy="${b.filterTaxonomy}">\n<ul class="ebpg-category-filter-list">\n${b.filterTerms.map((t) => `<li class="ebpg-category-filter-list-item " data-ebpgcategory="${esc(t.slug)}">${t.name}</li>`).join('\t')}\t</ul>\n</div>\n`
    : '';
  const pagination = pages > 1
    ? `<div class="ebpostgrid-pagination ebpg-pagination "><button class="ebpg-pagination-item-previous">&lt;</button>${Array.from({ length: pages }, (_, i) => `<button class="ebpg-pagination-item ${i === 0 ? 'active' : ''}" data-pagenumber="${i + 1}">\n${i + 1}\n</button>`).join('')}<button class="ebpg-pagination-item-next">&gt;</button></div>`
    : '';
  const dataAttrs = b.pagination ? ` data-per-page="${b.perPage}"` : '';
  return (
    `<div class="root-${b.id} wp-block-essential-blocks-post-grid">\n<div class="eb-parent-wrapper eb-parent-${b.id} ">\n` +
    `<div class="${b.id} ${b.preset} eb-post-grid-wrapper" data-id="${b.id}"${dataAttrs}>\n${filter}` +
    `<div class="eb-post-grid-posts-wrapper">${visible.map((r) => article(r, b, ctx)).join('')}</div>${pagination}        </div>\n</div>\n</div>`
  );
}
