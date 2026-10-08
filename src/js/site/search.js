/*
 * Site search.
 *
 * WordPress answered /es/?s=term (and /en/?s=term) with a results page. On the
 * static site the same URLs load the homepage and this script replaces the
 * page content with the results, searched in /assets/search/<lang>.json (titles,
 * excerpts and text of every page, news post and profile, generated at build
 * time). The markup and texts are the ones of the original search page
 * (Astra archive cards); the strings come from window.MUIA_SEARCH.
 */
(function () {
  'use strict';
  var params = new URLSearchParams(window.location.search);
  if (!params.has('s') || !window.MUIA_SEARCH) return;
  var query = (params.get('s') || '').trim();
  var cfg = window.MUIA_SEARCH;

  function normalize(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function card(r) {
    var img = r.image ? '<div class="post-thumb-img-content post-thumb"><a href="' + escapeHtml(r.url) + '"><img src="' + escapeHtml(r.image) + '" class="attachment-large size-large wp-post-image" alt="" decoding="async"></a></div>' : '';
    return (
      '<article class="ast-grid-common-col ast-full-width ast-article-post remove-featured-img-padding ast-width-md-4 ast-archive-post ast-separate-posts">' +
      '<div class="ast-post-format- ' + (r.image ? '' : 'ast-no-thumb ') + 'blog-layout-4 ast-article-inner ast-no-date-box"><div class="post-content ast-grid-common-col">' +
      '<div class="ast-blog-featured-section post-thumb ast-blog-single-element">' + img + '</div>' +
      '<header class="entry-header ast-blog-single-element ast-blog-meta-container">' +
      (r.date ? '<div class="entry-meta"><span class="posted-on"><span class="published" itemprop="datePublished"> ' + escapeHtml(r.dateText) + ' </span></span></div>' : '') +
      '</header>' +
      // As on the original, the card shows the excerpt (not the title); it is linked so
      // results without an image can be opened too.
      '<div class="ast-excerpt-container ast-blog-single-element"><p><a href="' + escapeHtml(r.url) + '" title="' + escapeHtml(r.title) + '">' + escapeHtml(r.excerpt) + '</a></p></div>' +
      '</div></div></article>'
    );
  }

  function render(results) {
    var primary = document.getElementById('primary');
    if (!primary) return;
    document.title = cfg.documentTitle.replace('{query}', query);
    document.body.classList.add('search', results.length ? 'search-results' : 'search-no-results');
    var html =
      '<section class="ast-archive-description"><h1 class="page-title ast-archive-title">' + escapeHtml(cfg.title) + '<span>' + escapeHtml(query) + '</span></h1>' +
      '<div class="ast-breadcrumbs-wrapper"><div class="ast-breadcrumbs-inner"><nav role="navigation" aria-label="' + escapeHtml(cfg.breadcrumbsLabel) + '" class="breadcrumb-trail breadcrumbs"><div class="ast-breadcrumbs"><ul class="trail-items">' +
      '<li class="trail-item trail-begin"><a href="' + escapeHtml(cfg.home) + '" rel="home"><span>' + escapeHtml(cfg.breadcrumbsHome) + '</span></a></li>' +
      '<li class="trail-item trail-end"><span><span>' + escapeHtml(cfg.trail + query) + '</span></span></li></ul></div></nav></div></div></section>' +
      '<main id="main" class="site-main">';
    if (!results.length) html += '<section class="no-results not-found"><div class="page-content"><p>' + cfg.noResults + '</p></div></section>';
    else html += '<div class="ast-row">' + results.map(card).join('') + '</div>';
    html += '</main>';
    primary.className = 'content-area primary ast-blog-layout-4-grid ast-grid-3 ast-grid-md-1 ast-grid-sm-1';
    primary.innerHTML = html;
    var banner = document.querySelector('.ast-single-entry-banner');
    if (banner) banner.remove();
    var secondary = document.getElementById('secondary');
    if (secondary) secondary.remove();
  }

  fetch(cfg.index)
    .then(function (r) {
      return r.json();
    })
    .then(function (index) {
      var terms = normalize(query).split(/\s+/).filter(Boolean);
      var results = !terms.length
        ? []
        : index.filter(function (doc) {
            var hay = normalize(doc.title + ' ' + doc.text);
            return terms.every(function (t) {
              return hay.indexOf(t) !== -1;
            });
          });
      // Same order as WordPress: newest first.
      results.sort(function (a, b) {
        return (b.date || '').localeCompare(a.date || '');
      });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(results); });
      else render(results);
    })
    .catch(function () {
      render([]);
    });
})();
