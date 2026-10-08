// Migration-time parser: converts the original Gutenberg / Essential Blocks markup
// into the JSON block model rendered by scripts/build/lib/blocks.mjs.
//
// Every typed block is verified by rendering it back and comparing the canonical
// DOM with the original. When they differ the block is stored as a raw `html`
// block instead (nothing is ever lost) and the mismatch is reported.
import * as cheerio from 'cheerio';
import { renderBlocks } from '../build/lib/blocks.mjs';

export const stats = { typed: {}, fallback: {}, mismatches: [] };

// ---------------------------------------------------------------- canonical DOM
export function canonical(html) {
  const $ = cheerio.load(`<root>${html}</root>`, { xmlMode: false }, false);
  const out = [];
  const walk = (node) => {
    if (node.type === 'text') {
      const t = node.data.replace(/ /g, ' ').replace(/\s+/g, ' ');
      // Whitespace-only nodes are layout-neutral between blocks; inside text a leading or
      // trailing space matters ("Web: <a>" vs "Web:<a>"), so it is kept (collapsed).
      if (t.trim()) out.push(t);
      return;
    }
    if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return;
    const a = Object.entries(node.attribs || {})
      .map(([k, v]) => {
        if (k === 'class') v = [...new Set(v.split(/\s+/).filter(Boolean))].sort().join(' ');
        else v = v.replace(/\s+/g, ' ').trim();
        return k === 'class' && !v ? null : `${k}=${v}`;
      })
      .filter(Boolean)
      .sort();
    out.push(`<${node.name} ${a.join(' ')}>`);
    for (const c of node.children || []) walk(c);
    out.push(`</${node.name}>`);
  };
  for (const c of $('root').get(0)?.children || $.root().children().get()) walk(c);
  return out.join('');
}

// ---------------------------------------------------------------- helpers
const classes = ($el) => ($el.attr('class') || '').split(/\s+/).filter(Boolean);
const innerHtml = ($, el) => $(el).html() ?? '';
const kids = ($, el) => $(el).children().toArray();

const BLOCK_RE = /^wp-block-essential-blocks-([a-z-]+)$/;
const ID_RE = /^eb-[a-z]+(?:-[a-z]+)*-[a-z0-9]{4,8}$/;

/** Reads the common EB frame (outer wrapper + eb-parent-wrapper). */
function readFrame($, el, type) {
  const $el = $(el);
  const c = classes($el);
  const b = { type };
  if (c.includes('eb-parent-wrapper')) {
    // legacy column: no outer wrapper
    b.outer = false;
    b.id = c.find((x) => x.startsWith('eb-parent-') && x !== 'eb-parent-wrapper').slice('eb-parent-'.length);
    readAnim(c, b);
    if ($el.attr('id')) b.anchor = $el.attr('id');
    return { b, inner: el };
  }
  const root = c.find((x) => x.startsWith('root-eb-'));
  const slugIdx = c.findIndex((x) => BLOCK_RE.test(x));
  const extra = c.filter((x) => !BLOCK_RE.test(x) && !x.startsWith('root-eb-') && !/^align(full|wide)$/.test(x));
  const align = c.find((x) => /^align(full|wide)$/.test(x));
  const parent = $el.children('.eb-parent-wrapper').get(0);
  if (!parent || $el.children().length !== 1) return null;
  const pc = classes($(parent));
  const pid = pc.find((x) => x.startsWith('eb-parent-') && x !== 'eb-parent-wrapper');
  if (!pid) return null;
  b.id = pid.slice('eb-parent-'.length);
  if (root && root !== `root-${b.id}`) return null;
  if (!root) b.rootClass = false;
  else if (c.indexOf(root) < slugIdx) b.rootFirst = true;
  if (align) b.align = align.slice(5);
  if (extra.length) b.className = extra.join(' ');
  if ($el.attr('id')) b.anchor = $el.attr('id');
  readAnim(pc, b);
  if (Object.keys(el.attribs).some((k) => k !== 'class' && k !== 'id')) return null;
  return { b, inner: parent };
}
function readAnim(c, b) {
  const a = c.find((x) => x.startsWith('eb___') && x !== 'eb___animated');
  if (a) b.animation = a.slice(5);
}

const single = ($, el) => {
  const k = kids($, el);
  return k.length === 1 ? k[0] : null;
};

