// Content validation: JSON schemas (schemas/*.json) + cross-reference checks.
//
//   npm run validate
//
// Every problem names the JSON file, the offending field and the reason.
// The build runs the same checks and refuses to build invalid content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|zip)$/i;

function makeAjv(root) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const f of fs.readdirSync(path.join(root, 'schemas'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(root, 'schemas', f), 'utf8')));
  return ajv;
}

/** Walks all blocks (including nested ones) of a block list. */
function* walkBlocks(blocks, trail = 'blocks') {
  for (const [i, b] of (blocks || []).entries()) {
    const here = `${trail}[${i}]`;
    yield [b, here];
    if (b.children) yield* walkBlocks(b.children, `${here}.children`);
    for (const [j, it] of (b.items || []).entries()) if (it.children) yield* walkBlocks(it.children, `${here}.items[${j}].children`);
    for (const [j, t] of (b.tabs || []).entries()) if (t.children) yield* walkBlocks(t.children, `${here}.tabs[${j}].children`);
  }
}

export function validate(data, root, dataDir = path.join(root, 'data')) {
  const problems = [];
  const add = (file, field, message) => problems.push({ file, field, message });
  const ajv = makeAjv(root);

  const check = (schemaId, rec) => {
    const v = ajv.getSchema(schemaId);
    if (!v(rec))
      for (const e of v.errors) {
        if (e.keyword === 'if') continue;
        const field = (e.instancePath || '/').replace(/^\//, '').replace(/\//g, '.') || '(record)';
        const detail = e.keyword === 'additionalProperties' ? `unknown field "${e.params.additionalProperty}"` : e.keyword === 'enum' ? `${e.message}: ${e.params.allowedValues.join(', ')}` : e.message;
        add(rec.__file, field, detail);
      }
  };
  for (const r of data.pages) check('page.schema.json', r);
  for (const r of data.news) check('news.schema.json', r);
  for (const r of data.people) check('person.schema.json', r);
  for (const lang of Object.keys(data.navigation)) check('navigation.schema.json', data.navigation[lang]);

  // Duplicate identifiers.
  const all = [...data.pages, ...data.news, ...data.people];
  const seen = { path: new Map(), slug: new Map(), wpId: new Map() };
  for (const r of all) {
    for (const key of ['path', 'wpId']) {
      if (r[key] === undefined) continue;
      if (seen[key].has(r[key])) add(r.__file, key, `duplicate ${key} "${r[key]}" (also used by ${seen[key].get(r[key])})`);
      else seen[key].set(r[key], r.__file);
    }
    const slugKey = `${path.dirname(r.__file)}/${r.slug}`;
    if (seen.slug.has(slugKey)) add(r.__file, 'slug', `duplicate slug "${r.slug}" (also used by ${seen.slug.get(slugKey)})`);
    else seen.slug.set(slugKey, r.__file);
    if (r.slug && r.path && !r.isHome && !r.path.endsWith(`/${r.slug}/`)) add(r.__file, 'path', `path "${r.path}" does not end with the slug "${r.slug}"`);
    if (r.lang && r.path && !r.path.startsWith(`/${r.lang}/`)) add(r.__file, 'path', `path "${r.path}" does not start with the language "/${r.lang}/"`);
  }

  // References to other content.
  const paths = new Set([
    ...all.map((r) => r.path),
    ...Object.values(data.taxonomies.category).map((t) => t.path),
    ...Object.values(data.taxonomies.post_tag).map((t) => t.path),
    ...Object.values(data.archives.people).map((a) => a.path),
    ...data.archives.authors.flatMap((a) => Object.keys(data.site.languages).map((l) => `/${l}/author/${a.slug}/`)),
    ...data.redirects.map((r) => r.from),
    '/',
  ]);
  const publicFile = (url) => {
    const clean = decodeURIComponent(url.split(/[?#]/)[0]);
    return fs.existsSync(path.join(root, 'public', clean));
  };
  // Known broken on the original site (documented in docs/site-audit.md); reported as warnings by the link checker instead.
  const knownMissing = new Set(readKnownMissing(dataDir));
  const checkLocalUrl = (file, field, url, { kind = 'link' } = {}) => {
    if (!url || !url.startsWith('/') || url.startsWith('//')) return;
    const clean = url.split(/[?#]/)[0];
    if (/^\/(wp-content|assets)\//.test(clean)) {
      if (!publicFile(clean) && !knownMissing.has(clean)) add(file, field, `${DOC_EXT.test(clean) ? 'document' : kind === 'image' ? 'image' : 'file'} "${clean}" does not exist in public/`);
      return;
    }
    if (kind === 'image') return add(file, field, `image "${url}" is not under /wp-content/ or /assets/`);
    if (!paths.has(clean) && !knownMissing.has(clean)) add(file, field, `link to "${clean}" does not match any page`);
  };
  const checkHtml = (file, field, html) => {
    for (const m of String(html).matchAll(/\b(href|src)="([^"]+)"/g)) checkLocalUrl(file, field, m[2].replace(/&amp;/g, '&'), { kind: m[1] === 'src' ? 'image' : 'link' });
  };
  const tagSlugs = new Set(Object.keys(data.taxonomies.post_tag));
  const catSlugs = new Set(Object.keys(data.taxonomies.category));

  for (const r of all) {
    const f = r.__file;
    for (const [lang, p] of Object.entries(r.translations || {})) {
      if (!data.site.languages[lang]) add(f, `translations.${lang}`, `unknown language "${lang}"`);
      else if (!paths.has(p)) add(f, `translations.${lang}`, `translation "${p}" does not exist`);
    }
    for (const [i, t] of (r.tags || []).entries()) if (!tagSlugs.has(t)) add(f, `tags[${i}]`, `unknown tag "${t}" (not in data/taxonomies.json)`);
    for (const [i, c] of (r.categories || []).entries()) if (!catSlugs.has(c)) add(f, `categories[${i}]`, `unknown category "${c}" (not in data/taxonomies.json)`);
    if (r.author && !data.authors[r.author]) add(f, 'author', `unknown author "${r.author}" (not in data/authors.json)`);
    for (const key of ['featuredImage', 'listImage', 'photo']) if (r[key]) checkLocalUrl(f, `${key}.src`, r[key].src, { kind: 'image' });
    if (r.stylesheet && !fs.existsSync(path.join(root, 'src/css', r.stylesheet))) add(f, 'stylesheet', `stylesheet src/css/${r.stylesheet} does not exist`);
    if (r.styleVariant && r.styleVariant !== 'none' && !fs.existsSync(path.join(root, 'src/css/blocks/people', `${r.styleVariant}.css`))) add(f, 'styleVariant', `no stylesheet src/css/blocks/people/${r.styleVariant}.css`);
    if (r.excerpt) checkHtml(f, 'excerpt', r.excerpt);
    for (const c of r.contact || []) if (c.href) checkLocalUrl(f, 'contact.href', c.href);
    for (const list of ['blocks', 'biography', 'afterProfile']) {
      for (const [b, where] of walkBlocks(r[list], list)) {
        if (b.type === 'html') checkHtml(f, where, b.html);
        for (const k of ['src', 'poster']) if (b[k]) checkLocalUrl(f, `${where}.${k}`, b[k], { kind: 'image' });
        if (b.image?.src) checkLocalUrl(f, `${where}.image.src`, b.image.src, { kind: 'image' });
        for (const k of ['href']) if (b[k]) checkLocalUrl(f, `${where}.${k}`, b[k]);
        if (b.link?.href) checkLocalUrl(f, `${where}.link.href`, b.link.href);
        for (const btn of b.buttons || []) checkLocalUrl(f, `${where}.buttons`, btn.href);
        for (const p of b.parts || []) if (p.html) checkHtml(f, `${where}.parts`, p.html);
        for (const it of b.items || []) {
          if (it.href) checkLocalUrl(f, `${where}.items`, it.href);
          if (it.title) checkHtml(f, `${where}.items.title`, it.title);
          if (it.content) checkHtml(f, `${where}.items.content`, it.content);
        }
        if (b.description) checkHtml(f, `${where}.description`, b.description);
        if (b.type === 'post-grid') {
          for (const t of b.tags || []) if (!tagSlugs.has(t)) add(f, `${where}.tags`, `unknown tag "${t}"`);
          for (const c of b.categories || []) if (!catSlugs.has(c)) add(f, `${where}.categories`, `unknown category "${c}"`);
        }
      }
    }
  }

  // Navigation and footer.
  for (const [lang, nav] of Object.entries(data.navigation)) {
    const walk = (items, trail) =>
      items.forEach((it, i) => {
        checkLocalUrl(nav.__file, `${trail}[${i}].url`, it.url);
        if (it.children) walk(it.children, `${trail}[${i}].children`);
      });
    walk(nav.items || [], 'items');
  }
  for (const [lang, footer] of Object.entries(data.footer))
    footer.columns.forEach((c, i) => c.widgets.forEach((w, j) => w.html && checkHtml(footer.__file, `columns[${i}].widgets[${j}].html`, w.html)));
  for (const [slug, t] of Object.entries(data.taxonomies.category)) if (t.parent && !catSlugs.has(t.parent)) add(data.taxonomies.__file, `category.${slug}.parent`, `unknown parent category "${t.parent}"`);
  for (const r of data.redirects) if (!paths.has(r.to)) add(data.redirects.__file, r.from, `redirect target "${r.to}" does not exist`);
  return problems;
}

function readKnownMissing(dataDir) {
  const f = path.join(dataDir, 'known-missing-files.json');
  if (!fs.existsSync(f)) return [];
  const k = JSON.parse(fs.readFileSync(f, 'utf8'));
  return [...k.files, ...(k.links || [])].map((x) => x.path);
}

// CLI
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { loadData } = await import('../build/lib/data.mjs');
  const data = loadData(path.join(root, 'data'));
  const problems = validate(data, root);
  if (!problems.length) {
    console.log(`Content is valid (${data.pages.length} pages, ${data.news.length} news posts, ${data.people.length} people).`);
  } else {
    for (const p of problems) console.error(`${p.file}\n  ${p.field}: ${p.message}`);
    console.error(`\n${problems.length} problem(s) found.`);
    process.exit(1);
  }
}
