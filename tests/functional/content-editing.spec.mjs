// Proves that the content is edited through JSON:
//   1. change a visible field of a real JSON record to a recognisable value,
//   2. rebuild, serve the new build and check the value appears,
//   3. restore the EXACT original bytes (always, also when the test fails),
//   4. rebuild and check the test value is gone and the original is back.
// The builds go to a separate folder (dist-edit-test) served on its own port,
// so the rest of the test suite is not affected.
//
// It also checks that invalid JSON makes the build fail with a useful message
// (on a temporary copy of data/, never on the real files).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const TEST_VALUE = 'STATIC-MIGRATION-TEST-12345';
const DIST = 'dist-edit-test';
const PORT = 4190;
const BASE = `http://127.0.0.1:${PORT}`;

function build(env = {}) {
  const r = spawnSync(process.execPath, ['scripts/build/build.mjs', '--quiet'], { env: { ...process.env, DIST_DIR: DIST, ...env }, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  expect(build().code).toBe(0);
  server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(PORT), '--dir', DIST], { stdio: 'pipe' });
  let output = '';
  server.stdout.on('data', (d) => (output += d));
  server.stderr.on('data', (d) => (output += d));
  let last = '';
  for (let i = 0; i < 50; i++) {
    const status = await new Promise((resolve) => {
      http.get(`${BASE}/es/`, (res) => (res.resume(), resolve(res.statusCode))).on('error', (e) => resolve(e.code));
    });
    if (status === 200) return;
    last = String(status);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`test server did not start (${last}): ${output}`);
});
test.afterAll(() => {
  server?.kill();
  fs.rmSync(DIST, { recursive: true, force: true });
});

/** Edits a JSON file, runs `check`, and always restores the original bytes. */
async function withEdit(file, mutate, check) {
  const original = fs.readFileSync(file); // exact bytes
  try {
    const json = JSON.parse(original.toString('utf8'));
    const before = mutate(json);
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    expect(build().code, 'build with the edited JSON').toBe(0);
    await check.edited(before);
  } finally {
    fs.writeFileSync(file, original);
    expect(fs.readFileSync(file).equals(original), `${file} restored byte for byte`).toBe(true);
  }
  expect(build().code, 'build after restoring').toBe(0);
  await check.restored();
}

const CASES = [
  {
    name: 'homepage hero heading (data/pages/es/home.json)',
    file: 'data/pages/es/home.json',
    url: '/es/',
    mutate: (j) => {
      const h = j.blocks[0].children[0].children[0].children[1].parts[0];
      const before = h.html;
      h.html = TEST_VALUE;
      return before;
    },
    locator: 'h1.eb-ah-title',
  },
  {
    name: 'staff profile contact value (data/people/es/corcho-garcia-oscar.json)',
    file: 'data/people/es/corcho-garcia-oscar.json',
    url: '/es/personal/corcho-garcia-oscar/',
    mutate: (j) => {
      const before = j.contact[0].value;
      j.contact[0].value = TEST_VALUE;
      return before;
    },
    locator: '.eb-feature-list-item >> nth=0',
  },
  {
    name: 'news title (data/news/es/topdia.json) – post page and listings',
    file: 'data/news/es/topdia.json',
    url: '/es/topdia/',
    mutate: (j) => {
      const before = j.title;
      j.title = TEST_VALUE;
      return before;
    },
    locator: '.ast-single-entry-banner h1',
    alsoOn: ['/es/'], // homepage news grid
  },
  {
    name: 'menu label (data/navigation/en.json)',
    file: 'data/navigation/en.json',
    url: '/en/structure/',
    mutate: (j) => {
      const before = j.items[1].label;
      j.items[1].label = TEST_VALUE;
      return before;
    },
    locator: `#ast-hf-menu-1 > li >> nth=1`,
  },
];

