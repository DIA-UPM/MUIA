# Dynamic and server-side features

Every feature of the original site that depended on WordPress/PHP at request time, and what happened to it. Classification: **A** recreated with static files / client-side code, **B** links to an existing external service, **C** would need a replacement backend, **D** intentional external dependency.

| Feature | Original implementation | Class | Static site |
|---|---|---|---|
| Page rendering (all pages, menus, footer, "current" menu item, language switcher) | WordPress + Astra + Polylang (PHP) | A | Pre-rendered at build time from `data/*.json` |
| Archive listings and pagination (categories, tags, author, staff) | WordPress queries | A | Generated at build time (10 items per page, same URLs `/page/N/`) |
| News grid with pagination (homepage) | Essential Blocks post grid → WordPress REST API (`/wp-json/essential-blocks/v1/queries`) and `admin-ajax.php` | A | All items in the HTML, paginated in the browser (`src/js/site/post-grid.js`) |
| Staff grids with taxonomy filter (Profesorado) | same (REST API) | A | Generated at build time from the profiles' `tags`; the filter button keeps its behaviour (single term) |
| "Latest posts" sidebar on news posts | WordPress widget | A | Generated at build time |
| Site search (`/es/?s=…`, `/en/?s=…`; form on empty archives and the 404 page; `SearchAction` in the structured data) | WordPress search (database) | A | Same URLs; results computed in the browser from `/assets/search/<lang>.json` (generated at build time) with the original page layout and texts. Matching is a simple accent-insensitive "all words" search instead of WordPress' SQL `LIKE`, so the result set can differ slightly |
| Video block | react-player loading YouTube | A + D | Poster + YouTube iframe loaded on click (`src/js/site/video.js`); YouTube stays an external service |
| Timetable tables | TablePress (shortcodes rendered by PHP) + DataTables | A | Tables are static HTML in the page JSON; DataTables initialised in the browser |
| XML sitemaps (`/sitemap_index.xml` …) | Yoast SEO (PHP) | A | Generated at build time with the same file names |
| `robots.txt` | Yoast SEO | A | Static file with the same rules |
| 404 page | WordPress theme | A | `dist/404.html` – the web server must be configured to use it (README → Deployment) |
| Redirect `/estructura/` → `/es/estructura/` (and other WordPress canonical redirects) | WordPress (`redirect_canonical`) | A | HTML redirect page (meta refresh + JS); a server rule (301) is recommended (README → Deployment) |
| Language cookie (`pll_language`) | Polylang (JS) | — | Not needed: every language has its own URLs |
| RSS feeds (`/es/feed/`, `/en/feed/`, per category/tag/author, comments feed) | WordPress | C (or A with server configuration) | **Not reproduced.** The `<link rel="alternate" type="application/rss+xml">` tags were removed. A static feed could be generated at build time, but serving it at `/es/feed/` needs a server rule (`index.xml` as directory index). No feed reader use was observable. |
| REST API (`/wp-json/…`), oEmbed (`/wp-json/oembed/…`), XML-RPC, RSD, short links (`/?p=<id>`) | WordPress core | — | **Not reproduced** (CMS-only endpoints). The corresponding `<link>` tags were removed. |
| Comments | WordPress (disabled on the site – no comment forms) | — | none |
| Contact form / other forms | — | — | none exist on the site (the only form is the search form) |
| Authentication, admin (`/wp-admin/`, `/wp-login.php`) | WordPress | — | Not applicable: content is edited in `data/*.json` and deployed with `npm run build` |
| Emoji script, admin bar, edit links | WordPress | — | removed |

No other server-side functionality was found (no newsletter, registration or application forms – applications go to external UPM services linked from the admission page, class **B**).