// ---------------------------------------------------------------- per-type parsers
const parsers = {
  wrapper($, inner, b, ctx) {
    const outer = single($, inner);
    const oc = classes($(outer));
    const wInner = single($, outer);
    const blocks = single($, wInner);
    const bc = classes($(blocks));
    const alignOuter = oc.find((x) => x.startsWith('eb-wrapper-align-'));
    const alignInner = bc.find((x) => x.startsWith('eb-wrapper-align-'));
    if (alignOuter) {
      b.legacy = true;
      b.contentAlign = alignOuter.slice('eb-wrapper-align-'.length);
    } else if (alignInner) b.contentAlign = alignInner.slice('eb-wrapper-align-'.length);
    b.children = parseChildren($, blocks, ctx);
  },
  row($, inner, b, ctx) {
    const inn = $(inner).find('> .eb-row-root-container > .eb-row-wrapper > .eb-row-inner').get(0);
    b.children = parseChildren($, inn, ctx);
  },
  column($, inner, b, ctx) {
    const inn = $(inner).find('> .eb-column-wrapper > .eb-column-inner').get(0);
    b.children = parseChildren($, inn, ctx);
  },
  'advanced-heading'($, inner, b) {
    const w = single($, inner);
    const wc = classes($(w));
    const preset = wc.filter((x) => x !== 'eb-advance-heading-wrapper' && x !== b.id);
    if (preset.length) b.preset = preset.join(' ');
    b.parts = kids($, w).map((p) => {
      const pc = classes($(p));
      if (pc.includes('eb-ah-separator')) {
        const part = { part: 'separator', style: pc.filter((x) => x !== 'eb-ah-separator').join(' ') };
        const i = $(p).children('i').attr('class');
        if (i) part.icon = i;
        return part;
      }
      return { part: pc.includes('eb-ah-title') ? 'title' : 'subtitle', tag: p.name, html: innerHtml($, p) };
    });
  },
  infobox($, inner, b) {
    const w = single($, inner);
    let body = single($, w);
    if (body.name === 'a') {
      b.link = { href: $(body).attr('href'), target: $(body).attr('target'), rel: $(body).attr('rel') };
      body = single($, body);
    }
    const $b = $(body);
    const img = $b.find('> .icon-img-wrapper img').get(0);
    if (img) b.image = { src: $(img).attr('src'), alt: $(img).attr('alt') ?? '' };
    const iconEl = $b.find('> .icon-img-wrapper .eb-infobox-icon-data-selector').get(0);
    if (iconEl) {
      b.icon = $(iconEl).attr('data-icon') ?? $(iconEl).attr('icon') ?? classes($(iconEl)).filter((x) => x !== 'eb-infobox-icon-data-selector').join(' ');
      b.iconTag = iconEl.name;
      b.iconWrapperClass = classes($(iconEl).parent()).filter((x) => x !== 'eb-icon').join(' ');
    }
    const cw = $b.children('.contents-wrapper');
    const t = cw.children('.title').get(0);
    if (t) {
      b.titleTag = t.name;
      b.title = innerHtml($, t);
    }
    const s = cw.children('.subtitle').get(0);
    if (s) {
      b.subtitleTag = s.name;
      b.subtitle = innerHtml($, s);
    }
    const d = cw.children('.description').get(0);
    if (d) b.description = innerHtml($, d);
    const btn = cw.find('> .infobox-btn-wrapper > a').get(0);
    if (btn) b.button = { text: $(btn).find('.infobox-btn-text').html(), href: $(btn).attr('href'), target: $(btn).attr('target'), rel: $(btn).attr('rel') };
  },
  accordion($, inner, b, ctx) {
    const cont = single($, inner);
    const $c = $(cont);
    b.mode = $c.attr('data-accordion-type');
    b.tabIcon = $c.attr('data-tab-icon');
    b.expandedIcon = $c.attr('data-expanded-icon');
    b.transitionDuration = $c.attr('data-transition-duration');
    const items = kids($, single($, cont));
    b.legacy = !$(items[0]).find('> .eb-accordion-title-wrapper > .eb-accordion-title-content-wrap').length;
    b.items = items.map((it) => {
      const ic = classes($(it));
      const item = { id: ic.find((x) => x.startsWith('eb-accordion-item-')), clickable: $(it).attr('data-clickable') };
      if (!ic.includes('wp-block-essential-blocks-accordion-item')) item.noBlockClass = true;
      const t = $(it).find('.eb-accordion-title').get(0);
      item.titleTag = t.name;
      item.title = innerHtml($, t);
      item.children = parseChildren($, $(it).find('> .eb-accordion-content-wrapper > .eb-accordion-content').get(0), ctx);
      return item;
    });
  },
  'advanced-tabs'($, inner, b, ctx) {
    const w = single($, inner);
    const wc = classes($(w));
    b.layout = wc.filter((x) => x !== b.id && x !== 'eb-advanced-tabs-wrapper').join(' ') || undefined;
    if ($(w).attr('data-min-height')) b.minHeight = $(w).attr('data-min-height');
    const lis = $(w).find('> .eb-tabs-nav > ul > li').toArray();
    const panes = $(w).find('> .eb-tabs-contents > .eb-tab-wrapper').toArray();
    b.titleTag = $(lis[0]).find('.tab-title-text').get(0)?.name;
    b.activeIndex = lis.findIndex((li) => $(li).hasClass('active'));
    b.tabs = lis.map((li, i) => {
      const tab = { tabId: $(li).attr('data-title-tab-id'), title: $(li).find('.tab-title-text').html() };
      if ($(li).attr('data-title-custom-id') !== undefined) tab.customId = $(li).attr('data-title-custom-id');
      if ($(li).attr('id')) tab.anchor = $(li).attr('id');
      const ic = $(li).find('.eb-button-icon').attr('class');
      if (ic) tab.icon = ic.replace('eb-button-icon', '').trim();
      const pane = panes.find((p) => $(p).attr('data-tab-id') === tab.tabId);
      tab.children = parseChildren($, $(pane).find('> .eb-tab-inner').get(0), ctx);
      return tab;
    });
  },
  button($, inner, b) {
    const a = $(inner).find('a.eb-button-anchor').get(0);
    const $a = $(a);
    b.href = $a.attr('href');
    b.target = $a.attr('target');
    b.rel = $a.attr('rel');
    const icon = $a.find('i').get(0);
    if (icon) {
      b.icon = classes($(icon)).filter((x) => !x.startsWith('eb-button-icon')).join(' ');
      b.iconPosition = $(icon).hasClass('eb-button-icon-left') ? 'left' : 'right';
      $(icon).remove();
    }
    b.text = $a.html();
  },
  'dual-button'($, inner, b) {
    const w = single($, inner);
    b.preset = classes($(w)).filter((x) => x !== 'eb-button-group-wrapper' && x !== b.id).join(' ') || undefined;
    b.buttons = $(w)
      .children('a')
      .toArray()
      .map((a) => ({ text: $(a).find('.eb-button-text').html(), href: $(a).attr('href'), target: $(a).attr('target'), rel: $(a).attr('rel') }));
    const mid = $(w).children('.eb-button-group__midldeInner');
    if (mid.length) {
      const i = mid.find('i').attr('icon');
      b.connector = i ? { icon: i } : { text: mid.text() };
    }
  },
  'feature-list'($, inner, b) {
    const w = single($, inner);
    b.wrapperClass = classes($(w)).filter((x) => x !== b.id && x !== 'eb-feature-list-wrapper').join(' ');
    const ul = single($, w);
    b.listClass = classes($(ul)).filter((x) => x !== 'eb-feature-list-items').join(' ');
    const lis = kids($, ul);
    b.titleTag = $(lis[0]).find('.eb-feature-list-title').get(0)?.name;
    b.items = lis.map((li) => {
      const $li = $(li);
      const it = { icon: $li.attr('data-icon') };
      if ($li.attr('data-icon-color') !== undefined) it.iconColor = $li.attr('data-icon-color');
      if ($li.attr('data-icon-background-color') !== undefined) it.iconBackground = $li.attr('data-icon-background-color');
      if ($li.attr('data-new-tab') === 'true') it.newTab = true;
      const link = $li.attr('data-link');
      const t = $li.find('.eb-feature-list-title');
      const a = t.children('a');
      if (link) {
        it.href = link;
        it.title = a.html();
      } else it.title = t.html();
      const st = $li.find('.eb-feature-list-icon').attr('style');
      const expected = [it.iconColor != null && `color:${it.iconColor}`, it.iconBackground != null && `background-color:${it.iconBackground}`].filter(Boolean).join(';');
      if ((st || '') !== expected) it.styleAttr = st ?? '';
      const c = $li.find('.eb-feature-list-content').get(0);
      if (c) it.content = innerHtml($, c);
      return it;
    });
  },
  'number-counter'($, inner, b) {
    const w = single($, inner);
    const n = $(w).find('span.eb-counter');
    b.title = $(w).find('.eb-counter-title').html();
    b.target = n.attr('data-target');
    b.start = n.attr('data-startvalue');
    b.duration = n.attr('data-duration');
    b.separator = n.attr('data-separator');
    b.showSeparator = n.attr('data-isshowseparator');
    const pre = $(w).find('.eb-counter-prefix').html();
    const suf = $(w).find('.eb-counter-suffix').html();
    if (pre) b.prefix = pre;
    if (suf) b.suffix = suf;
  },
  'advanced-image'($, inner, b) {
    const fig = single($, inner);
    b.figureClass = classes($(fig)).filter((x) => x !== 'eb-advanced-image-wrapper' && x !== b.id).join(' ');
    const iw = $(fig).children('.image-wrapper');
    const a = iw.children('a').get(0);
    if (a) {
      b.link = { href: $(a).attr('href'), target: $(a).attr('target'), rel: $(a).attr('rel') };
      if ($(a).hasClass('eb-advimg-link')) b.link.overlay = true;
    }
    const img = iw.find('img');
    b.src = img.attr('src');
    b.alt = img.attr('alt') ?? '';
    const cap = iw.find('figcaption p').get(0);
    if (cap) b.caption = innerHtml($, cap);
  },
  'advanced-video'($, inner, b) {
    const w = single($, inner);
    b.lightbox = classes($(w)).filter((x) => x !== 'eb-advanced-video-wrapper' && x !== b.id).join(' ');
    const o = $(w).find('.eb-player-option');
    b.url = o.attr('data-url');
    b.controls = o.attr('data-controls') === 'true';
    b.loop = o.attr('data-loop') === 'true';
    b.muted = o.attr('data-muted') === 'true';
    b.autoplay = o.attr('data-playing') === 'true';
    b.poster = o.attr('data-light');
    b.playIcon = o.attr('data-customplayiconlib');
    b.playIconImage = o.attr('data-playicon');
  },
  'advanced-navigation'($, inner, b) {
    const w = single($, inner);
    b.wrapperClass = classes($(w)).filter((x) => x !== b.id && x !== 'eb-advanced-navigation-wrapper').join(' ');
  },
  'post-grid'($, inner, b, ctx) {
    ctx.parsePostGrid($, inner, b);
  },
};

