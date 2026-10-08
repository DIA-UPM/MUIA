# MUIA – static website

Static recreation of **https://muia.dia.fi.upm.es/** (Máster Universitario en Inteligencia Artificial, Departamento de Inteligencia Artificial, UPM), migrated from WordPress. The site looks and behaves like the original, keeps its URLs, and no longer needs WordPress, PHP or a database: the content lives in **JSON files** (`data/`) and a small Node.js build turns them into plain HTML/CSS/JS (`dist/`) that any web server can host.

- What was found on the original site and why each piece was kept, replaced or dropped: [docs/site-audit.md](docs/site-audit.md)
- How the content is organised: [docs/content-model.md](docs/content-model.md)
- URL by URL: [docs/url-migration.md](docs/url-migration.md) · documents: [docs/documents-inventory.md](docs/documents-inventory.md) · server-side features: [docs/dynamic-features.md](docs/dynamic-features.md) · visual baseline: [docs/visual-baseline.md](docs/visual-baseline.md) · final report: [docs/migration-report.md](docs/migration-report.md)

## Architecture

```
data/*.json  ──┐
src/templates ─┼─►  npm run build  ──►  dist/   (static HTML + assets, deploy this)
src/css, src/js┘          │
public/  (images, documents, fonts – copied as they are)
```

