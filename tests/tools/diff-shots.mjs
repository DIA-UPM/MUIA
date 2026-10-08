// Compares two folders of screenshots (reference vs. candidate) and writes,
// for every pair, a diff image and a side-by-side image (reference | candidate | diff).
//
//   node tests/tools/diff-shots.mjs [--ref tests/reference] [--cand .cache/local-shots] [--out .cache/shot-diffs]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const REF = path.resolve(arg('ref', 'tests/reference'));
const CAND = path.resolve(arg('cand', '.cache/local-shots'));
const OUT = path.resolve(arg('out', '.cache/shot-diffs'));
fs.mkdirSync(OUT, { recursive: true });

function pad(img, w, h) {
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  PNG.bitblt(img, out, 0, 0, Math.min(img.width, w), Math.min(img.height, h), 0, 0);
  return out;
}

export function compareImages(refFile, candFile, outPrefix) {
  const a = PNG.sync.read(fs.readFileSync(refFile));
  const b = PNG.sync.read(fs.readFileSync(candFile));
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const A = pad(a, w, h);
  const B = pad(b, w, h);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(A.data, B.data, diff.data, w, h, { threshold: 0.15, includeAA: false });
  if (outPrefix) {
    // Side by side, downscaled to max 700px per panel for viewing.
    const scale = Math.min(1, 700 / w);
    const pw = Math.round(w * scale);
    const ph = Math.round(h * scale);
    const side = new PNG({ width: pw * 3 + 20, height: ph });
    side.data.fill(255);
    const blit = (src, ox) => {
      for (let y = 0; y < ph; y++)
        for (let x = 0; x < pw; x++) {
          const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
          const si = (sy * w + sx) * 4, di = (y * side.width + x + ox) * 4;
          side.data[di] = src.data[si];
          side.data[di + 1] = src.data[si + 1];
          side.data[di + 2] = src.data[si + 2];
          side.data[di + 3] = 255;
        }
    };
    blit(A, 0);
    blit(B, pw + 10);
    blit(diff, 2 * pw + 20);
    fs.writeFileSync(`${outPrefix}-side.png`, PNG.sync.write(side));
  }
  return { mismatch: n / (w * h), refSize: [a.width, a.height], candSize: [b.width, b.height] };
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('diff-shots.mjs')) {
  const files = fs.readdirSync(CAND).filter((f) => f.endsWith('.png') && fs.existsSync(path.join(REF, f)));
  for (const f of files) {
    const r = compareImages(path.join(REF, f), path.join(CAND, f), path.join(OUT, f.replace('.png', '')));
    console.log(`${f.padEnd(28)} mismatch ${(r.mismatch * 100).toFixed(2).padStart(6)}%  ref ${r.refSize.join('x')}  cand ${r.candSize.join('x')}`);
  }
}
