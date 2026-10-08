// Minimal static file server for dist/ (behaves like nginx/Apache with
// "index.html" directory indexes and the 404.html error page).
//
//   node scripts/serve.mjs [--port 8080] [--dir dist] [--watch]
//
// With --watch the site is rebuilt whenever data/, src/ or public/ change
// (that is what `npm run dev` does).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const PORT = Number(arg('port', process.env.PORT || 8080));
const DIR = path.resolve(ROOT, arg('dir', process.env.DIST_DIR || 'dist'));
const WATCH = process.argv.includes('--watch');
// --prefix /repositorio serves the site under a sub-folder, like GitHub Pages
// project sites (build it with SITE_URL=http://localhost:PORT/repositorio).
const PREFIX = (arg('prefix', '') || '').replace(/\/+$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
};

function send(res, status, file) {
  res.writeHead(status, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  pathname = pathname.replace(/\/{2,}/g, '/'); // like nginx merge_slashes
  if (PREFIX) {
    if (pathname === PREFIX) {
      res.writeHead(301, { location: PREFIX + '/' }).end();
      return;
    }
    if (!pathname.startsWith(PREFIX + '/')) {
      res.writeHead(404).end('Not found (outside ' + PREFIX + '/)');
      return;
    }
    pathname = pathname.slice(PREFIX.length);
  }
  const file = path.join(DIR, pathname);
  if (!file.startsWith(DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let stat = fs.existsSync(file) && fs.statSync(file);
  if (stat && stat.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { location: pathname + '/' + (new URL(req.url, 'http://x').search || '') }).end();
      return;
    }
    const index = path.join(file, 'index.html');
    if (fs.existsSync(index)) return send(res, 200, index);
    stat = null;
  }
  if (stat && stat.isFile()) return send(res, 200, file);
  const notFound = path.join(DIR, '404.html');
  if (fs.existsSync(notFound)) return send(res, 404, notFound);
  res.writeHead(404).end('Not found');
});

server.listen(PORT, () => console.log(`Serving ${path.relative(ROOT, DIR) || '.'} at http://localhost:${PORT}${PREFIX}/`));

if (WATCH) {
  let timer = null;
  let running = false;
  const rebuild = () => {
    if (running) return;
    running = true;
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts/build/build.mjs')], { stdio: 'inherit' });
    p.on('exit', () => (running = false));
  };
  for (const d of ['data', 'src', 'public'])
    fs.watch(path.join(ROOT, d), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 300);
    });
  console.log('Watching data/, src/ and public/ for changes…');
}
