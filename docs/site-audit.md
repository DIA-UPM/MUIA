# Site audit – https://muia.dia.fi.upm.es/

Audit of the public website of the *Máster Universitario en Inteligencia Artificial* (MUIA, Departamento de Inteligencia Artificial, ETSI Informáticos, Universidad Politécnica de Madrid), carried out on 2026-10-07 before the migration. Raw data: `.cache/crawl/` (crawler output, not committed); summaries: `docs/crawl-report.md`, `docs/url-migration.md`, `docs/documents-inventory.md`.

## 1. Technology

| Layer | Found | Evidence |
|---|---|---|
| CMS | **WordPress 6.7.1**, multisite (site id 6 – uploads under `/wp-content/uploads/sites/6/`) | `<meta name="generator">`, `/wp-json/`, `/xmlrpc.php` |
| Theme | **Astra 4.8.6** + child theme `astra-child` (empty stylesheet) + **Astra Pro (astra-addon) 4.8.6** | `wp-content/themes/astra`, `astra-addon-*.css/js`, body classes `ast-*` |
| Page content | **Gutenberg** with **Essential Blocks 5.0.4** (wrapper, row, column, advanced heading, infobox, accordion, advanced tabs, button, dual button, feature list, number counter, advanced image, advanced video, post grid, advanced navigation) and a few core blocks (paragraph, list, heading, image, separator, table, spacer) | `wp-block-essential-blocks-*` classes |
| Page builder | **Elementor 3.25** and *Header Footer Elementor* / *Essential Addons for Elementor* are installed and load assets, but no page uses Elementor widgets (header and footer are Astra's header/footer builder) | stylesheet coverage analysis, no `elementor-widget-*` in any page |
| Tables | **TablePress 2.4** + DataTables (jQuery) | `tablepress-*` tables on the timetable pages |
| Multilingual | **Polylang** – Spanish (`/es/`, default, also served at `/`) and English (`/en/`) | `hreflang` alternates, `lang-item` menu items, `pll_language` cookie |
| SEO | **Yoast SEO 23.9** – titles, descriptions, Open Graph, Twitter cards, JSON-LD graph, XML sitemaps | `<!-- This site is optimized with the Yoast SEO plugin -->` |
| Caching | **WP Fastest Cache** – combined/minified CSS & JS bundles (`/wp-content/cache/…/wpfc-minified/`) with the original `<link>` tags left in HTML comments | page source |
| Other plugins (assets only) | WP Video Lightbox (prettyPhoto), Video Background, SVG Support, PDF Embedder, ACF (profile fields) | stylesheet/script URLs |
| Libraries | jQuery 3.7.1 (+ migrate), Masonry 4.2.2 + imagesLoaded 5, DataTables, React 18 + react-player (hls/dash/flv) for the video block, wp.apiFetch, DOMPurify, animate.css (EB build), Font Awesome 5 (two copies), Dashicons, Swiper (unused) | network log of the rendered pages |
| Fonts | Google Fonts: Syne, Noto Sans Hanunoo, Open Sans, Chivo, Red Hat Display, Space Grotesk, Urbanist | `fonts.googleapis.com` links |
| Server | Apache, PHP 8.4 | response headers |

## 2. Information architecture

Main menu (same structure in both languages, see `data/navigation/*.json`):

- **Presentación / Presentation** (homepage) → Objetivos y competencias, Profesorado, Preguntas frecuentes (`/es/#faq_generales`)
- **Estructura / Structure** → Asignaturas y seminarios, Planificación de las enseñanzas, Trabajo Fin de Máster, Solicitud del título, FAQs (in-page anchors)
- **Horarios / Timetables**
- **Admisión / Access, admission and registration**
- **Calidad / Quality** → Sistema de garantía de calidad, Acreditaciones y sello Euro-Inf (anchors)
- **Noticias / News** (category archive) → Noticias destacadas / Top Stories, Actualidad / Current Affairs
- **Contacto** (`/es/gestion/`) / **Student Support** (`/en/student_support/`)
- Language switcher (flag) – links to the translation of the current page, or to the other homepage

The footer (Astra footer builder) has three widget columns: logos and campus information, ranking logos, and a copy of the main menu plus the UPM logo; and a copyright row.

## 3. Pages found (196 HTML pages)

| Page type | Count | Examples | Template / source |
|---|---|---|---|
| Homepage | 2 (+ `/` = copy of `/es/`) | `/es/`, `/en/` | Gutenberg/EB blocks |
| Content pages | 14 (7 es + 7 en) | `/es/estructura/`, `/es/horarios/`, `/es/admision_y_matricula/`, `/es/profesorado_tutorias/`, `/es/objetivos_competencias/`, `/es/calidad/`, `/es/gestion/` | Gutenberg/EB blocks |
| News posts | 66 (62 es + 4 en) | `/es/topdia/` | classic HTML content, banner with featured image, "latest posts" sidebar |
| Staff profiles ("personal" custom post type) | 74 (37 es + 37 en) | `/es/personal/corcho-garcia-oscar/` | fixed layout (photo + contact fields from ACF) + biography |
| Staff archive | 8 (4 pages × 2 languages) | `/es/personal/`, `/es/personal/page/2/` | Astra blog layout 4, Masonry grid |
| News category archives | 13 (6 categories + pagination) | `/es/category/noticias-es/` … `/page/7/` | Astra archive grid |
| Tag archives | 13 | `/es/tag/catedraticos-de-universidad/` | 12 are empty ("no results" + search form): the tags are used by staff profiles, which tag archives do not list |
| Author archives | 3 | `/es/author/dia-fi-upm/` (+ page 2), `/en/author/dia-fi-upm/` | Astra author box |
| Not reachable | 1 | `/en/https://muia.dia.fi.upm.es/en/access_admission_registration/` | malformed link in the original content (404) |

Also present but not content pages: the search results page (`/?s=`), the 404 page, Yoast XML sitemaps, RSS feeds, `/wp-json/`, oEmbed.

## 4. Content types

| Content type | Where | Notes |
|---|---|---|
| Pages | `/es/*`, `/en/*` | composed of EB blocks; per-page CSS generated by Essential Blocks (`eb-style-<post id>.min.css`) |
| News posts | categories *Noticias* (+ *Noticias destacadas*, *Actualidad*) / *News* (+ *Top Stories*, *Current Affairs*) | title, date, author, categories, featured image, body (HTML), excerpt (archives) |
| Staff profiles | custom post type `personal` | name, photo, contact fields (office, web, phone, ORCID, e-mail, ResearcherID, research group, Scopus ID …), biography, staff category (post tags: *Catedráticos de Universidad*, *Profesores Titulares* …) |
| Taxonomies | categories, tags | used for archives, the teaching-staff grids and the homepage news grid |
| Menus | main menu per language | also printed in the footer widget |
| FAQs | accordions on the homepage, structure, admission and contact pages (+ a hand-written `FAQPage` JSON-LD on some pages) | kept inside the page blocks |
| Courses / seminars | accordions inside tabs on the structure page, with buttons to the UPM course guides (PDF on www.upm.es) | kept inside the page blocks |
| Timetables | EB headings in columns + TablePress tables | kept inside the page blocks |
| Documents | 21 locally hosted (mostly PDFs), ~60 external (UPM guides, regulations) | see docs/documents-inventory.md |

## 5. Reusable visual components

Astra header (desktop bar with logo + menu, below-header bar with the programme name, mobile header with hamburger, sticky header copy, off-canvas mobile drawer), Astra footer, single-post banner (title + featured image), archive cards (image, date, excerpt), pagination, author box, search form, 404 layout; EB wrapper/row/column grid, advanced heading (title/subtitle/separator), infobox (image or icon + title + text, optionally linked), accordion (two markup generations), vertical tabs, button, dual button, feature list (icon list), number counter, advanced image, video with poster, post grid (news titles; staff photos), core paragraphs/lists/tables.

## 6. Features and how they were implemented

| Feature | Implemented by (original) | Needs JS | Kept? | Static implementation |
|---|---|---|---|---|
| Desktop dropdown menus | Astra CSS (`:hover`) + Astra frontend JS (keyboard/toggles) | partly | yes | same CSS + `astra-frontend.min.js` (standalone) |
| Mobile menu (off-canvas drawer) | Astra frontend JS | yes | yes | same script |
| Sticky / shrinking header | Astra Pro JS (jQuery) | yes | yes | `astra-addon.js` + jQuery |
| Scroll-to-top button | Astra frontend JS | yes | yes | same script |
| Smooth scroll to in-page anchors | Astra frontend JS | yes | yes | same script |
| Entrance animations (fadeInUp, zoomIn, slideInUp …) | EB `eb-animation-load.js` + animate.css | yes | yes | same files (content visible without JS via `<noscript>` rule) |
| Animated counters | EB `number-counter/frontend.js` | yes | yes | same script |
| Accordions | EB `accordion/frontend.js` (+ `frontend-controls.js` helpers) | yes | yes | same scripts |
| Vertical tabs | EB `advanced-tabs/frontend.js` | yes | yes | same script |
| Video with poster | EB `advanced-video` (React + react-player + hls/dash/flv, ~1.6 MB) | yes | **reimplemented** | `src/js/site/video.js`: same poster markup, loads the YouTube iframe on click |
| News/staff post grids, pagination, taxonomy filter | EB `post-grid/frontend.js` + WordPress REST API (`wp.apiFetch`, admin-ajax) | yes (pagination) | **reimplemented** | items generated at build time from the collections; `src/js/site/post-grid.js` paginates in the browser (same button logic) |
| Archive Masonry grid | Astra Pro + jQuery Masonry + imagesLoaded | yes | yes | same libraries |
| Timetable tables | TablePress + DataTables (`scrollX`) | yes | yes | same library, options from the page JSON (`tables`) |
| Equal-height timetable boxes | inline jQuery snippet in `<head>` | yes | **reimplemented** | `src/js/site/equal-heights.js` |
| Search (`?s=`) | WordPress search | server | **reimplemented** | `src/js/site/search.js` + `/assets/search/<lang>.json` |
| Lightbox (prettyPhoto) | WP Video Lightbox | — | removed | not used by any page |
| Elementor lazy-load backgrounds, Essential Addons, Swiper, emoji script, DOMPurify, wp.i18n/hooks/url/polyfill, React | various plugins | — | removed | not used by any page (CMS runtime) |
| Language cookie (`pll_language`) | Polylang | yes | removed | not needed: languages are separate URLs |
| RSS feeds, oEmbed, REST API, XML-RPC | WordPress core | server | not reproduced | see docs/dynamic-features.md |

## 7. Stylesheets – what was kept

Selector coverage of every stylesheet was measured against the rendered DOM of all content pages and a sample of every other page type (`.cache/coverage.mjs`), then each file was checked by hand:

- **Kept** (unchanged except for local URLs): Astra `main.min.css`, Astra customizer CSS per context (8 "dynamic" files: page, post, profile, staff archive, category, news category, tag, author), Astra Pro compiled CSS + its dynamic CSS (single/archive), WordPress block library, `theme.json` presets (global styles), Dashicons, Elementor `frontend.min.css` (a few generic rules apply: `.screen-reader-text`, `h1.entry-title`), TablePress, Font Awesome 5 (Elementor copy: core + solid), Essential Blocks `editor.css` (published on the frontend by the plugin; 100+ rules match), EB global variables, EB reusable block 7274 (styles of the profile layout), EB widget styles, animate.css (EB build), Font Awesome 5 (EB copy), `eb-common.css` (`.eb-sr-only`), the "Additional CSS" of the customizer, duotone filters.
- **Per-page block styles**: `eb-style-<id>.min.css` → `src/css/blocks/pages/<lang>-<slug>.css` (admin/editor-only rules removed, background images localised); the 74 profiles share 5 stylesheet variants (`src/css/blocks/people/default.css`, `variant-1…4.css`); 3 profiles load none, as on the original.
- **Removed** (0 matching rules / plugin not used): prettyPhoto, WP Video Lightbox, Header Footer Elementor (2 files), SVG Support, Video Background, Elementor icons, Swiper, e-swiper, Elementor icon-list and social-icons widgets, Font Awesome brands, Essential Addons, EB `hover-min.css`, EB `block-common.css` (shape dividers, unused), the Astra Pro mega-menu inline CSS (only icon-label rules for menu items without icons), emoji and PDF-embedder inline styles, Elementor lazy-load inline style, the astra-child stylesheet (empty).

## 8. Dependencies and decisions

| Dependency | Needed? | Decision |
|---|---|---|
| WordPress runtime (PHP, database, REST API, admin-ajax) | no | removed; content in `data/*.json`, pages pre-rendered |
| WP Fastest Cache bundles | no | the original individual files are used instead (same content, verified declaration by declaration) |
| jQuery | yes (Astra Pro sticky header, Masonry, DataTables) | kept, local copy |
| React / react-player | only for the video block | replaced by 90 lines of JS |
| Google Fonts CDN | rendering | fonts self-hosted (the same woff2 files Chrome receives) |
| Sister-site images (mucd.dia.fi.upm.es, www.fi.upm.es) and Templately background images | rendering | copied to `public/assets/external/<host>/` |
| Gravatar (author avatar) | rendering | copied to `public/assets/images/authors/` |
| YouTube | the video | stays external (loaded on click only) |
| www.upm.es (course guides, regulations), other external links | links | stay external (owned by other services) |

## 9. Problems already present on the original site (kept as they were)

- 29 images referenced by the content or the metadata return HTTP 404 (e.g. the `og:image` of many profiles points to old photos); one PDF link (`Euro-Inf_Framework…Spanish_Version.pdf`) is broken. Listed in `data/known-missing-files.json`.
- Malformed links in the content: `/wp%20content/…GA_10AJ_103000345_1S_2021-22.pdf`, `/en//en/access_admission_registration/`, `/en//` and a link whose target is a sentence, on `/en/structure/` and one Spanish news post.
- Anchors that do not exist on the target pages: `/es/admision_y_matricula/#tab_requisitos`, `#tab_acceso`, `/estructura/#faq_estructura` (the tab ids are only added by the tabs script).
- The English staff profiles show a stray `<` character before the photo (`photoPrefixHtml` in the records).
- Three profiles (Melgar García es/en, Hermenegildo Salinas en) load no block stylesheet, so their layout differs from the others; reproduced (`styleVariant: "none"`).
- The cached archive pages of the original disagree on whether some excerpts end with "[…]" (WP Fastest Cache generated them at different times).
- Several pages have more than one `<h1>` (programme name in the header + page heading) – unchanged.
- Some images have no `alt` attribute (profile photos) – unchanged.
- Some pages are wider than the viewport (horizontal scroll): the homepages at every width (negative margins of the hero image: 2094 px at 1920, 1507 px at 1024, 416 px at 390), the timetables (621 px) and empty tag archives (452 px) at 390 px – unchanged; the responsive test checks that no page overflows more than the original.
