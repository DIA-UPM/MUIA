// Representative pages of every page type found during the audit
// (docs/site-audit.md). Used by the visual baseline, the visual regression
// tests and the functional tests.
export const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

export const PAGES = [
  { id: 'home-es', path: '/es/', type: 'Homepage', features: ['hero', 'number counters', 'testimonial infoboxes', 'FAQ accordion', 'news post grid with pagination', 'video'] },
  { id: 'home-en', path: '/en/', type: 'Homepage (English)', features: ['language variant'] },
  { id: 'estructura', path: '/es/estructura/', type: 'Content page – programme structure', features: ['vertical tabs', 'nested accordions', 'buttons to PDF guides', 'infoboxes'] },
  { id: 'admision', path: '/es/admision_y_matricula/', type: 'Content page – admissions', features: ['vertical tabs with anchors', 'accordions', 'feature lists'] },
  { id: 'horarios', path: '/es/horarios/', type: 'Content page – timetables', features: ['TablePress tables (DataTables scrolling)', 'equal-height timetable columns'] },
  { id: 'profesorado', path: '/es/profesorado_tutorias/', type: 'Content page – teaching staff', features: ['people post grids by category'] },
  { id: 'objetivos', path: '/es/objetivos_competencias/', type: 'Content page – objectives', features: ['tabs', 'infoboxes'] },
  { id: 'calidad', path: '/es/calidad/', type: 'Content page – quality', features: ['infoboxes', 'linked images'] },
  { id: 'gestion', path: '/es/gestion/', type: 'Content page – contact/management', features: ['tabs', 'accordions', 'feature lists'] },
  { id: 'post', path: '/es/topdia/', type: 'News post (with image)', features: ['banner with featured image', 'latest posts sidebar'] },
  { id: 'post-nothumb', path: '/es/alumno-del-master-ganador-del-ets-development-challenge/', type: 'News post (no image)', features: [] },
  { id: 'person', path: '/es/personal/corcho-garcia-oscar/', type: 'Staff profile', features: ['photo', 'contact list', 'biography'] },
  { id: 'person-en', path: '/en/personal/corcho-garcia-oscar_en/', type: 'Staff profile (English)', features: [] },
  { id: 'person-archive', path: '/es/personal/', type: 'Staff archive', features: ['masonry grid', 'pagination'] },
  { id: 'category', path: '/es/category/noticias-es/', type: 'News category archive', features: ['masonry grid', 'pagination'] },
  { id: 'tag-empty', path: '/es/tag/catedraticos-de-universidad/', type: 'Tag archive without posts', features: ['search form'] },
  { id: 'author', path: '/es/author/dia-fi-upm/', type: 'Author archive', features: ['author box'] },
];