for (const c of CASES) {
  test(`editing ${c.name}`, async ({ page }) => {
    let original;
    await withEdit(c.file, c.mutate, {
      edited: async (before) => {
        original = before;
        await page.goto(BASE + c.url);
        await expect(page.locator(c.locator)).toContainText(TEST_VALUE);
        for (const u of c.alsoOn || []) {
          await page.goto(BASE + u);
          await expect(page.locator('body')).toContainText(TEST_VALUE);
        }
      },
      restored: async () => {
        await page.goto(BASE + c.url);
        await expect(page.locator('body')).not.toContainText(TEST_VALUE);
        const text = original.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        await expect(page.locator(c.locator)).toContainText(text.split(/\s+/)[0]);
      },
    });
  });
}

test('no test value is left in any JSON file', () => {
  const hits = [];
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && fs.readFileSync(p, 'utf8').includes(TEST_VALUE)) hits.push(p);
    });
  walk('data');
  expect(hits).toEqual([]);
});

test.describe('invalid content makes the build fail with a clear message', () => {
  let tmp;
  test.beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'muia-data-'));
    fs.cpSync('data', tmp, { recursive: true });
  });
  test.afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const cases = [
    ['malformed JSON', (d) => fs.writeFileSync(path.join(d, 'news/es/topdia.json'), '{ "slug": "topdia", '), /news\/es\/topdia\.json.*not valid JSON/s],
    ['duplicate slug / path', (d) => {
      const a = JSON.parse(fs.readFileSync(path.join(d, 'news/es/topdia.json'), 'utf8'));
      a.slug = 'pedro_fellowaaia';
      a.path = '/es/pedro_fellowaaia/';
      a.wpId = 1;
      fs.writeFileSync(path.join(d, 'news/es/topdia.json'), JSON.stringify(a));
    }, /duplicate (slug|path)/],
    ['missing required field', (d) => {
      const a = JSON.parse(fs.readFileSync(path.join(d, 'people/es/corcho-garcia-oscar.json'), 'utf8'));
      delete a.name;
      fs.writeFileSync(path.join(d, 'people/es/corcho-garcia-oscar.json'), JSON.stringify(a));
    }, /people\/es\/corcho-garcia-oscar\.json[\s\S]*must have required property 'name'/],
    ['nonexistent image', (d) => {
      const a = JSON.parse(fs.readFileSync(path.join(d, 'people/es/corcho-garcia-oscar.json'), 'utf8'));
      a.photo.src = '/wp-content/uploads/does-not-exist.png';
      fs.writeFileSync(path.join(d, 'people/es/corcho-garcia-oscar.json'), JSON.stringify(a));
    }, /photo\.src: image "\/wp-content\/uploads\/does-not-exist\.png" does not exist/],
    ['invalid cross-reference (unknown tag)', (d) => {
      const a = JSON.parse(fs.readFileSync(path.join(d, 'people/es/corcho-garcia-oscar.json'), 'utf8'));
      a.tags = ['no-such-tag'];
      fs.writeFileSync(path.join(d, 'people/es/corcho-garcia-oscar.json'), JSON.stringify(a));
    }, /tags\[0\]: unknown tag "no-such-tag"/],
    ['broken internal link', (d) => {
      const a = JSON.parse(fs.readFileSync(path.join(d, 'navigation/es.json'), 'utf8'));
      a.items[0].url = '/es/no-existe/';
      fs.writeFileSync(path.join(d, 'navigation/es.json'), JSON.stringify(a));
    }, /items\[0\]\.url: link to "\/es\/no-existe\/" does not match any page/],
    ['invalid URL', (d) => {
      const a = JSON.parse(fs.readFileSync(path.join(d, 'pages/es/home.json'), 'utf8'));
      const walk = (bs) => bs.forEach((b) => (b.type === 'advanced-video' && (b.url = 'not a url'), b.children && walk(b.children)));
      walk(a.blocks);
      fs.writeFileSync(path.join(d, 'pages/es/home.json'), JSON.stringify(a));
    }, /url: must match format "uri"/],
  ];
  for (const [name, breakIt, message] of cases) {
    test(name, () => {
      breakIt(tmp);
      const r = build({ DATA_DIR: tmp, DIST_DIR: path.join(tmp, 'dist') });
      expect(r.code).not.toBe(0);
      expect(r.out.replace(/\\/g, '/')).toMatch(message);
    });
  }
});
