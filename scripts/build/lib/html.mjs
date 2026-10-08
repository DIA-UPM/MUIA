// Tiny HTML helpers shared by the block renderers and templates.

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Joins class names, skipping empty values. */
export const cls = (...parts) => parts.flat().filter(Boolean).join(' ');

/**
 * Renders an attribute list. `attrs` is an object or an array of [name, value]
 * pairs (arrays keep the original attribute order). null/undefined/false values
 * are skipped, `true` renders a bare attribute.
 */
export function attrs(a) {
  if (!a) return '';
  const list = Array.isArray(a) ? a : Object.entries(a);
  return list
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join('');
}

export const el = (tag, a, inner = '') => `<${tag}${attrs(a)}>${inner}</${tag}>`;
