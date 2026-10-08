# Content model

All content of the site lives in `data/` as JSON. The model was derived from what the original site actually contains (see `docs/site-audit.md`); JSON Schemas for the records are in `schemas/` and are enforced by `npm run validate` (also run by every build).

```
data/
├── site.json                 site-wide settings: name, origin, languages, interface strings, logo, layouts
├── navigation/{es,en}.json   main menu of each language (also used by the footer menu)
├── footer/{es,en}.json       footer widgets + copyright line
├── pages/{es,en}/<slug>.json content pages and the two homepages (block content)
├── news/{es,en}/<slug>.json  news posts
├── people/{es,en}/<slug>.json staff profiles
├── taxonomies.json           news categories and tags (staff categories)
├── authors.json              post authors (structured data)
├── archives.json             listing pages: staff archive texts, author archive, items per page
├── redirects.json            old URLs that redirect
└── known-missing-files.json  files/links already broken on the original site (reported, not errors)
```

Identifiers are the original WordPress slugs, so file names match the URLs: `data/people/es/corcho-garcia-oscar.json` ↔ `/es/personal/corcho-garcia-oscar/`. Translations are separate records that point to each other (`translations`), as Polylang did. Records keep the original WordPress post id (`wpId`) because the theme's CSS classes and element ids use it (`post-678`, `page-item-312`); new records just need a unique number.

## Entities

### Page (`data/pages/<lang>/<slug>.json`) – schema `schemas/page.schema.json`

| Field | Req. | Meaning |
|---|---|---|
| `slug` | ✔ | last path segment (`home` for the homepage) |
| `lang` | ✔ | `es` / `en` |
| `path` | ✔ | public URL path (`/es/estructura/`) |
| `title` | ✔ | page name (breadcrumbs, structured data) |
| `wpId` | ✔ | original post id |
| `date`, `modified` | | publication / modification time (metadata) |
| `isHome` | | the language's homepage (also served at `/` for Spanish) |
| `translations` | | `{ "en": "/en/structure/", "es": "/es/estructura/" }` – language switcher + hreflang |
| `seo` | ✔ | see *SEO* below |
| `stylesheet` | | block styles of the page (`blocks/pages/es-estructura.css`, in `src/css/`) |
| `tables` | | DataTables options for TablePress tables on the page |
| `bodyClass` | | only when the page differs from the default in `site.json → layouts` |
| `blocks` | ✔ | the page content (see *Blocks*) |

### News post (`data/news/<lang>/<slug>.json`) – `schemas/news.schema.json`

`slug`, `lang`, `path`, `title` (HTML allowed), `wpId`, `date` (publication date: archive order and the date shown in listings), `modified`, `author` (→ `authors.json`), `categories` (→ `taxonomies.json`, e.g. `["noticias-es", "noticias-destacadas"]` – *noticias-destacadas* puts the post in the homepage news grid), `tags`, `featuredImage` (banner image), `listImage` (image in the listings), `excerpt` (text of the listing card), `parentPage` (menu item marked as parent, WordPress quirk), `seo`, `blocks` (body; usually HTML paragraphs).

Relationships: categories → category archives (`/es/category/noticias-es/…`), homepage post grid, "latest posts" sidebar (5 newest of the same language), author archive, search index.

### Staff profile (`data/people/<lang>/<slug>.json`) – `schemas/person.schema.json`

| Field | Req. | Meaning |
|---|---|---|
| `name` | ✔ | "Surname, Name" – page title and listing label |
| `photo` | ✔ | round photo `{ "src": "/wp-content/uploads/…" }` |
| `contact` | ✔ | list of `{ icon, label, value, href?, target?, itemNewTab? }` – one line each, e.g. `{ "icon": "far fa-envelope", "label": "Email", "value": "ocorcho@fi.upm.es", "href": "mailto:ocorcho@fi.upm.es" }`; the order is the display order |
| `biography` | ✔ | blocks (paragraphs) below the contact list |
| `afterProfile` | | blocks placed after the profile box (one profile) |
| `tags` | ✔ | staff categories (`catedraticos-de-universidad` …) – they decide in which grid of *Profesorado* the person appears |
| `date` | ✔ | order of the staff archive (newest first) |
| `listImage` | | image of the staff archive card |
| `styleVariant` | | which of the profile stylesheets to use (`src/css/blocks/people/`); omitted = `default`, `none` = no block styles (as on the original) |
| `photoPrefixHtml` | | text printed before the photo (the stray "<" of the English originals) |
| `translations`, `seo`, `wpId`, `path`, `slug`, `lang` | | as for pages |

### Taxonomies (`data/taxonomies.json`)

