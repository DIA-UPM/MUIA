// Shared helpers for the crawler: polite HTTP fetching with an on-disk cache.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://muia.dia.fi.upm.es';
export const HOST = new URL(ORIGIN).host;
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = path.join(ROOT, '.cache', 'crawl');
export const USER_AGENT = 'MUIA-static-migration/1.0 (site archival; contact: site maintainers)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

export function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/** Normalises a URL: strips the hash, resolves relative to `base`, lower-cases the host. */
export function normalizeUrl(raw, base) {
  if (!raw) return null;
  raw = raw.trim().replace(/&amp;/g, '&');
  if (/^(data|mailto|tel|javascript|about|blob):/i.test(raw)) return null;
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    if (u.host === HOST) u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

export const isInternal = (u) => {
  try {
    return new URL(u).host === HOST;
  } catch {
    return false;
  }
};

let lastRequest = 0;
const MIN_GAP_MS = Number(process.env.CRAWL_DELAY_MS ?? 400);

/**
 * Polite cached GET. Responses are cached forever under .cache/crawl/http unless
 * `refresh` is set, so development never re-downloads unchanged resources.
 * Returns { url, finalUrl, status, headers, redirects, body(Buffer), fromCache }.
 */
export async function cachedGet(url, { refresh = false, userAgent = null } = {}) {
  // A custom user agent (e.g. for Google Fonts, which serves different formats per browser) gets its own cache entry.
  const key = sha(userAgent ? `${url} ${userAgent}` : url);
  const metaFile = path.join(CACHE, 'http', key + '.json');
  const bodyFile = path.join(CACHE, 'http', key + '.bin');
  if (!refresh && fs.existsSync(metaFile)) {
    const meta = readJson(metaFile);
    const body = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile) : Buffer.alloc(0);
    return { ...meta, body, fromCache: true };
  }
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();

  const redirects = [];
  let current = url;
  let res;
  for (let hop = 0; hop < 10; hop++) {
    try {
      res = await fetch(current, { redirect: 'manual', headers: { 'user-agent': userAgent || USER_AGENT } });
    } catch (err) {
      // Network errors are not cached so that the next run retries them.
      const meta = { url, finalUrl: current, status: 0, error: String(err.cause?.code || err.message), headers: {}, redirects };
      return { ...meta, body: Buffer.alloc(0), fromCache: false };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      redirects.push({ from: current, to: next, status: res.status });
      current = next;
      continue;
    }
    break;
  }
  const body = Buffer.from(await res.arrayBuffer());
  const meta = {
    url,
    finalUrl: current,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    redirects,
    fetchedAt: new Date().toISOString(),
  };
  writeJson(metaFile, meta);
  ensureDir(path.dirname(bodyFile));
  fs.writeFileSync(bodyFile, body);
  return { ...meta, body, fromCache: false };
}

/** Pages that are CMS endpoints rather than public content. */
export function isCmsEndpoint(u) {
  const p = new URL(u).pathname;
  return /^\/(wp-admin|wp-json|wp-login\.php|xmlrpc\.php|wp-cron\.php)/.test(p) || /\/feed\/?$/.test(p) || /\/comments\/feed/.test(p) || new URL(u).searchParams.has('s') || new URL(u).searchParams.has('p') || new URL(u).searchParams.has('replytocom');
}

export const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|zip|rtf|txt|csv)$/i;
export const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|json|map)$/i;
