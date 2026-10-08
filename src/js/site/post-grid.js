/*
 * Post grid pagination and taxonomy filter.
 *
 * Replaces the Essential Blocks frontend script, which fetched every page of
 * results from the WordPress REST API. The static build writes all items into
 * the HTML; this script shows one page at a time and reproduces the button
 * states of the original (show/hide classes, "..." separators, disabled
 * previous/next buttons). Without JavaScript all items remain visible.
 */
(function () {
  'use strict';

  function hasClass(el, name) {
    return el.classList.contains(name);
  }

  // Same visibility rules as Essential Blocks' pagination helper.
  function updateButtons(pagination) {
    var active = pagination.querySelector('.ebpg-pagination-item.active');
    if (!active) return;
    var current = parseInt(active.dataset.pagenumber, 10);
    var items = pagination.querySelectorAll('.ebpg-pagination-item');
    var total = items.length;
    items.forEach(function (btn) {
      var n = parseInt(btn.dataset.pagenumber, 10);
      btn.classList.remove('show');
      btn.classList.add('hide');
      if ((current === 1 && n <= 3) || (n >= current && n <= current + 2) || n === total || (n === 1 && (current >= total - 2 || current >= 4))) {
        btn.classList.remove('hide');
        btn.classList.add('show');
      }
    });
    pagination.querySelectorAll('.ebpg-pagination-item-separator').forEach(function (s) {
      s.remove();
    });
    var sep = '<button class="ebpg-pagination-item-separator">...</button>';
    if (current < items.length - 2) items[items.length - 1].insertAdjacentHTML('beforebegin', sep);
    if (current >= total - 2 || (total > 4 && current >= 4)) items[1].insertAdjacentHTML('afterend', sep);
    pagination.querySelector('.ebpg-pagination-item-previous').disabled = current === 1;
    pagination.querySelector('.ebpg-pagination-item-next').disabled = current === total;
  }

  function showPage(grid, page) {
    var perPage = parseInt(grid.dataset.perPage, 10);
    if (!perPage) return;
    var posts = grid.querySelectorAll('.eb-post-grid-posts-wrapper > .ebpg-grid-post');
    posts.forEach(function (post, i) {
      post.hidden = i < (page - 1) * perPage || i >= page * perPage;
    });
    var pagination = grid.querySelector('.ebpostgrid-pagination');
    if (!pagination) return;
    pagination.querySelectorAll('.ebpg-pagination-item').forEach(function (btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.pagenumber, 10) === page);
    });
    updateButtons(pagination);
  }

  function currentPage(grid) {
    var active = grid.querySelector('.ebpg-pagination-item.active');
    return active ? parseInt(active.dataset.pagenumber, 10) : 1;
  }

  function init(grid) {
    var pagination = grid.querySelector('.ebpostgrid-pagination');
    if (pagination) {
      var total = pagination.querySelectorAll('.ebpg-pagination-item').length;
      pagination.addEventListener('click', function (event) {
        var btn = event.target.closest('button');
        if (!btn || btn.disabled || hasClass(btn, 'ebpg-pagination-item-separator')) return;
        var page = currentPage(grid);
        if (hasClass(btn, 'ebpg-pagination-item-previous')) page -= 1;
        else if (hasClass(btn, 'ebpg-pagination-item-next')) page += 1;
        else page = parseInt(btn.dataset.pagenumber, 10);
        showPage(grid, Math.min(Math.max(page, 1), total));
      });
      showPage(grid, 1);
    }
    // Taxonomy filter: the grids only list the posts of the filter's terms,
    // so selecting a term marks it active and returns to the first page.
    grid.querySelectorAll('.ebpg-category-filter-list-item').forEach(function (li) {
      li.addEventListener('click', function () {
        grid.querySelectorAll('.ebpg-category-filter-list-item').forEach(function (other) {
          other.classList.remove('active');
        });
        li.classList.add('active');
        showPage(grid, 1);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.eb-post-grid-wrapper').forEach(init);
  });
})();
