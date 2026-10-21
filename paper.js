// Reads a printed fiscal receipt from on-device OCR (Latin script only: Cyrillic labels come out garbled, so
// fields are found by their shape, not by their labels). Each scanned page is parsed on its own and merged.
// OCR is loose with punctuation, so "4.400,00" may come back as "4,400,00", "4.400.00" or "4.400, 00".

const M = String.raw`\d{1,3}(?:[.,]\d{3})*[.,]\s?\d{2}(?!\d)`;
const MONEY = new RegExp(`-?${M}`, 'g');
const DASH = '\\s*[-\u2013\u2014]\\s*';
const INVOICE = new RegExp(`([A-Z0-9]{8})${DASH}([A-Z0-9]{8})${DASH}([0-9OI]{1,10})(?![A-Z0-9])`);
const DATE = /(\d{1,2})\s*[.,]\s*(\d{1,2})\s*[.,]\s*(20\d{2})\.?(?:\s*[.,]?\s*(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?)?/;
const ITEM_NUMBERS = new RegExp(`^(.*?)\\s*(-?${M})\\s+(-?\\d+(?:[.,]\\d{1,3})?)\\s+(-?${M})$`);
const SEPARATOR = /^[-=_.\s]{5,}$/;
const TAX_LABEL = /\([^)]{1,3}\)\s*$/;

// The last separator before exactly two digits is the decimal point; any other is a thousands separator.
export function amount(s) {
  const m = s.replace(/\s/g, '').match(/^(-?)([\d.,]*?)[.,]?(\d{2})$/);
  if (!m) return Number(s.replace(/[.,\s]/g, ''));
  return Number(`${m[1]}${m[2].replace(/[.,]/g, '') || '0'}.${m[3]}`);
}

// Two-digit years only count right before a time, where they can't be anything else.
const DATE_SHORT_YEAR = /(\d{1,2})\s*[.,]\s*(\d{1,2})\s*[.,]\s*(\d{2})\.?\s+(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?/;
const TIME_ONLY = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?\b/;
const COUNTER = /(\d{1,10})\s*\/\s*(\d{1,10})\s*([A-Za-zА-Яа-я]{2})?/g;

// OCR reads digits as look-alike letters ("2O.12.2O25. O9:57:l6"); fixed only in runs that are mostly digits.
export function fixDigits(text) {
  return text.replace(/[0-9OoDIl|SBZ][0-9OoDIl|SBZ.,:\s]*[0-9OoDIl|SBZ]/g, run =>
    run.replace(/\D/g, '').length >= 3
      ? run.replace(/[OoD]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2')
      : run);
}

// Receipt type after the counter: ПП sale, ПР refund, КП/КР copy, ОП/ОР training, АП/АР advance. Latin OCR of
// Cyrillic gives N/M for П, P for Р, K for К; a missing suffix is a sale.
function counterSuffix(s) {
  if (!s) return 'ПП';
  const map = { N: 'П', M: 'П', П: 'П', P: 'Р', Р: 'Р', K: 'К', К: 'К', O: 'О', О: 'О', A: 'А', А: 'А' };
  const out = [...s.toUpperCase()].map(c => map[c]).join('');
  return /^[ПКОА][ПР]$/.test(out) ? out : 'ПП';
}

// "26915/27982ПП": receipts of this type / all receipts of the device. The second number is the PFR number's counter.
function readCounters(rows) {
  const found = [];
  for (const row of rows) {
    for (const m of fixDigits(row).matchAll(COUNTER)) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a >= 1 && a <= b) found.push({ text: `${a}/${b}${counterSuffix(m[3])}`, total: b, suffixed: !!m[3] });
    }
  }
  return found;
}