/** Parses one EB element; returns a typed block or null when not recognised. */
function parseEb($, el, ctx) {
  const c = classes($(el));
  const slugCls = c.find((x) => BLOCK_RE.test(x));
  if (!slugCls) return null;
  const type = slugCls.match(BLOCK_RE)[1];
  if (!parsers[type]) return null;
  const fr = readFrame($, el, type);
  if (!fr) return null;
  try {
    parsers[type]($, fr.inner, fr.b, ctx);
  } catch (err) {
    fr.b.__error = err.message;
  }
  return fr.b;
}

/** Parses the children of a container element into a block list. */
export function parseChildren($, container, ctx) {
  if (!container) return [];
  const out = [];
  let pending = '';
  const flush = () => {
    if (pending.trim()) out.push({ type: 'html', html: pending.trim() });
    pending = '';
  };
  for (const node of $(container).contents().toArray()) {
    if (node.type === 'comment') continue;
    if (node.type === 'text') {
      if (node.data.trim()) pending += node.data;
      continue;
    }
    const original = $.html(node);
    const block = node.type === 'tag' ? parseEb($, node, ctx) : null;
    if (!block) {
      pending += (pending ? '\n' : '') + original;
      continue;
    }
    let ok = !block.__error;
    let rendered = '';
    if (ok) {
      try {
        rendered = renderBlocks([block], ctx.renderCtx);
        ok = canonical(rendered) === canonical(original);
      } catch (err) {
        ok = false;
        block.__error = err.message;
      }
    }
    const key = block.type;
    if (ok) {
      stats.typed[key] = (stats.typed[key] || 0) + 1;
      flush();
      out.push(block);
    } else {
      stats.fallback[key] = (stats.fallback[key] || 0) + 1;
      stats.mismatches.push({ page: ctx.pageUrl, type: key, id: block.id, error: block.__error, original: canonical(original).slice(0, 3000), rendered: canonical(rendered).slice(0, 3000) });
      pending += (pending ? '\n' : '') + original;
    }
  }
  flush();
  return out;
}
