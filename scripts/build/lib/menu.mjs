// Navigation menus (header, sticky header, mobile drawer and footer widget).
//
// The markup and the "current item" classes follow WordPress' wp_nav_menu() so
// that the Astra stylesheets and scripts keep working unchanged.
import { esc } from './html.mjs';

const ARROW = `<span class="ast-icon icon-arrow"><svg class="ast-arrow-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" width="26px" height="16.043px" viewBox="57 35.171 26 16.043" enable-background="new 57 35.171 26 16.043" xml:space="preserve">
<path d="M57.5,38.193l12.5,12.5l12.5-12.5l-2.5-2.5l-10,10l-10-10L57.5,38.193z"></path>
</svg></span>`;
export { ARROW };

const stripHash = (u) => u.split('#')[0];

/**
 * Computes the WordPress classes of every item for the page being rendered.
 * `page` describes the current page: { kind: 'page'|'category'|'post'|…, basePath
 * (request path without "page/N/"), wpId (pages), isFront, categoryPaths and
 * parentPage (posts) }.
 */
export function menuState(items, page, ctx) {
  const state = new Map(); // item id -> Set(classes)
  const add = (it, ...c) => {
    if (!state.has(it.id)) state.set(it.id, new Set());
    c.forEach((x) => state.get(it.id).add(x));
  };
  const parents = new Map();
  const walk = (list, parent) =>
    list.forEach((it) => {
      parents.set(it.id, parent);
      if (it.children) walk(it.children, it);
    });
  walk(items, null);

  const all = [...parents.keys()].map((id) => find(items, id));
  const current = [];
  for (const it of all) {
    // "_current" marks the items WordPress flags as the current item (aria-current="page").
    if (it.kind === 'page' && page.kind === 'page' && ctx.wpIdOfPath(it.url) === page.wpId) {
      add(it, '_current', 'current-menu-item', 'page_item', `page-item-${ctx.wpIdOfPath(it.url)}`, 'current_page_item');
      current.push(it);
    } else if (it.kind === 'custom' && stripHash(it.url) === page.basePath) {
      add(it, '_current', 'current-menu-item');
      if (page.isFront && stripHash(it.url) === page.homePath) add(it, 'current_page_item');
      current.push(it);
    } else if (it.kind === 'custom' && page.isFront && stripHash(it.url) === page.homePath) {
      // Links to the front page are "current" on the site root too (without ancestors).
      add(it, 'current-menu-item');
    } else if (it.kind === 'category' && page.kind === 'category' && stripHash(it.url) === page.basePath) {
      add(it, '_current', 'current-menu-item');
      current.push(it);
    }
  }
  // Ancestors of current items.
  const suffix = page.kind === 'category' ? ['current-category-ancestor', 'current-category-parent'] : page.kind === 'page' ? ['current_page_ancestor', 'current_page_parent'] : null;
  for (const it of current) {
    let p = parents.get(it.id);
    let direct = true;
    while (p) {
      add(p, 'current-menu-ancestor');
      if (suffix) add(p, suffix[0]);
      if (direct) {
        add(p, 'current-menu-parent');
        if (suffix) add(p, suffix[1]);
      }
      direct = false;
      p = parents.get(p.id);
    }
  }
  // Single posts: category items of the post's categories.
  if (page.kind === 'post') {
    for (const it of all)
      if (it.kind === 'category' && page.categoryPaths.includes(stripHash(it.url))) add(it, 'current-post-ancestor', 'current-menu-parent', 'current-post-parent');
    if (page.parentPage) for (const it of all) if (it.kind === 'page' && stripHash(it.url) === page.parentPage) add(it, 'current-post-parent');
  }
  return state;
}

function find(items, id) {
  for (const it of items) {
    if (it.id === id) return it;
    const c = it.children && find(it.children, id);
    if (c) return c;
  }
  return null;
}

function baseClasses(it, ctx) {
  const type = it.kind === 'page' ? ['menu-item-type-post_type', 'menu-item-object-page'] : it.kind === 'category' ? ['menu-item-type-taxonomy', 'menu-item-object-category'] : ['menu-item-type-custom', 'menu-item-object-custom'];
  const home = stripHash(it.url) === ctx.homePath ? ['menu-item-home'] : [];
  return { type, home };
}

