// Maps URLs of the original site to their location in the static site.
//
//   https://muia.dia.fi.upm.es/es/estructura/          → /es/estructura/        (pages keep their path)
//   https://muia.dia.fi.upm.es/wp-content/uploads/...  → /wp-content/uploads/... (uploaded media & documents
//                                                          keep their public URL)
//   .../wp-content/plugins/<p>/...                      → /assets/vendor/<p>/...  (theme/plugin binaries)
//   .../wp-content/themes/<t>/...                       → /assets/vendor/<t>/...
//   .../wp-includes/...                                 → /assets/vendor/wp-includes/...
//   https://mucd.dia.fi.upm.es/... (sister site images) → /assets/external/mucd.dia.fi.upm.es/...
import { HOST } from './lib.mjs';

// Hosts whose images are needed to render the pages (sister sites and the
// Templately image library used by some Essential Blocks backgrounds).
export const MIRRORED_HOSTS = ['mucd.dia.fi.upm.es', 'www.fi.upm.es', 'static.live.templately.com'];

/** Local path for an internal or mirrored resource URL, or null if it stays external. */
export function localPath(url) {
  let u;
  try {
    u = new URL(url, `https://${HOST}/`);
  } catch {
    return null;
  }
  if (u.host === 'fonts.gstatic.com') return `/assets/fonts/google${u.pathname.replace(/^\/s/, '')}`;
  if (MIRRORED_HOSTS.includes(u.host)) return `/assets/external/${u.host}${u.pathname}`;
  if (u.host !== HOST) return null;
  const p = u.pathname;
  let m;
  if ((m = p.match(/^\/wp-content\/(?:plugins|themes)\/(.+)$/))) return `/assets/vendor/${m[1]}`;
  if ((m = p.match(/^\/wp-includes\/(.+)$/))) return `/assets/vendor/wp-includes/${m[1]}`;
  return p;
}

const ORIGIN_RE = /(?:https?:)?\/\/muia\.dia\.fi\.upm\.es(?=[/"'?#\s]|$)/g;

/**
 * Rewrites URLs inside an HTML fragment taken from the original site:
 * internal links become root-relative, theme/plugin resources point to
 * /assets/vendor/…, and images of mirrored hosts point to the local copy.
 * Links (<a href>) to other hosts are left untouched.
 */
export function localizeHtml(html) {
  if (!html) return html;
  // Resource attributes: map through localPath (handles vendor + mirrored hosts).
  html = html.replace(/\b(src|data-src|data-light|data-playicon|poster)=(["'])([^"']+)\2/g, (all, attr, q, url) => {
    const lp = localPath(url);
    return lp ? `${attr}=${q}${lp}${tail(url)}${q}` : all;
  });
  html = html.replace(/\b(srcset)=(["'])([^"']+)\2/g, (all, attr, q, val) => {
    const out = val
      .split(',')
      .map((part) => {
        const [url, ...rest] = part.trim().split(/\s+/);
        const lp = localPath(url);
        return [lp ? lp + tail(url) : url, ...rest].join(' ');
      })
      .join(', ');
    return `${attr}=${q}${out}${q}`;
  });
  // Everything else on the source host (links, data-link …) becomes root-relative.
  return html.replace(ORIGIN_RE, '');
}

/** Same as localizeHtml for a single URL value (href or src). */
export function localizeUrl(url, { resource = false } = {}) {
  if (!url) return url;
  if (resource) {
    const lp = localPath(url);
    if (lp) return lp + tail(url);
  }
  return url.replace(ORIGIN_RE, '');
}

// Keep query/hash only when they matter (none of the uploads need ?ver=…).
function tail(url) {
  try {
    const u = new URL(url, `https://${HOST}/`);
    return u.hash || '';
  } catch {
    return '';
  }
}
