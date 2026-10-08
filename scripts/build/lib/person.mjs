// Renders the fixed layout of a staff profile (photo + contact list) used on
// /<lang>/personal/<slug>/ pages. Every profile on the original site shares
// the same Essential Blocks ids, so the ids below are constants and the styles
// live in src/css/blocks/people/*.css.
import { esc, attrs } from './html.mjs';

const ICON_BG = 'rgba(219,173,119,1)';

function contactItem(it) {
  const value = it.href
    ? `<a href="${esc(it.href)}" class="acf-custom-link"${attrs({ target: it.target })}>${it.value}</a>`
    : it.value;
  const title = `${it.label}${it.separator ?? ': '}${value}`;
  const iconColor = it.iconColor;
  const bg = it.iconBackground ?? ICON_BG;
  const style = iconColor !== undefined ? `color:${iconColor};background-color:${bg}` : `background-color:${bg}`;
  return (
    `<li class="eb-feature-list-item"${attrs([
      ['data-new-tab', String(!!it.itemNewTab)],
      ['data-icon-type', 'icon'],
      ['data-icon', it.icon],
      ['data-icon-color', iconColor],
      ['data-icon-background-color', bg],
      ['data-link', ''],
    ])}><div class="eb-feature-list-icon-box"><div class="eb-feature-list-icon-inner"><span class="eb-feature-list-icon" style="${style}"><i icon="${it.icon}" class="${it.icon} "></i></span></div></div>` +
    `<div class="eb-feature-list-content-box"><h3 class="eb-feature-list-title">${title}</h3></div></li>`
  );
}

/** The photo + contact row. `renderBlocks` renders the biography that follows it. */
export function renderPersonLayout(person, biographyHtml) {
  const photo = `${person.photoPrefixHtml ?? ''}<div style="width: 265px; height: 265px; border-radius: 50%; overflow: hidden; display: inline-block; box-sizing: border-box;"><img decoding="async" class="my-custom-image" src="${esc(person.photo.src)}"${person.photo.alt ? ` alt="${esc(person.photo.alt)}"` : ''}></div>`;
  const list = person.contact.map(contactItem).join('');
  // The odd class string on the list is copied verbatim from the original profile layout.
  return (
    `<div class="wp-block-essential-blocks-wrapper alignfull"><div class="eb-parent-wrapper eb-parent-eb-wrapper-uoorlgk "><div class="eb-wrapper-outer eb-wrapper-uoorlgk eb-wrapper-align-center"><div class="eb-wrapper-inner"><div class="eb-wrapper-inner-blocks">\n` +
    `<div class="wp-block-essential-blocks-row"><div class="eb-parent-wrapper eb-parent-eb-row-ipyxw68 "><div class="eb-row-root-container eb-row-ipyxw68" data-id="eb-row-ipyxw68"><div class="eb-row-wrapper"><div class="eb-row-inner">\n` +
    `<div class="eb-parent-wrapper eb-parent-eb-column-dsg7e98  wp-block-essential-blocks-column"><div class="eb-column-wrapper eb-column-dsg7e98"><div class="eb-column-inner">\n${photo}\n</div></div></div>\n` +
    `<div class="eb-parent-wrapper eb-parent-eb-column-jz92vxo  wp-block-essential-blocks-column"><div class="eb-column-wrapper eb-column-jz92vxo"><div class="eb-column-inner">\n` +
    `<div class="wp-block-essential-blocks-feature-list alignwide .my-custom-image { height: 100%; /* Ajusta esto según tus necesidades */ width: auto; Esto mantendrá la proporción de imagen }"><div class="eb-parent-wrapper eb-parent-eb-feature-list-bxvi1zd eb_animation eb___animated eb___fadeInLeft"><div class="eb-feature-list-bxvi1zd eb-feature-list-wrapper -icon-position-left -tablet-icon-position-left -mobile-icon-position-left eb-feature-list-left"><ul class="eb-feature-list-items circle stacked eb-inline-feature-list">${list}</ul></div></div></div>\n` +
    `</div></div></div>\n</div></div></div></div></div>\n` +
    `${biographyHtml}\n</div></div></div></div></div>`
  );
}
