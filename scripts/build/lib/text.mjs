// Text helpers: entity decoding, WordPress-style dates and pagination links.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rarr: '→', larr: '←', laquo: '«', raquo: '»', copy: '©', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const MONTHS = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** "25 de noviembre de 2022" – the site's date format ("j \d\e F \d\e Y") in both languages. */
// Dates are stored in UTC; WordPress displayed them in the site's time zone.
export function formatDate(iso, lang, timeZone = 'Europe/Madrid') {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, Number(p.value)]),
  );
  const [y, m, d] = [parts.year, parts.month, parts.day];
  return `${d} de ${MONTHS[lang][m - 1]} de ${y}`;
}

/** WordPress paginate_links() with end_size 1 and mid_size 1 (as used by Astra). */
export function paginateLinks(current, total, basePath, strings) {
  const url = (n) => (n === 1 ? basePath : `${basePath}page/${n}/`);
  const out = [];
  if (current > 1) out.push(`<a class="prev page-numbers" href="${url(current - 1)}">${strings.previous}</a>`);
  let dots = false;
  for (let n = 1; n <= total; n++) {
    if (n === current) {
      out.push(`<span aria-current="page" class="page-numbers current">${n}</span>`);
      dots = true;
    } else if (n <= 1 || (current && n >= current - 1 && n <= current + 1) || n > total - 1) {
      out.push(`<a class="page-numbers" href="${url(n)}">${n}</a>`);
      dots = true;
    } else if (dots) {
      out.push('<span class="page-numbers dots">&hellip;</span>');
      dots = false;
    }
  }
  if (current < total) out.push(`<a class="next page-numbers" href="${url(current + 1)}">${strings.next}</a>`);
  return out.join('\n');
}

/** Plain text of a record for the search index. */
export function excerptText(rec, renderBlocks) {
  const parts = [];
  if (rec.contact) parts.push(rec.contact.map((c) => `${c.label} ${c.value}`).join(' '));
  for (const key of ['blocks', 'biography', 'afterProfile']) if (rec[key]) parts.push(renderBlocks(rec[key]));
  return decodeEntities(parts.join(' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}
