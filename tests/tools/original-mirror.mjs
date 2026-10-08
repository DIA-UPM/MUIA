// Offline copy of the ORIGINAL site for comparisons: a Playwright route handler
// that answers requests to the original hosts from the crawl cache
// (.cache/crawl/http). Lets the tests compare against the original without
// loading the source server again.
//
//   import { useOriginalMirror } from './original-mirror.mjs';
//   await useOriginalMirror(context);  // then page.goto('https://muia.dia.fi.upm.es/...')
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE = path.resolve('.cache/crawl/http');
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

function lookup(url) {
  for (const key of [`${url} ${CHROME_UA}`, url, url.replace(/^http:/, 'https:')]) {
    const meta = path.join(CACHE, sha(key) + '.json');
    if (fs.existsSync(meta)) {
      const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
      if (m.status === 200) return { meta: m, body: fs.readFileSync(path.join(CACHE, sha(key) + '.bin')) };
    }
  }
  return null;
}

export const hasMirror = () => fs.existsSync(CACHE);

export async function useOriginalMirror(context, { allowMissing = true } = {}) {
  const missing = [];
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return route.continue();
    const hit = lookup(url);
    if (!hit) {
      missing.push(url);
      return route.fulfill({ status: allowMissing ? 404 : 599, body: '' });
    }
    const type = hit.meta.headers['content-type'] || 'application/octet-stream';
    return route.fulfill({ status: 200, body: hit.body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
  });
  return missing;
}
