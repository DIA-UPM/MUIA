# Network and JavaScript test report

Browser tests (`tests/functional/independence.spec.mjs`, `helpers.mjs`) record, on every representative page: console errors, uncaught exceptions, failed requests (network errors and HTTP ≥ 400), failed image loads, font loading and every request leaving the local server.

## Problems found during the migration (all fixed)

| Problem | Seen on | Cause | Fix |
|---|---|---|---|
| `TypeError: Cannot read properties of undefined (reading 'EBGetIconClass')` on every page | all pages | the Essential Blocks accordion/tabs scripts need the helper `window.eb_frontend` from `frontend-controls.js`, which had been classified as an editor-only file | `src/js/vendor/eb-frontend-controls.js` added to the main bundle |
| Requests to `muia.dia.fi.upm.es` from the static build | homepage, structure, quality … | background images inside the per-page Essential Blocks stylesheets still had absolute URLs of the original server | URLs in block stylesheets localised during extraction (`extract-site.mjs`) |
| Requests to `static.live.templately.com` | structure (es/en) | Essential Blocks background images taken from the Templately library | images copied to `public/assets/external/static.live.templately.com/` |
| Requests to `secure.gravatar.com` | author archives | author avatar | copied to `public/assets/images/authors/` |
| Requests to `fonts.googleapis.com` / `fonts.gstatic.com` | all pages (original) | Google Fonts | fonts self-hosted (`src/css/site/fonts.css`, `public/assets/fonts/google/`) |
| Timetable boxes 0.2 px shorter than on the original | timetables | equal-height script measured integer heights (jQuery uses fractional ones) | `src/js/site/equal-heights.js` uses `getComputedStyle` |

## Final state

- **Console errors / exceptions:** none on the 17 representative pages, nor on any of the 16 content pages, 66 posts and 74 profiles visited by the functional tests.
- **Failed requests:** none (images, CSS, JS, fonts, documents). Files that were already broken on the original (`data/known-missing-files.json`) are not requested by any page except as link targets.
- **External requests during normal browsing:** none. YouTube is contacted only when a visitor clicks the video poster (tested with the request intercepted).
- **With every non-local host blocked:** all representative pages render with their CSS, the theme fonts (Syne, Noto Sans Hanunoo …), all images and working scripts.
- **Link check:** 0 errors; warnings only for problems inherited from the original (malformed links, missing anchors, files that returned 404 on the original). External links: 266 checked, 52 broken or unreachable – all in the original content (old personal pages under `dia.fi.upm.es/~user`, retired PDFs of the former `dia.fi.upm.es/masteria` site, a mistyped `muia.fi.dia.upm.es` link, expired event pages, the `sasover.com` footer credit). They are left unchanged (content decision for the maintainers); the list is reproduced by `npm run check-links -- --external` (`test-results/link-check.json`).
