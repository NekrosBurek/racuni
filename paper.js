// Reads a printed fiscal receipt from on-device OCR (Latin script only: Cyrillic labels come out garbled, so
// fields are found by their shape, not by their labels). Each camera frame is parsed on its own and merged.

const MONEY = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const INVOICE = /([A-Z0-9]{8})\s*-\s*([A-Z0-9]{8})\s*-\s*(\d{1,10})/;
const DATE = /(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const ITEM_NUMBERS = /^(.*?)\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?[\d.,]+)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;
const SEPARATOR = /^[-=_.\s]{5,}$/;
const TAX_LABEL = /\([^)]{1,3}\)\s*$/;

const amount = s => Number(s.replace(/\./g, '').replace(',', '.'));
const afterLabel = row => row.replace(/^[^:]{1,25}:\s*/, '').trim();

// OCR returns lines with boxes; lines whose vertical centres are close belong to the same printed row.
export function rowsFromLines(lines) {
  const sorted = lines
    .filter(l => l.text?.trim())
    .map(l => ({ ...l, cy: (l.top + l.bottom) / 2, h: Math.max(1, l.bottom - l.top) }))
    .sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(line.cy - row.cy) < Math.min(line.h, row.h) * 0.6) {
      row.parts.push(line);
    } else {
      rows.push({ cy: line.cy, h: line.h, parts: [line] });
    }
  }
  return rows.map(r => r.parts.sort((a, b) => a.left - b.left).map(p => p.text.trim()).join(' '));
}

function isItemRow(row) {
  return ITEM_NUMBERS.test(row);
}

// One frame's worth of rows -> whatever fields it shows.
export function parsePaper(rows) {
  const out = { ...emptyPaper(), items: [] };
  const firstItem = rows.findIndex(isItemRow);

  rows.forEach((row, i) => {
    const m = row.match(ITEM_NUMBERS);
    if (!m) return;
    let name = m[1].trim();
    if (!name) {
      // The name is on the row(s) above; a wrapped name's first part only counts after another item,
      // because above the first item sits the column header.
      const prev = rows[i - 1] ?? '';
      const usable = r => r && !SEPARATOR.test(r) && !r.includes(':') && !isItemRow(r);
      if (usable(prev)) {
        name = prev;
        const before = rows[i - 2];
        if (TAX_LABEL.test(prev) && usable(before) && !TAX_LABEL.test(before) && isItemRow(rows[i - 3] ?? '')) {
          name = `${before} ${prev}`;
        }
      }
    }
    if (name) out.items.push({ name, quantity: amount(m[3]), total: amount(m[4]) });
  });

  for (const row of rows) {
    const inv = row.toUpperCase().match(INVOICE);
    if (inv && !out.invoiceNumber) out.invoiceNumber = `${inv[1]}-${inv[2]}-${Number(inv[3])}`;
    const d = row.match(DATE);
    if (d) {
      const date = new Date(+d[3], +d[2] - 1, +d[1], +d[4], +d[5], +(d[6] ?? 0));
      if (!isNaN(date)) out.date = date; // the last one is the PFR time, printed after the ESIR time
    }
  }

  // Header: the tax ID (9 digits) row, then the company, then the place of sale.
  const header = firstItem < 0 ? rows : rows.slice(0, firstItem);
  const pib = header.findIndex(r => /(^|\D)\d{9}(\D|$)/.test(r) && !INVOICE.test(r.toUpperCase()));
  if (pib >= 0) {
    out.shop = afterLabel(header[pib + 1] ?? '');
    out.place = afterLabel(header[pib + 2] ?? '');
  }

  // Total: the first single amount after the items ("Укупан износ"); without items, the largest amount
  // printed at least twice (total and card payment), else the largest.
  if (firstItem >= 0) {
    const lastItem = rows.reduce((last, r, i) => (isItemRow(r) ? i : last), -1);
    for (const row of rows.slice(lastItem + 1)) {
      const amounts = row.match(MONEY);
      if (amounts?.length === 1) { out.total = amount(amounts[0]); out.totalSure = true; break; }
    }
  }
  if (out.total === null) {
    const all = rows.flatMap(r => r.match(MONEY) ?? []).map(amount);
    const repeated = all.filter((a, i) => all.indexOf(a) !== i);
    const pool = repeated.length ? repeated : all;
    if (pool.length) out.total = Math.max(...pool);
  }
  return out;
}

// Combines frames: the first value seen wins, items are collected across frames (a long receipt is read
// while the camera moves down it). Items from different frames are the same if name and total match.
export function mergePaper(a, b) {
  const key = i => `${i.name.replace(/\s+/g, ' ').toUpperCase()}|${i.total}`;
  const seen = new Set(a.items.map(key));
  return {
    invoiceNumber: a.invoiceNumber ?? b.invoiceNumber,
    date: a.date ?? b.date,
    // A total read right after the items beats a guess from a partial frame.
    total: a.totalSure || !b.totalSure ? a.total ?? b.total : b.total,
    totalSure: a.totalSure || b.totalSure,
    shop: a.shop || b.shop,
    place: a.place || b.place,
    items: [...a.items, ...b.items.filter(i => !seen.has(key(i)))],
  };
}

export function emptyPaper() {
  return { invoiceNumber: null, date: null, total: null, totalSure: false, shop: '', place: '', items: [] };
}

// Enough to save: the invoice number (duplicate check) and the date.
export const paperReady = p => !!(p.invoiceNumber && p.date);
