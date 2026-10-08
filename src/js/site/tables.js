/*
 * TablePress tables: the original initialised DataTables (horizontal scrolling,
 * no sorting/paging/search) with an inline script per page. The build now
 * writes the same options to window.MUIA_TABLES from the page's JSON
 * ("tables" field) and the translations from data/site.json.
 */
(function () {
  'use strict';
  var config = window.MUIA_TABLES;
  if (!config || !window.jQuery || !window.jQuery.fn.DataTable) return;
  window.jQuery(function ($) {
    config.tables.forEach(function (t) {
      var options = $.extend({}, t.options, { language: config.language });
      $(t.selector).DataTable(options);
    });
  });
})();
