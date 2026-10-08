# Migration report

Static migration of **https://muia.dia.fi.upm.es/** — 2026-10-07.

## Source

| | |
|---|---|
| Target website | https://muia.dia.fi.upm.es/ (Máster Universitario en Inteligencia Artificial, DIA – ETSI Informáticos – UPM) |
| Detected CMS / technology | WordPress 6.7.1 (multisite), Astra 4.8.6 + Astra Pro, Gutenberg + Essential Blocks 5.0.4, Polylang (es/en), Yoast SEO, TablePress, WP Fastest Cache, jQuery; Elementor installed but unused (details: [site-audit.md](site-audit.md)) |
| Pages discovered | 197 URLs (196 HTML pages + 1 malformed link returning 404) |
| Pages migrated | 194 pages generated (all 196 reachable pages: `/` and `/en//` are served by the same files as `/es/` and `/en/`; `/estructura/` is a redirect page) + `404.html` |
| Assets migrated | 328 files in `public/` (230 images, 43 font files, theme/plugin icons and images) + 24 stylesheets and 12 scripts in `src/` |
| Downloadable documents migrated | 20 locally hosted documents (PDF/DOCX/XLSX) copied with their original URLs; ~60 external documents left linked ([documents-inventory.md](documents-inventory.md)) |

## Migrated

**Page types:** homepage (es/en), content pages (Estructura, Horarios, Admisión, Profesorado, Objetivos y competencias, Calidad, Gestión/Contacto – both languages), news posts, staff profiles, staff archive, news category archives, tag archives, author archive, search results, 404.

**Major sections:** everything in the main menu and the footer, including in-page sections reached by anchors (FAQs, subjects and seminars, TFM, title request, quality system, Euro-Inf).

**Functionality migrated:** desktop dropdown menus, mobile off-canvas menu, sticky/shrinking header, language switcher (to the translation of the current page), scroll-to-top, smooth anchor scrolling, entrance animations, animated counters, accordions, vertical tabs, video with poster, news grid with pagination, staff grids by category with filter button, Masonry archive grids with pagination, TablePress tables (DataTables scrolling), equal-height timetable boxes, search (`?s=`), sitemaps, robots.txt, SEO metadata and structured data, hreflang.

**Reusable components (templates / renderers):** base layout, Astra header (desktop, mobile, sticky copy), mobile drawer, footer with widgets and menu, single-post banner, latest-posts sidebar, archive card + pagination, author box, search form, 404; block renderers for wrapper, row, column, advanced heading, infobox, accordion, tabs, button, dual button, feature list, number counter, image, video, post grid, navigation, raw HTML; staff profile layout.

## Content model

| JSON | Controls |
|---|---|
| `data/pages/<lang>/<slug>.json` | content pages and homepages (block lists) |
| `data/news/<lang>/<slug>.json` | news posts |
| `data/people/<lang>/<slug>.json` | staff profiles (contact fields, biography, staff category) |
| `data/navigation/<lang>.json` | main menu (header, mobile and footer menus) |
| `data/footer/<lang>.json` | footer widgets and copyright |
| `data/taxonomies.json` | news categories, staff categories (tags) |
| `data/archives.json`, `data/authors.json` | listing pages (staff archive, author archive), post authors |
| `data/site.json` | site name, languages, interface strings, logo, defaults |
| `data/redirects.json`, `data/known-missing-files.json` | redirects; problems inherited from the original |

**Recurring entities and relationships:** pages ↔ translations; news posts → categories (category archives, homepage "Noticias destacadas" grid, latest-posts sidebar, author archive); staff profiles → staff categories (*Profesorado* grids, which are queries stored as `post-grid` blocks) and → staff archive; menu items → pages/categories.

**Editing:** change the JSON, then `npm run build` (or keep `npm run dev` running). Every build validates the content against `schemas/` and cross-references and stops with file, field and reason. See [content-model.md](content-model.md) and the README.

## JavaScript

- **Retained libraries (local copies, unchanged):** jQuery 3.7.1, Masonry 4.2.2 + jQuery shim, imagesLoaded 5, DataTables (TablePress build), Astra frontend, Astra Pro frontend, Essential Blocks animation loader, accordion, tabs, counter and shared helpers, animate.css, Font Awesome 5, Dashicons.
- **Removed libraries:** React, ReactDOM, react-player with hls.js/dash.js/flv.js, wp.apiFetch, wp.i18n, wp.hooks, wp.url, wp-polyfill, wp.element, jQuery Migrate, DOMPurify, prettyPhoto lightbox, Essential Addons for Elementor, Elementor lazy-load, emoji script, Polylang cookie script, the WP Fastest Cache bundles.
- **Reimplemented behaviours (`src/js/site/`):** video poster → YouTube on click; post-grid pagination and filter (same button logic as the plugin); search; equal-height timetable boxes (port of an inline jQuery snippet); DataTables initialisation from JSON.
- **Interactive features tested:** menus (hover, keyboard, mobile), tabs, accordions (also nested in tabs), counters, grid pagination, video, tables, search, language switcher, anchors.

## CMS dependencies