`category` and `post_tag` maps keyed by slug: `{ slug, lang, name, path, wpId, parent?, translations, themeStyle?, seo }`. A category archive lists the posts of the category and of its children.

### Navigation (`data/navigation/<lang>.json`) – `schemas/navigation.schema.json`

`items`: `{ id, label, url, kind: "page" | "custom" | "category", children? }`. `kind` reproduces WordPress' "current item" highlighting; `id` keeps the `menu-item-<id>` CSS class. `languageSwitcher` describes the flag item.

### Footer (`data/footer/<lang>.json`)

Three `columns` with `widgets`: `{ type: "html", html }` (images and texts) or `{ type: "menu" }` (generated from the navigation). `copyright` – `{year}` is replaced by the current year.

### Site (`data/site.json`)

Site name and origin, languages (locale, Open Graph locale, homepage, logo alt text, interface strings such as "Ir al contenido", pagination labels, search texts), logo, favicon, default robots, default body classes per layout, 404 texts, DataTables translations.

### SEO (`seo` object of every record) – `schemas/seo.schema.json`

Only what cannot be derived is stored: `title`, `description`, `ogTitle`/`ogDescription` (when they differed from the title/description), `robots` (when not the default), `image` (Open Graph image), `schemaImage` (primary image in the JSON-LD), `twitter` (labels), `extraSchema` (hand-written JSON-LD kept verbatim). The build generates canonical URLs, hreflang links, Open Graph/Twitter tags and the schema.org graph (WebPage/Article/CollectionPage, breadcrumbs, WebSite, Organization, Person) the way Yoast SEO did.

## Blocks

Page content is a list of blocks (`schemas/blocks.schema.json`). They mirror the Essential Blocks used by the original pages; every block keeps the `id` the original CSS is keyed on (`eb-advance-heading-cl49nvl`). Text fields contain HTML (links, `<strong>`, `<br>`).

| `type` | Main fields |
|---|---|
| `html` | `html` – any HTML (paragraphs, lists, tables, images, TablePress tables) |
| `wrapper`, `row`, `column` | `children` (layout containers; `align`, `anchor`, `contentAlign`) |
| `advanced-heading` | `parts`: `[{ part: "title" \| "subtitle" \| "separator", tag, html }]` |
| `infobox` | `image` or `icon`, `title`, `titleTag`, `subtitle`, `description`, `button`, `link` |
| `accordion` | `mode` (accordion/toggle), icons, `items`: `[{ id, title, children }]` |
| `advanced-tabs` | `tabs`: `[{ tabId, title, anchor?, children }]`, `layout` (vertical) |
| `button` | `text`, `href`, `target` |
| `dual-button` | `buttons` (2), `connector` |
| `feature-list` | `items`: `[{ icon, title, content?, href?, iconColor, iconBackground }]` |
| `number-counter` | `title`, `target`, `start`, `duration`, `prefix`, `suffix` |
| `advanced-image` | `src`, `alt`, `link`, `caption` |
| `advanced-video` | `url` (YouTube), `poster`, `muted`, `autoplay`, `controls`, `loop` |
| `post-grid` | **query** over a collection: `source` (`news`/`people`), `categories` / `tags`, `orderBy` (`date`/`title`), `order`, `perPage`, `pagination`, display options (`preset`, `showThumbnail`, `showTaxonomyFilter`, `filterTerms`, `showMeta`, `titleWords`) |
| `advanced-navigation` | (empty navigation block of the footer) |

Common optional fields: `animation` (entrance animation, e.g. `fadeInUp`), `className`, `align`, `anchor`, plus markup-compatibility flags (`rootClass`, `rootFirst`, `outer`, `legacy`) that reproduce older Essential Blocks markup – leave them as they are.

Every typed block was verified during the migration by rendering it back and comparing the DOM with the original (0 differences); blocks the converter did not recognise would have been stored as `html` (none were needed).

## How a maintainer edits content

| To change… | Edit |
|---|---|
| A text on a page | `data/pages/<lang>/<slug>.json` – find the text (search the file), change the `html` value |
| A menu entry | `data/navigation/<lang>.json` |
| A news post | `data/news/<lang>/<slug>.json` (`title`, `blocks`, `excerpt`) |
| A staff profile (phone, office, e-mail …) | `data/people/<lang>/<slug>.json` → `contact` |
| Which staff appear in each *Profesorado* grid | the person's `tags` |
| Homepage "Noticias destacadas" | add/remove `noticias-destacadas` in the post's `categories` |
| Footer | `data/footer/<lang>.json` |
| Interface strings | `data/site.json` → `languages.<lang>.strings` |

Then `npm run build` (or keep `npm run dev` running – it rebuilds on save). See README.md.
