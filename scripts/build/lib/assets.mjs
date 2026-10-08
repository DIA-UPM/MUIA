// Stylesheet and script bundles.
//
// The order of the files reproduces the cascade of the original WordPress pages:
//
//   1. <context>.css  – fonts, theme, WordPress/plugin styles and the Astra
//                       "dynamic" stylesheet of the page context (page, post …)
//   2. blocks/…css    – per-page Essential Blocks styles (when the page has blocks)
//   3. site.css       – styles that the original printed after the block styles
//
// Bundles get a content hash in the query string so browsers re-download them
// only when they change.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CSS = 'src/css';

export const CONTEXTS = {
  // context name: [Astra theme dynamic CSS, Astra Pro dynamic CSS]
  page: ['theme-page', 'addon-single'],
  post: ['theme-post', 'addon-single'],
  person: ['theme-person', 'addon-single'],
  'person-archive': ['theme-person-archive', 'addon-archive'],
  category: ['theme-category', 'addon-archive'],
  'category-news': ['theme-category-news', 'addon-archive'],
  tag: ['theme-tag', 'addon-archive'],
  author: ['theme-author', 'addon-archive'],
};

const head = (theme, addon) => [
  'site/fonts.css',
  'site/images.css',
  'vendor/astra/main.min.css',
  `theme/${theme}.css`,
  'vendor/wordpress/block-library.min.css',
  'site/global-styles.css',
  'vendor/wordpress/dashicons.min.css',
  'vendor/elementor/frontend.min.css',
  'vendor/astra-addon/astra-addon.css',
  `theme/${addon}.css`,
  'vendor/tablepress/tablepress.min.css',
  'vendor/font-awesome-5/fontawesome.css',
  'vendor/font-awesome-5/solid.css',
  'vendor/essential-blocks/editor.css',
  'site/essential-blocks-globals.css',
];

const tail = [
  'vendor/essential-blocks/reusable-7274.css',
  'vendor/essential-blocks/widgets.css',
  'site/custom.css',
  'vendor/essential-blocks/animate.min.css',
  'vendor/essential-blocks/fontawesome-all.min.css',
  'vendor/essential-blocks/eb-common.css',
  'site/duotone.css',
  'site/site.css',
];

export const SCRIPTS = {
  // Loaded on every page, in this order.
  main: [
    'vendor/jquery.min.js',
    'vendor/imagesloaded.min.js',
    'vendor/masonry.min.js',
    'vendor/jquery.masonry.min.js',
    'vendor/astra-frontend.min.js',
    'vendor/astra-addon.js',
    'vendor/eb-frontend-controls.js',
    'vendor/eb-animation-load.js',
    'vendor/eb-accordion.js',
    'vendor/eb-tabs.js',
    'vendor/eb-counter.js',
    'site/video.js',
    'site/post-grid.js',
    'site/equal-heights.js',
    'site/search.js',
  ],
  // Only on pages with TablePress tables.
  tables: ['vendor/jquery.datatables.min.js', 'site/tables.js'],
};

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function write(dist, rel, content) {
  const f = path.join(dist, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return `/${rel.replace(/\\/g, '/')}?v=${hash(content)}`;
}

function concat(root, dir, files) {
  return files
    .map((f) => {
      const p = path.join(root, dir, f);
      if (!fs.existsSync(p)) throw new Error(`Missing ${dir}/${f}`);
      return `/* ${f} */\n${fs.readFileSync(p, 'utf8')}`;
    })
    .join('\n');
}

/** Builds all bundles into dist/assets and returns their URLs. */
export function buildAssets(root, dist) {
  const urls = { css: {}, blocks: {}, js: {} };
  for (const [name, [theme, addon]] of Object.entries(CONTEXTS)) urls.css[name] = write(dist, `assets/css/${name}.css`, concat(root, CSS, head(theme, addon)));
  urls.css.site = write(dist, 'assets/css/site.css', concat(root, CSS, tail));
  // Block stylesheets are published one-to-one.
  const blocksDir = path.join(root, CSS, 'blocks');
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else {
        const rel = path.relative(path.join(root, CSS), p).replace(/\\/g, '/');
        urls.blocks[rel] = write(dist, `assets/css/${rel}`, fs.readFileSync(p, 'utf8'));
      }
    }
  };
  walk(blocksDir);
  for (const [name, files] of Object.entries(SCRIPTS)) urls.js[name] = write(dist, `assets/js/${name}.js`, concat(root, 'src/js', files));
  return urls;
}