/** Order of the classes as printed by WordPress (purely cosmetic). */
function classList(it, state, ctx) {
  const { type, home } = baseClasses(it, ctx);
  const cur = state.get(it.id) || new Set();
  const order = ['current-menu-item', 'page_item', `page-item-${ctx.wpIdOfPath(it.url)}`, 'current_page_item', 'current-category-ancestor', 'current-post-ancestor', 'current-menu-ancestor', 'current-menu-parent', 'current-category-parent', 'current-post-parent', 'current_page_parent', 'current_page_ancestor'];
  const c = ['menu-item', ...type];
  // WordPress prints menu-item-home before the current-* classes for page items and after them for custom links.
  if (it.kind !== 'custom') c.push(...home);
  for (const x of order) if (cur.has(x)) c.push(x);
  if (it.kind === 'custom') c.push(...home);
  if (it.children) c.push('menu-item-has-children');
  c.push(`menu-item-${it.id}`);
  return c.join(' ');
}

/** Language switcher item (Polylang). */
function langItem(nav, page, { header, withId }) {
  const s = nav.languageSwitcher;
  const target = page.translations?.[s.targetLang];
  const href = target || `/${s.targetLang}/`;
  const cls = ['lang-item', `lang-item-${s.termId}`, `lang-item-${s.targetLang}`, !target && 'no-translation', 'lang-item-first', 'menu-item', 'menu-item-type-custom', 'menu-item-object-custom', `menu-item-${s.itemId}`].filter(Boolean).join(' ');
  const img = `<img src="${s.flag}" alt="${esc(s.label)}" width="16" height="11" style="width: 16px; height: 11px;">`;
  if (header) return `<li${withId ? ` id="menu-item-${s.itemId}"` : ''} class="${cls}"><a href="${esc(href)}" hreflang="${s.hreflang}" lang="${s.hreflang}" class="menu-link">${ARROW}<span class="menu-text">${img}</span></a></li>`;
  return `<li class="${cls}"><a href="${esc(href)}" hreflang="${s.hreflang}" lang="${s.hreflang}" class="menu-link">${img}</a></li>`;
}

/** Header menus (Astra markup). `withId` adds the li ids (only the first copy has them). */
export function headerMenu(nav, page, ctx, { id, className, withId }) {
  const state = menuState(nav.items, page, ctx);
  const s = ctx.strings;
  const item = (it, depth) => {
    const cls = classList(it, state, ctx);
    const hasKids = !!it.children;
    const toggle = hasKids && depth === 0
      ? `<span role="application" class="dropdown-menu-toggle ast-header-navigation-arrow" tabindex="0" aria-expanded="false" aria-label="${esc(s.dropdownToggle)}">${ARROW}</span>`
      : '';
    let html = `<li${withId ? ` id="menu-item-${it.id}"` : ''} class="${cls}"><a${hasKids ? ' aria-expanded="false"' : ''} href="${esc(it.url)}" class="menu-link">${ARROW}<span class="menu-text">${it.label}</span>${toggle}</a>`;
    if (hasKids) {
      html += `<button class="ast-menu-toggle" aria-expanded="false"><span class="screen-reader-text">${esc(s.menuToggle)}</span>${ARROW}</button>\n<ul class="sub-menu">\n${it.children.map((c) => item(c, depth + 1)).join('\t')}</ul>\n`;
    }
    return html + '</li>';
  };
  return `<ul id="${id}" class="${className}">${nav.items.map((it) => item(it, 0)).join('')}${langItem(nav, page, { header: true, withId })}</ul>`;
}

/** Footer "Navigation menu" widget. */
export function footerMenu(nav, page, ctx, widget) {
  const state = menuState(nav.items, page, ctx);
  const item = (it) => {
    const cls = classList(it, state, ctx);
    const cur = state.get(it.id)?.has('_current') ? ' aria-current="page"' : '';
    let html = `<li class="${cls}"><a${it.children ? ' aria-expanded="false"' : ''} href="${esc(it.url)}"${cur} class="menu-link">${it.label}</a>`;
    if (it.children) html += `\n<ul class="sub-menu">\n${it.children.map(item).join('\n')}\n</ul>\n`;
    return html + '</li>';
  };
  return `<h2 class="widget-title">${widget.title}</h2><nav class="${widget.containerClass}" aria-label="${esc(widget.navLabel)}"><ul id="${widget.menuId}" class="menu">${nav.items.map(item).join('\n')}\n${langItem(nav, page, { header: false })}\n</ul></nav>`;
}