- **Removed:** PHP/WordPress rendering, database, REST API (`/wp-json/`), `admin-ajax.php`, XML-RPC, oEmbed, RSS feeds, Polylang cookie, Yoast's dynamic sitemaps (replaced by static ones), WP Fastest Cache, every `/wp-admin/`, `/wp-includes/`, `/wp-content/plugins|themes|cache/` reference (checked by the link checker and the tests).
- **Kept path:** `/wp-content/uploads/…` – uploaded images and documents keep their public URLs (they may be linked from elsewhere); they are plain static files.
- **Intentional external dependencies:** YouTube (video, loaded on click), external links (UPM course guides and regulations, research groups, news sources). No external service is needed to render a page.

## URLs

- **Preserved:** all 194 page URLs, uploaded media and document URLs, sitemap file names, `robots.txt`, the search URL pattern `/<lang>/?s=…`, pagination URLs `/page/N/`.
- **Changed:** none for pages. Theme/plugin assets moved from `/wp-content/plugins|themes/…` to `/assets/vendor/…`, Google Fonts to `/assets/fonts/google/…`, sister-site images to `/assets/external/<host>/…` (implementation files, not public content).
- **Redirects required:** `/estructura/` → `/es/estructura/` (HTML redirect generated; a server 301 is recommended, README → Deployment). `/en//` → `/en/` is handled by servers that merge slashes (nginx default).
- **Broken or unreachable source URLs:** `/en/https://muia.dia.fi.upm.es/en/access_admission_registration/` (malformed link in the original content, 404); not reproduced. WordPress-only endpoints are listed in [dynamic-features.md](dynamic-features.md).

Full table: [url-migration.md](url-migration.md).

## Testing

| Check | Result |
|---|---|
| JSON validation (`npm run validate`) | valid: 16 pages, 66 news posts, 74 profiles |
| Production build | 194 pages + 404, no errors |
| Content round-trip (extraction) | every Essential Blocks block and every staff profile re-renders to the original DOM: 0 differences |
| Structural DOM comparison with the original (`npm run compare-dom`, 194 pages) | header, menus, mobile menu, footer, banner and body classes identical everywhere; content identical except 4 archive excerpts (the original's cached listings disagree on a trailing "[…]") and the locally hosted author avatar (3 pages) |
| Broken internal links, missing images/CSS/JS/fonts/documents, invalid anchors, WordPress references (`npm run check-links`) | 0 errors; 17 warnings, all inherited from the original (malformed links, anchors that do not exist on the original either, files that were already 404) |
| External links (`--external`) | 266 checked; 52 broken/unreachable – all in the original content, left unchanged |
| Functional tests (Playwright) | 75/75 passed (navigation, pages, posts, profiles, archives, interactive components, search, 404, redirects, responsive, network, local-only, no-JS, SEO, accessibility, JSON editing) |
| Responsive (390, 768, 1024, 1440, 1920) | no page overflows horizontally more than the original page does (the original homepages overflow at every width and are reproduced) |
| Console errors / failed requests | none on any tested page |
| JSON modification/restoration tests | 4 real records edited (homepage heading, profile contact, news title – also checked on the homepage grid –, menu label), rebuilt, verified, restored byte for byte, rebuilt, verified; plus 7 invalid-content cases (malformed JSON, duplicate slug, missing field, missing image, unknown tag, broken link, invalid URL) that make the build fail with the expected message |
| Local-only / CMS-independence | all 17 representative pages render with CSS, theme fonts, images and working scripts with every non-local host blocked; no request to the original server; content readable without JavaScript |
| Visual regression (17 pages × 5 viewports vs. the original) | 85/85 passed (threshold 1 % differing pixels, 2 % for the news category archive); typical difference 0.00–0.06 % |
| SEO metadata vs. original (all pages) | title, description, robots, canonical, hreflang, Open Graph, `og:type`, JSON-LD types identical |

### Final test run

`npm test` (build → link check → all Playwright projects) on 2026-10-07: **exit code 0 – link check 0 errors, 160/160 Playwright tests passed** (75 functional, including the JSON editing and invalid-content tests, + 85 visual) in 8.9 minutes.

## Known differences

Visual/functional differences from the original that remain:

1. **Search**: results are computed in the browser from a build-time index with an accent-insensitive "all words" match; WordPress used SQL `LIKE` over titles and content, so the set and order of results can differ slightly. Result cards follow the original layout, with the excerpt linked to the page (the original card had no link when a result had no image).
2. **Post grids** contain all their items in the HTML (pagination in the browser); the original loaded later pages from the REST API. Visually identical.
3. **Video**: the YouTube iframe is created by a small script instead of react-player; same poster, icon and behaviour (plays on click).
4. **Structured data**: the JSON-LD graph is regenerated; types and key fields match, some secondary properties may differ (e.g. word count of pages, image captions in archives).
5. **RSS feeds, REST API, oEmbed, short links** are not available (no `<link>` tags for them either).
6. **Excerpts** of four archive cards end with/without "[…]" differently from one specific original listing (the original's cached pages were inconsistent).
7. **Fonts** are the same Google Fonts files, self-hosted.
8. Problems of the original kept on purpose (listed in [site-audit.md](site-audit.md) §9): broken images and links, stray "<" on English profiles, three profiles without block styles, multiple `<h1>` per page, images without `alt`, horizontal overflow of the homepages.
9. **Baseline source**: the reference screenshots come from the crawl cache of the live site (the live server started rejecting headless Chromium during the work); the cache reproduces the live site's responses exactly.