export const formatPfrTime = d => {
  const p = n => String(n).padStart(2, '0');
  return d ? `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}. ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : '';
};

// "20.12.2025. 09:57:16" (seconds optional) -> Date; null when it isn't a real date and time.
export function parsePfrTime(text) {
  const m = fixDigits(text.trim()).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] ?? 0));
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 && d.getHours() === +m[4] && d.getMinutes() === +m[5] ? d : null;
}

// A date only counts if it is plausible for a receipt being scanned now.
function readDate(raw) {
  const row = fixDigits(raw);
  let d = row.match(DATE);
  if (!d) {
    d = row.match(DATE_SHORT_YEAR);
    if (!d) return null;
    d = [...d];
    d[3] = String(2000 + Number(d[3]));
  }
  const [day, month, year] = [+d[1], +d[2], +d[3]];
  const thisYear = new Date().getFullYear();
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < thisYear - 3 || year > thisYear + 1) return null;
  const hasTime = d[4] !== undefined && +d[4] < 24 && +d[5] < 60;
  const date = hasTime ? new Date(year, month - 1, day, +d[4], +d[5], +(d[6] ?? 0)) : new Date(year, month - 1, day, 12);
  return isNaN(date) ? null : { date, hasTime };
}
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

  let dateHasTime = false;
  for (const row of rows) {
    const inv = row.toUpperCase().match(INVOICE);
    if (inv && !out.invoiceNumber) {
      out.invoiceNumber = `${inv[1]}-${inv[2]}-${Number(inv[3].replace(/O/g, '0').replace(/I/g, '1'))}`;
    }
  }
  rows.forEach((row, i) => {
    // A date with a time wins (the PFR time); among those the last, as the PFR time follows the ESIR time.
    // The time may have landed on the next row.
    let d = readDate(row);
    if (d && !d.hasTime && TIME_ONLY.test(fixDigits(rows[i + 1] ?? ''))) d = readDate(`${row} ${rows[i + 1]}`) ?? d;
    if (d && (d.hasTime || !dateHasTime)) {
      out.date = d.date;
      dateHasTime = d.hasTime;
    }
  });

  const counters = readCounters(rows);
  const pfrCounter = out.invoiceNumber ? Number(out.invoiceNumber.split('-')[2]) : null;
  const match = counters.find(c => c.total === pfrCounter);
  const pick = match ?? counters.find(c => c.suffixed) ?? counters[0];
  if (pick) {
    out.counter = pick.text;
    out.counterSure = !!match;
  }

  // Header: the tax ID (9 digits) row, then the company, then the place of sale.
  const header = firstItem < 0 ? rows : rows.slice(0, firstItem);
  const pib = header.findIndex(r => /(^|\D)\d{9}(\D|$)/.test(r) && !INVOICE.test(r.toUpperCase()));
  if (pib >= 0) {
    out.shop = afterLabel(header[pib + 1] ?? '');
    out.place = afterLabel(header[pib + 2] ?? '');
  }

  // Total: the first single amount after the items ("Укупан износ"); else the printed amount equal to the
  // items' sum; else the largest amount printed at least twice (total and card payment), else the largest.
  if (firstItem >= 0) {
    const lastItem = rows.reduce((last, r, i) => (isItemRow(r) ? i : last), -1);
    for (const row of rows.slice(lastItem + 1)) {
      const amounts = row.match(MONEY);
      if (amounts?.length === 1) { out.total = amount(amounts[0]); out.totalSure = true; break; }
    }
  }
  const all = rows.flatMap(r => r.match(MONEY) ?? []).map(amount);
  if (out.total === null && out.items.length) {
    const sum = Math.round(out.items.reduce((s, i) => s + i.total, 0) * 100) / 100;
    const printed = rows.filter(r => !isItemRow(r)).flatMap(r => r.match(MONEY) ?? []).map(amount);
    if (printed.some(a => Math.abs(a - sum) < 0.005)) { out.total = sum; out.totalSure = true; }
  }
  if (out.total === null) {
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
    // A counter confirmed by the PFR number beats an unconfirmed one.
    counter: a.counterSure || !b.counterSure ? a.counter ?? b.counter : b.counter,
    counterSure: a.counterSure || b.counterSure,
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
  return {
    invoiceNumber: null, counter: null, counterSure: false, date: null, total: null, totalSure: false,
    shop: '', place: '', items: [],
  };
}

// Enough to save: the invoice number (duplicate check) and the date.
export const paperReady = p => !!(p.invoiceNumber && p.date);