- **Templates** (`src/templates/`, [Nunjucks](https://mozilla.github.io/nunjucks/)): `base.njk` (head, header, footer, scripts), `pages/page.njk`, `post.njk`, `person.njk`, `archive.njk`, `404.njk`, partials for the header, mobile menu, footer and search form. The markup is the Astra/WordPress markup of the original, so the original stylesheets and scripts work unchanged.
- **Blocks** (`scripts/build/lib/blocks.mjs`): page content is a list of blocks (headings, accordions, tabs, buttons, counters, grids …) rendered to the original Essential Blocks markup. Post grids (`postgrid.mjs`) are queries over the news/people collections.
- **Menus** (`menu.mjs`), **SEO tags and JSON-LD** (`seo.mjs`), **staff profile layout** (`person.mjs`), **asset bundles** (`assets.mjs`).
- **Styles** (`src/css/`): `vendor/` (theme and plugin CSS copied from the original, only what the pages use), `theme/` (Astra customizer output per page context), `site/` (site CSS: fonts, presets, customizer "Additional CSS", additions of the migration), `blocks/` (per-page block styles). The build concatenates them, in the original cascade order, into `dist/assets/css/<context>.css` + per-page block CSS + `site.css`.
- **Scripts** (`src/js/`): `vendor/` (Astra, Astra Pro, jQuery, Masonry, DataTables, Essential Blocks accordion/tabs/counter/animations – unchanged), `site/` (replacements for CMS-dependent features: video, post-grid pagination, search, timetable heights, tables), `config/theme.json` (options the theme scripts expect). Bundled into `dist/assets/js/main.js` (+ `tables.js` on the timetable pages).
- No framework, no client-side rendering: every page is complete HTML; JavaScript only adds interaction (menus, accordions, tabs, animations, pagination, search).

## Prerequisites

- **Node.js 20 or newer** (tested with 24) and npm
- For the tests: Playwright's Chromium (`npx playwright install chromium`)

## Installation

```bash
npm install
```

```bash
npx playwright install chromium
```

## Development

```bash
npm run dev
```

Builds the site, serves `dist/` at http://localhost:8080/ and rebuilds automatically when anything in `data/`, `src/` or `public/` changes (reload the browser after saving).

`npm run serve` serves the current `dist/` without rebuilding (`--port` to change the port).

## Building

```bash
npm run build
```

Validates the content (fails with a clear message if a JSON file is invalid) and writes the complete site to `dist/` (≈195 pages, assets, sitemaps, `robots.txt`, `404.html`, search index). Set `DIST_DIR` to build elsewhere.

## Editing content

All content is in `data/`. Common tasks:

| I want to change… | File |
|---|---|
| text of a page (Estructura, Horarios, Admisión …) | `data/pages/es/<slug>.json` (English: `data/pages/en/…`) – search the file for the text and edit the `html` value next to it |
| the homepage | `data/pages/es/home.json`, `data/pages/en/home.json` |
| the main menu | `data/navigation/es.json`, `data/navigation/en.json` |
| a news post | `data/news/<lang>/<slug>.json` |
| a staff profile (office, phone, e-mail, web, biography …) | `data/people/<lang>/<slug>.json` |
| the footer | `data/footer/<lang>.json` |
| interface texts ("Siguiente", search labels …) | `data/site.json` → `languages.<lang>.strings` |

Text values may contain HTML (`<strong>`, `<a href="…">`, `<br>`). Links to other pages of the site are written as paths (`/es/estructura/`). Then run `npm run build` (or keep `npm run dev` running) and check the page.

`npm run validate` checks the content without building: JSON syntax, required fields, duplicate slugs/paths/ids, unknown tags/categories/authors, missing images or documents, broken internal links and invalid URLs. Every problem names the file, the field and the reason, e.g.

```
data/people/es/corcho-garcia-oscar.json
  photo.src: image "/wp-content/uploads/sites/6/2017/05/x.png" does not exist in public/
```

### JSON organisation

See [docs/content-model.md](docs/content-model.md) for every field. In short:

- `data/pages/<lang>/<slug>.json` – `title`, `path`, `seo`, `translations`, `blocks` (the content)
- `data/news/<lang>/<slug>.json` – `title`, `date`, `categories`, `featuredImage`, `excerpt`, `blocks`
- `data/people/<lang>/<slug>.json` – `name`, `photo`, `contact` (list of label/value lines), `biography`, `tags` (staff category)
- `data/taxonomies.json` – categories and tags; `data/navigation/*.json`, `data/footer/*.json`, `data/site.json`, `data/archives.json`

The block types (`html`, `advanced-heading`, `accordion`, `advanced-tabs`, `button`, `infobox`, `feature-list`, `number-counter`, `post-grid`, …) are documented in the content model. Keep the `id` of existing blocks: the styles of each block are attached to it.

### Adding a page

1. Copy an existing page with a similar layout, e.g. `data/pages/es/calidad.json` → `data/pages/es/nueva-pagina.json`.
2. Change `slug` (`nueva-pagina`), `path` (`/es/nueva-pagina/`), `title`, `seo.title`, `wpId` (any unused number), remove `translations` (or link it to the English version), and edit the `blocks`.
3. If you keep the copied blocks, keep `stylesheet` pointing to the copied page's CSS (the blocks keep their look); new blocks of an existing kind can reuse ids from that stylesheet.
4. Add it to the menu in `data/navigation/es.json` (`{ "id": <unused number>, "label": "…", "url": "/es/nueva-pagina/", "kind": "page" }`).
5. `npm run build`.

### Adding a news post

Copy a post in `data/news/es/` (one with an image, e.g. `topdia.json`, or without), change `slug`, `path` (`/es/<slug>/`), `title`, `date` (ISO, newer dates appear first), `categories` (`["noticias-es"]`, add `"noticias-destacadas"` to show it on the homepage, `"actualidad-es"` for *Actualidad*), `featuredImage`/`listImage`, `excerpt`, `blocks`, `seo`. Category archives, pagination, the homepage grid, the sidebars, the search index and the sitemap update automatically.

### Adding a staff member

Copy a profile in `data/people/es/`, set `slug`, `path` (`/es/personal/<slug>/`), `name` ("Surname, Name"), `photo`, `listImage`, `contact`, `biography`, `date` (the staff archive lists newest first) and `tags` (`catedraticos-de-universidad`, `profesores-titulares-de-universidad`, `profesores-contratados-doctores`, `profesores-permanentes-laborales`, `profesores-ayudantes-doctores`, `investigador-del-programa-beatriz-galindo`; English profiles use the English tags). The teaching-staff page grids pick the person up from `tags`. Create the English version in `data/people/en/` and link both with `translations`.

## Assets

- Uploaded media and documents keep their original public URLs: `public/wp-content/uploads/sites/6/…` → `/wp-content/uploads/sites/6/…`. Put new images/PDFs anywhere under `public/` (e.g. `public/wp-content/uploads/sites/6/2026/10/…` or `public/assets/images/…`) and reference them by path.
- Theme/plugin images and fonts: `public/assets/vendor/…`, Google Fonts: `public/assets/fonts/google/…`, images of other sites shown on the pages: `public/assets/external/<host>/…`.
- Files that were already missing on the original site are listed in `data/known-missing-files.json`.

## Testing

```bash
npm test
```

Builds the site, checks links and assets, then runs all Playwright tests. Individual suites:

| Command | What |
|---|---|
| `npm run validate` | content validation (JSON Schemas + cross-references) |
| `npm run check-links` | broken internal links, missing images/CSS/JS/fonts/documents, invalid anchors, malformed URLs, WordPress runtime references (`--external` also checks external links) |
| `npm run test:functional` | navigation (desktop, dropdowns, mobile drawer, language switcher, logo), homepage, every page/post/profile against its JSON, tabs, accordions, counters, grids, video, tables, search, 404, redirects, responsive overflow, console errors and failed requests, local-only (all other hosts blocked) and no-JavaScript rendering, SEO metadata vs. the original, accessibility basics, **JSON editing tests** (edit → rebuild → check → restore → rebuild → check; the files are always restored byte for byte) and invalid-content tests |
| `npm run test:visual` | full-page screenshots of 17 representative pages × 5 viewports (1920, 1440, 1024, 768, 390) compared with `tests/reference/` |
| `npm run compare-dom` | structural DOM comparison of every page with the crawled original (needs `.cache/crawl`) |

Reports: `playwright-report/index.html`, `test-results/` (link check, visual diff images `test-results/visual/*-side.png` = original | static | differences).

The SEO comparison and `compare-dom` need the crawl cache (`npm run crawl`); they are skipped without it.

## Crawler (migration tools)

The tools that produced `data/`, `src/css`, `src/js/vendor` and `public/` live in `scripts/crawl/` and are not part of the website. They are kept so the migration can be reproduced or refreshed:

```bash
npm run crawl
```

1. `crawl.mjs` – discovers every public page (Yoast sitemaps + internal links, breadth-first), stores responses in `.cache/crawl/http/` (requests one at a time, 400 ms apart, cached forever: re-running does not download again; `--refresh` forces it).
2. `render.mjs` – renders every page in Chromium to record the resources the final page really loads (lazy images, fonts requested by CSS, script-injected resources).
3. `assets.mjs` – downloads referenced resources (HTML attributes incl. `srcset`/`data-*`, CSS `url()`/`@import`, rendered requests, documents) and classifies them: A needed, B CMS-only, C duplicate, D broken, E external.

Then (overwrites `data/`!):

```bash
npm run migrate:extract
```

`extract.mjs` (pages, posts, profiles, taxonomies → JSON, with a render-back check of every block), `extract-site.mjs` (settings, menus, footer, block stylesheets), `import-vendor.mjs` (stylesheets, scripts, fonts, media). `report-docs.mjs` regenerates the inventories in `docs/`. `npm run baseline` captures the reference screenshots (`--mirror` uses the crawl cache instead of the live server).

## Deployment

Upload the contents of `dist/` to any static host. Recommended server settings:

**nginx**

```nginx
server {
    root /var/www/muia/dist;
    index index.html;
    error_page 404 /404.html;
    merge_slashes on;
    location = /estructura/ { return 301 /es/estructura/; }
    location / { try_files $uri $uri/ =404; }
    location /assets/ { expires 30d; }
}
```

**Apache (`.htaccess`)**

```apache
DirectoryIndex index.html
ErrorDocument 404 /404.html
Redirect 301 /estructura/ /es/estructura/
```

**Netlify / similar**: publish `dist/`; `404.html` is used automatically. The redirect also works without server rules (an HTML redirect page is generated), but a real 301 is better for search engines.

### Public URL and sub-folders

Canonical URLs, hreflang, sitemaps and Open Graph URLs use `data/site.json → origin` (`https://muia.dia.fi.upm.es`). Override it at build time with `SITE_URL`; if the URL has a path, every internal link, image, stylesheet and script is prefixed with it, so the site can live in a sub-folder:

```bash
SITE_URL=https://usuario.github.io/repositorio SITE_NOINDEX=1 npm run build
```

`SITE_NOINDEX=1` marks every page `noindex` and writes a `robots.txt` that disallows crawling (for temporary copies, so they do not compete with the real site). Preview a sub-folder build locally with `SITE_URL=http://localhost:8080/repositorio npm run build` and `node scripts/serve.mjs --prefix /repositorio` (in Git Bash, prefix the command with `MSYS_NO_PATHCONV=1`).

### GitHub Pages

`.github/workflows/deploy.yml` builds, checks the links and publishes the site on every push to `main`:

1. Push the repository to GitHub (branch `main`).
2. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
3. Optional, while the address is temporary: *Settings → Secrets and variables → Actions → Variables* → `SITE_NOINDEX` = `1`.
4. Push to `main` (or run the workflow from the *Actions* tab). The site is published at `https://usuario.github.io/repositorio/`; the address is detected automatically.

**Changing to the final domain** (no code changes): add the domain in *Settings → Pages → Custom domain* and create the DNS record it asks for (a `CNAME` to `usuario.github.io`); delete the `SITE_NOINDEX` variable and run the workflow again. The build then uses the domain as the root (no sub-folder). If the site is hosted somewhere else, set the repository variable `SITE_URL` (or change `origin` in `data/site.json`) and rebuild.

On GitHub Pages, `/estructura/` uses the generated HTML redirect (no server rules), and `robots.txt` only takes effect when the site is at the root of a domain.
