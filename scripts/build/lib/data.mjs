// Loads every JSON file under data/. Each record remembers the file it came
// from (non-enumerable `__file`) so that validation errors can point to it.
import fs from 'node:fs';
import path from 'node:path';

export class DataError extends Error {
  constructor(file, message) {
    super(`${file}: ${message}`);
    this.file = file;
  }
}

function readJson(file, root) {
  const rel = path.relative(path.dirname(root), file).replace(/\\/g, '/');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new DataError(rel, `cannot be read (${err.code})`);
  }
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object') Object.defineProperty(value, '__file', { value: rel, enumerable: false });
    return value;
  } catch (err) {
    // Point to the line of the syntax error.
    const pos = Number((err.message.match(/position (\d+)/) || [])[1]);
    const line = Number.isFinite(pos) ? text.slice(0, pos).split('\n').length : null;
    throw new DataError(rel, `is not valid JSON${line ? ` (line ${line})` : ''}: ${err.message}`);
  }
}

function readCollection(dir, root) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const lang of fs.readdirSync(dir).sort())
    for (const f of fs.readdirSync(path.join(dir, lang)).sort())
      if (f.endsWith('.json')) {
        const rec = readJson(path.join(dir, lang, f), root);
        out.push(rec);
      }
  return out;
}

export function loadData(root) {
  try {
    const data = {
      site: readJson(path.join(root, 'site.json'), root),
      taxonomies: readJson(path.join(root, 'taxonomies.json'), root),
      authors: readJson(path.join(root, 'authors.json'), root),
      archives: readJson(path.join(root, 'archives.json'), root),
      redirects: readJson(path.join(root, 'redirects.json'), root),
      navigation: {},
      footer: {},
      pages: readCollection(path.join(root, 'pages'), root),
      news: readCollection(path.join(root, 'news'), root),
      people: readCollection(path.join(root, 'people'), root),
    };
    for (const lang of Object.keys(data.site.languages)) {
      data.navigation[lang] = readJson(path.join(root, 'navigation', `${lang}.json`), root);
      data.footer[lang] = readJson(path.join(root, 'footer', `${lang}.json`), root);
    }
    return data;
  } catch (err) {
    if (err instanceof DataError) {
      console.error(`\nContent error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}
