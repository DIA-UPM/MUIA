// Block renderers: turn the JSON content blocks stored in data/ into the HTML
// markup used by the original site's (Gutenberg + Essential Blocks) stylesheets.
//
// Every block is a plain object with a `type`. Essential Blocks ("EB") blocks also
// carry the `id` that the original per-block CSS is keyed on (e.g.
// "eb-advance-heading-cl49nvl"); keep it unchanged or the block loses its styling.
//
// Common optional fields for EB blocks:
//   align       "full" | "wide"      → adds the alignfull / alignwide class
//   className   extra CSS classes added in the original editor
//   anchor      HTML id (used for in-page links such as #faq_generales)
//   animation   entrance animation name (animate.css), e.g. "fadeInUp"
//   rootClass   false when the original markup had no `root-<id>` class
//   legacy      true for blocks saved by an older Essential Blocks version
import { esc, cls, attrs } from './html.mjs';

const EB_SLUG = {
  wrapper: 'wrapper',
  row: 'row',
  column: 'column',
  'advanced-heading': 'advanced-heading',
  infobox: 'infobox',
  accordion: 'accordion',
  'advanced-tabs': 'advanced-tabs',
  button: 'button',
  'dual-button': 'dual-button',
  'feature-list': 'feature-list',
  'number-counter': 'number-counter',
  'advanced-image': 'advanced-image',
  'advanced-video': 'advanced-video',
  'post-grid': 'post-grid',
  'advanced-navigation': 'advanced-navigation',
};

const anim = (b) => (b.animation ? `eb_animation eb___animated eb___${b.animation}` : '');

/** Outer frame shared by all EB blocks: block wrapper + eb-parent-wrapper. */
function frame(b, inner) {
  const slug = `wp-block-essential-blocks-${EB_SLUG[b.type]}`;
  const parentCls = cls('eb-parent-wrapper', `eb-parent-${b.id}`, anim(b));
  if (b.outer === false) {
    // Older EB columns: the parent wrapper *is* the block wrapper.
    return `<div class="${parentCls} ${slug}"${attrs({ id: b.anchor })}>${inner}</div>`;
  }
  const outerCls = cls(b.rootFirst && b.rootClass !== false && `root-${b.id}`, slug, b.align && `align${b.align}`, b.className, !b.rootFirst && b.rootClass !== false && `root-${b.id}`);
  return `<div class="${outerCls}"${attrs({ id: b.anchor })}><div class="${parentCls} ">${inner}</div></div>`;
}

