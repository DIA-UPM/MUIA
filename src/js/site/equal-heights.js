/*
 * Timetable columns (rows with the CSS class "mi-row"): gives every time-slot
 * heading the same height so the weekday columns line up. The first and fifth
 * heading of each column (weekday name and lunch break) keep their own height.
 * Plain-JavaScript port of a jQuery snippet that was pasted into the original
 * site's <head>.
 */
(function () {
  'use strict';

  function equalize() {
    document.querySelectorAll('.mi-row').forEach(function (row) {
      var boxes = [];
      row.querySelectorAll('.mi-columna').forEach(function (col) {
        col.querySelectorAll('.eb-advance-heading-wrapper').forEach(function (box, index) {
          box.style.height = 'auto';
          if (index !== 0 && index !== 4) boxes.push(box);
        });
      });
      // Same arithmetic as jQuery's .height(): the (fractional) content height,
      // without padding and border.
      var inner = function (cs) {
        return cs.boxSizing === 'border-box' ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) : 0;
      };
      var max = 0;
      boxes.forEach(function (box) {
        var cs = getComputedStyle(box);
        var h = parseFloat(cs.height) - inner(cs);
        if (h > max) max = h;
      });
      boxes.forEach(function (box) {
        box.style.height = max + inner(getComputedStyle(box)) + 'px';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', equalize);
  window.addEventListener('resize', equalize);
})();
