// Receipt list helpers: what a Drive file says about its receipt, monthly groups, spending stats and CSV export.
// Files saved by the app carry appProperties (total, date, shop, invoiceNumber); older or hand-uploaded ones only
// have a name, so the date and shop are read from names like "2025-12-20_AutoKraljevo_…" where possible.

const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];

// What the file name is built from, kept in the Drive file's description (appProperties allow only ~120 bytes),
// so names can be rebuilt later without scanning again.
export function receiptDescription(r) {
  const items = (r.items ?? []).slice(0, 60).map(i => ({ n: String(i.name).slice(0, 80), t: i.total, ...(i.quantity ? { q: i.quantity } : {}) }));
  return JSON.stringify({ racuni: 1, place: r.place || '', items });
}

function readDescription(text) {
  try {
    const d = JSON.parse(text);
    if (d?.racuni !== 1) return null;
    return { place: d.place || '', items: (d.items || []).map(i => ({ name: i.n, total: i.t, quantity: i.q ?? null })) };
  } catch {
    return null;
  }
}

export function receiptInfo(file) {
  const p = file.appProperties ?? {};
  const described = file.description ? readDescription(file.description) : null;
  const base = file.name.replace(/\.pdf$/i, '');
  const named = base.match(/^(\d{4})-(\d{2})-(\d{2})[_ ]+([^_ ]+)?/);
  let date = p.date ? new Date(p.date) : null;
  if ((!date || isNaN(date)) && named) date = new Date(+named[1], +named[2] - 1, +named[3], 12);
  if ((!date || isNaN(date)) && file.createdTime) date = new Date(file.createdTime);
  if (date && isNaN(date)) date = null;
  const total = p.total !== undefined && p.total !== '' && Number.isFinite(Number(p.total)) ? Number(p.total) : null;
  return {
    id: file.id,
    name: base,
    shop: p.shop || named?.[4]?.replace(/([a-z])([A-Z])/g, '$1 $2') || '',
    // Only taken from the file name, whose second part may be an item ("…_Beko_Masine…"), not the shop.
    shopGuessed: !p.shop,
    total,
    date,
    invoiceNumber: p.invoiceNumber || null,
    place: described?.place ?? '',
    items: described?.items ?? null, // null: not stored (older file), [] would mean none
    link: file.webViewLink,
    // Drive's first-page preview (short-lived link, needs the token); asked for at a size that fills a grid card.
    thumb: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, '=s600') : null,
    // Saved by this app: has the data that duplicates and totals rely on.
    complete: !!p.invoiceNumber && total !== null,
    // Older file already read once by "Dopuni" with the current reader; '1' was an earlier reader that missed shops.
    checked: p.checked === '2',
    // Set by the user in the receipt view (see plans.js).
    warrantyMonths: Number(p.warranty) || 0,
    installments: Number(p.rate) || 0,
    rateStart: p.rateStart || '', // YYYY-MM of the first installment
    category: p.category || '',
  };
}

// "1204155 BEKO Mašine za pranje veša B3WFU48215WW ES (Ђ)" -> "Beko mašine za pranje veša": codes, units and the
// tax label dropped, sentence case.
export function itemLabel(name) {
  const words = String(name)
    .replace(/\s*\([^)]{1,3}\)\s*$/, '')
    .replace(/_\d+/g, ' ')
    .replace(/\/\s*\S{1,4}\.?(?=\s|$)/g, ' ')
    .split(/\s+/)
    .filter(w => w && !/\d/.test(w) && (w.length > 2 || /^(i|u|sa|za|na|od|do)$/i.test(w)));
  const text = words.join(' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The biggest item on the receipt, plus how many others there are.
export function itemsSummary(r) {
  const items = (r.items ?? []).filter(i => itemLabel(i.name));
  if (!items.length) return '';
  const main = [...items].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
  return itemLabel(main.name) + (items.length > 1 ? ` +${items.length - 1}` : '');
}

export const monthKey = d => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'bez-datuma');
export const monthLabel = key => {
  if (key === 'bez-datuma') return 'Bez datuma';
  const [y, m] = key.split('-');
  return `${MONTHS[+m - 1][0].toUpperCase()}${MONTHS[+m - 1].slice(1)} ${y}`;
};

const sum = list => Math.round(list.reduce((s, r) => s + (r.total ?? 0), 0) * 100) / 100;

// Newest month first; each section knows its total and count.
export function groupByMonth(receipts) {
  const groups = new Map();
  for (const r of [...receipts].sort((a, b) => (b.date ?? 0) - (a.date ?? 0))) {
    const key = monthKey(r.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].map(([key, data]) => ({ key, title: monthLabel(key), total: sum(data), data }));
}

export function filterReceipts(receipts, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return receipts;
  return receipts.filter(r => {
    const text = `${r.shop} ${r.name} ${r.total ?? ''} ${r.date ? r.date.toLocaleDateString('sr-RS') : ''}`.toLowerCase();
    return words.every(w => text.includes(w));
  });
}

// This month vs last month, the average receipt, the shops you spend most at, and the last 6 months.
export function spendingStats(receipts, now = new Date()) {
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const inMonth = key => receipts.filter(r => monthKey(r.date) === key);
  const priced = receipts.filter(r => r.total !== null);
  const shops = new Map();
  for (const r of priced) {
    const name = r.shop || 'Nepoznato';
    const s = shops.get(name) ?? { shop: name, total: 0, count: 0 };
    s.total = Math.round((s.total + r.total) * 100) / 100;
    s.count += 1;
    shops.set(name, s);
  }
  const months = Array.from({ length: 6 }, (_, i) => {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    return { key, label: MONTHS[+key.slice(5) - 1].slice(0, 3), total: sum(inMonth(key)) };
  });
  return {
    thisMonth: { total: sum(inMonth(thisKey)), count: inMonth(thisKey).length },
    lastMonth: { total: sum(inMonth(lastKey)), count: inMonth(lastKey).length },
    average: priced.length ? Math.round((sum(priced) / priced.length) * 100) / 100 : 0,
    topShops: [...shops.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    months,
    missingTotals: receipts.length - priced.length,
  };
}

// Semicolon-separated with a decimal comma, which is what Excel and Sheets expect with Serbian settings.
export function toCsv(receipts) {
  const cell = v => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Datum', 'Radnja', 'Iznos (RSD)', 'PFR broj računa', 'Fajl']];
  for (const r of [...receipts].sort((a, b) => (a.date ?? 0) - (b.date ?? 0))) {
    rows.push([
      r.date ? r.date.toLocaleDateString('sr-RS') : '',
      r.shop,
      r.total !== null ? r.total.toFixed(2).replace('.', ',') : '',
      r.invoiceNumber ?? '',
      r.name,
    ]);
  }
  return `﻿${rows.map(row => row.map(cell).join(';')).join('\r\n')}\r\n`;
}