const renderers = {
  // Raw HTML fragment (core paragraphs, lists, tables, custom HTML …).
  html: (b) => b.html,

  wrapper: (b, r) =>
    frame(
      b,
      b.legacy
        ? `<div class="${cls('eb-wrapper-outer', b.id, b.contentAlign && `eb-wrapper-align-${b.contentAlign}`)}"><div class="eb-wrapper-inner"><div class="eb-wrapper-inner-blocks">${r(b.children)}</div></div></div>`
        : `<div class="eb-wrapper-outer ${b.id}"><div class="eb-wrapper-inner"><div class="${cls('eb-wrapper-inner-blocks', b.contentAlign && `eb-wrapper-align-${b.contentAlign}`)}">${r(b.children)}</div></div></div>`,
    ),

  row: (b, r) => frame(b, `<div class="eb-row-root-container ${b.id}" data-id="${b.id}"><div class="eb-row-wrapper"><div class="eb-row-inner">${r(b.children)}</div></div></div>`),

  column: (b, r) => frame(b, `<div class="eb-column-wrapper ${b.id}"><div class="eb-column-inner">${r(b.children)}</div></div>`),

  'advanced-heading': (b) => {
    const parts = (b.parts || []).map((p) => {
      if (p.part === 'separator') return `<div class="eb-ah-separator ${p.style}">${p.icon ? `<i class="${p.icon}"></i>` : ''}</div>`;
      const c = p.part === 'title' ? 'eb-ah-title' : 'eb-ah-subtitle';
      return `<${p.tag} class="${c}">${p.html}</${p.tag}>`;
    });
    return frame(b, `<div class="${cls('eb-advance-heading-wrapper', b.id, b.preset)}" data-id="${b.id}">${parts.join('')}</div>`);
  },

  infobox: (b) => {
    const media = b.image
      ? `<div class="icon-img-wrapper"><div class="eb-infobox-image-wrapper"><img decoding="async" class="eb-infobox-image" src="${esc(b.image.src)}" alt="${esc(b.image.alt)}"></div></div>`
      : b.icon
        ? `<div class="icon-img-wrapper"><div class="${cls('eb-icon', b.iconWrapperClass)}"><${b.iconTag || 'span'} class="eb-infobox-icon-data-selector ${esc(b.icon)}" ${b.iconTag === 'i' ? 'icon' : 'data-icon'}="${esc(b.icon)}"></${b.iconTag || 'span'}></div></div>`
        : '';
    const title = b.title != null ? `<${b.titleTag || 'h2'} class="title">${b.title}</${b.titleTag || 'h2'}>` : '';
    const sub = b.subtitle != null ? `<${b.subtitleTag || 'h4'} class="subtitle">${b.subtitle}</${b.subtitleTag || 'h4'}>` : '';
    const desc = b.description != null ? `<p class="description">${b.description}</p>` : '';
    const btn = b.button ? `<div class="infobox-btn-wrapper"><a href="${esc(b.button.href)}"${attrs({ target: b.button.target, rel: b.button.rel })} class="infobox-btn"><span class="infobox-btn-text">${b.button.text}</span></a></div>` : '';
    const inner = `<div class="infobox-wrapper-inner">${media}<div class="contents-wrapper">${title}${sub}${desc}${btn}</div></div>`;
    const body = b.link
      ? `<a href="${esc(b.link.href)}"${attrs({ target: b.link.target, rel: b.link.rel })} class="info-click-link info-wrap-link">${inner}</a>`
      : inner;
    return frame(b, `<div class="${b.id} eb-infobox-wrapper">${body}</div>`);
  },

  accordion: (b, r) => {
    const items = b.items.map((it) => {
      const title = `<${it.titleTag || 'h3'} class="eb-accordion-title">${it.title}</${it.titleTag || 'h3'}>`;
      if (b.legacy) {
        return `<div class="${cls(!it.noBlockClass && 'wp-block-essential-blocks-accordion-item', it.id, 'eb-accordion-wrapper')}" data-clickable="${it.clickable}"><div class="eb-accordion-title-wrapper" tabindex="0"><span class="eb-accordion-icon-wrapper"><span class="${b.tabIcon} eb-accordion-icon"></span></span>${title}</div><div class="eb-accordion-content-wrapper"><div class="eb-accordion-content">${r(it.children)}</div></div></div>`;
      }
      return `<div class="${cls(!it.noBlockClass && 'wp-block-essential-blocks-accordion-item', it.id, 'eb-accordion-wrapper')}" data-clickable="${it.clickable}"><div class="eb-accordion-title-wrapper eb-accordion-title-wrapper-${b.id}" tabindex="0"><span class="eb-accordion-icon-wrapper eb-accordion-icon-wrapper-${b.id}"><span class="${b.tabIcon} eb-accordion-icon"></span></span><div class="eb-accordion-title-content-wrap title-content-${b.id}">${title}</div></div><div class="eb-accordion-content-wrapper eb-accordion-content-wrapper-${b.id}"><div class="eb-accordion-content">${r(it.children)}</div></div></div>`;
    });
    return frame(
      b,
      `<div class="eb-accordion-container ${b.id}" data-accordion-type="${b.mode}" data-tab-icon="${b.tabIcon}" data-expanded-icon="${b.expandedIcon}" data-transition-duration="${b.transitionDuration}"><div class="eb-accordion-inner">${items.join('')}</div></div>`,
    );
  },

  'advanced-tabs': (b, r) => {
    const titles = b.tabs
      .map((t, i) => `<li${attrs({ id: t.anchor, 'data-title-custom-id': t.customId })} data-title-tab-id="${t.tabId}" class="${i === (b.activeIndex ?? 0) ? 'active' : 'inactive'}">${t.icon ? `<span class="eb-button-icon ${t.icon}"></span>` : ''}<${b.titleTag || 'h6'} class="tab-title-text">${t.title}</${b.titleTag || 'h6'}></li>`)
      .join('');
    const panes = b.tabs
      .map((t) => `<div class="eb-tab-wrapper" data-tab-id="${t.tabId}" data-tab-parent-id="${b.id}"><div class="eb-tab-inner">${r(t.children)}</div></div>`)
      .join('');
    return frame(
      b,
      `<div class="${cls(b.id, 'eb-advanced-tabs-wrapper', b.layout)}"${attrs({ 'data-min-height': b.minHeight })}><div class="eb-tabs-nav"><ul class="tabTitles" data-tabs-ul-id="${b.id}">${titles}</ul></div><div class="eb-tabs-contents">${panes}</div></div>`,
    );
  },

  button: (b) =>
    frame(
      b,
      `<div class="eb-button-wrapper eb-button-alignment ${b.id}"><div class="eb-button"><a class="eb-button-anchor" href="${esc(b.href)}"${attrs({ target: b.target, rel: b.rel })}>${b.icon && b.iconPosition === 'left' ? `<i class="${b.icon} eb-button-icon eb-button-icon-left"></i>` : ''}${b.text}${b.icon && b.iconPosition !== 'left' ? `<i class="${b.icon} eb-button-icon eb-button-icon-right"></i>` : ''}</a></div></div>`,
    ),

  'dual-button': (b) => {
    const btn = (x, n) => `<a class="eb-button-parent eb-button-${n}" href="${esc(x.href)}"${attrs({ target: x.target, rel: x.rel })}><div class="eb-button-text eb-button-${n}-text">${x.text}</div></a>`;
    const mid = b.connector ? `<div class="eb-button-group__midldeInner"><span>${b.connector.icon ? `<i icon="${b.connector.icon}" class="${b.connector.icon} "></i>` : esc(b.connector.text)}</span></div>` : '';
    return frame(b, `<div class="${cls('eb-button-group-wrapper', b.id, b.preset)}" data-id="${b.id}">${btn(b.buttons[0], 'one')}${mid}${btn(b.buttons[1], 'two')}</div>`);
  },

  'feature-list': (b) => {
    const items = b.items
      .map((it) => {
        const iconMarkup = it.icon.startsWith('dashicons')
          ? `<span class="dashicon dashicons ${it.icon}"></span>`
          : `<i icon="${it.icon}" class="${it.icon} "></i>`;
        const style = it.styleAttr ?? [it.iconColor != null && `color:${it.iconColor}`, it.iconBackground != null && `background-color:${it.iconBackground}`].filter(Boolean).join(';');
        const title = it.href
          ? `<a href="${esc(it.href)}" target="${it.newTab ? '_blank' : '_self'}" rel="noopener">${it.title}</a>`
          : it.title;
        return (
          `<li class="eb-feature-list-item"${attrs([
            ['data-new-tab', String(!!it.newTab)],
            ['data-icon-type', 'icon'],
            ['data-icon', it.icon],
            ['data-icon-color', it.iconColor],
            ['data-icon-background-color', it.iconBackground],
            ['data-link', it.href ?? ''],
          ])}><div class="eb-feature-list-icon-box"><div class="eb-feature-list-icon-inner"><span class="eb-feature-list-icon"${attrs({ style: style || undefined })}>${iconMarkup}</span></div></div>` +
          `<div class="eb-feature-list-content-box"><${b.titleTag || 'h3'} class="eb-feature-list-title">${title}</${b.titleTag || 'h3'}>${it.content != null ? `<p class="eb-feature-list-content">${it.content}</p>` : ''}</div></li>`
        );
      })
      .join('');
    return frame(b, `<div class="${cls(b.id, 'eb-feature-list-wrapper', b.wrapperClass)}"><ul class="${cls('eb-feature-list-items', b.listClass)}">${items}</ul></div>`);
  },

  'number-counter': (b) =>
    frame(
      b,
      `<div class="${b.id} eb-counter-wrapper"><div class="counter-contents-wrapper"><h4 class="eb-counter-number"><span class="eb-counter-prefix">${b.prefix ?? ''}</span><span class="eb-counter eb-counter-number" data-duration="${b.duration}" data-startvalue="${b.start}" data-target="${b.target}" data-separator="${esc(b.separator)}" data-isshowseparator="${b.showSeparator}">${b.start}</span><span class="eb-counter-suffix">${b.suffix ?? ''}</span></h4><h3 class="eb-counter-title">${b.title}</h3></div></div>`,
    ),

  'advanced-image': (b) => {
    const img = `<img decoding="async" src="${esc(b.src)}" alt="${esc(b.alt)}">`;
    const wrapped = !b.link
      ? img
      : b.link.overlay
        ? `<a class="eb-advimg-link" href="${esc(b.link.href)}"${attrs({ target: b.link.target, rel: b.link.rel })}></a>${img}`
        : `<a href="${esc(b.link.href)}"${attrs({ target: b.link.target, rel: b.link.rel })}>${img}</a>`;
    const caption = b.caption != null ? `<figcaption><p>${b.caption}</p></figcaption>` : '';
    return frame(b, `<figure class="${cls('eb-advanced-image-wrapper', b.id, b.figureClass)}" data-id="${b.id}"><div class="image-wrapper">${wrapped}${caption}</div></figure>`);
  },

  'advanced-video': (b) =>
    frame(
      b,
      `<div class="eb-advanced-video-wrapper ${b.id} ${b.lightbox}" data-id="${b.id}"><div class="eb-player-wrapper ${b.id}"><div${attrs([
        ['class', `eb-player-option ${b.lightbox} right`],
        ['data-id', b.id],
        ['data-url', b.url],
        ['data-option', b.lightbox],
        ['data-controls', String(!!b.controls)],
        ['data-loop', String(!!b.loop)],
        ['data-muted', String(!!b.muted)],
        ['data-playing', String(!!b.autoplay)],
        ['data-overlay', String(!!b.poster)],
        ['data-light', b.poster],
        ['data-customplayicontype', 'icon'],
        ['data-customplayiconlib', b.playIcon],
        ['data-customplayicon', 'true'],
        ['data-playicon', b.playIconImage],
        ['data-download', 'false'],
      ])}></div></div></div>`,
    ),

  // Footer navigation block that the original site saved without a menu: renders empty.
  'advanced-navigation': (b) => frame(b, `<div class="${cls(b.id, 'eb-advanced-navigation-wrapper', b.wrapperClass)}"><div class="eb-nav-contents"></div></div>`),

  'post-grid': (b, r, ctx) => ctx.renderPostGrid(b),
};

/** Renders an array of blocks to HTML. `ctx` provides collection access for dynamic blocks. */
export function renderBlocks(blocks, ctx = {}) {
  const r = (list) => (list || []).map((b) => renderBlock(b)).join('\n');
  function renderBlock(b) {
    const fn = renderers[b.type];
    if (!fn) throw new Error(`Unknown block type "${b.type}"`);
    return fn(b, r, ctx);
  }
  return r(blocks);
}

export const BLOCK_TYPES = Object.keys(renderers);
