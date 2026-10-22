// Everything about a receipt beyond what was printed on it: warranty, installments, category, plus the monthly
// budget and item price history built from all receipts. The per-receipt values are stored as the Drive file's
// appProperties (warranty, rate, category), the budget on the folder, so family members sharing a folder see them too.
import { itemWords, plain } from './naming.js';
import { chainKey } from './shops.js';
import { monthKey } from './stats.js';

export const WARRANTY_CHOICES = [0, 12, 24, 36, 60]; // months
export const INSTALLMENT_CHOICES = [0, 3, 6, 12, 18, 24, 36];
export const CATEGORIES = ['Hrana', 'Drogerija', 'Apoteka', 'Tehnika', 'Kuća', 'Gorivo', 'Auto', 'Odeća', 'Restorani', 'Telefon i internet', 'Ostalo'];

const BY_TAG = {
  maxi: 'Hrana', delhaize: 'Hrana', idea: 'Hrana', mercator: 'Hrana', mercators: 'Hrana', roda: 'Hrana',
  lidl: 'Hrana', univerexport: 'Hrana', aman: 'Hrana', tempo: 'Hrana', metro: 'Hrana',
  dm: 'Drogerija', lilly: 'Drogerija', benu: 'Apoteka',
  gigatron: 'Tehnika', tehnomanija: 'Tehnika', winwin: 'Tehnika', emmezeta: 'Kuća', jysk: 'Kuća', ikea: 'Kuća',
  momax: 'Kuća', lesnina: 'Kuća', crafter: 'Kuća', obi: 'Kuća', merkur: 'Kuća',
  nis: 'Gorivo', omv: 'Gorivo', mol: 'Gorivo', lukoil: 'Gorivo',
  telekom: 'Telefon i internet', yettel: 'Telefon i internet', a1: 'Telefon i internet', sbb: 'Telefon i internet',
  decathlon: 'Odeća', sportvision: 'Odeća', zara: 'Odeća', hm: 'Odeća', mcdonalds: 'Restorani',
};
const BY_WORD = [
  [/APOTEK/, 'Apoteka'], [/PEKAR|MARKET|MESAR|PIJAC/, 'Hrana'], [/PETROL|BENZIN|PUMPA/, 'Gorivo'],
  [/AUTO|VULKANIZ|SERVIS/, 'Auto'], [/RESTORAN|KAFE|CAFE|PIZZ|BURGER|GRILL|KAFANA|BISTRO/, 'Restorani'],
];

// What the items are, for shops that aren't a known chain. More specific rules first ("ULJE ZA MOTOR" before "ULJE").
const ITEM_RULES = [
  [/ULJE ZA MOTOR|MOTORNO ULJE|FILTER|PNEUMATIK|\bGUM[AE]\b|AKUMULATOR|TERMOSTAT|VILJUSK|KOCION|AMORTIZ|SVECIC|BRISAC/, 'Auto'],
  [/BENZIN|DIZEL|\bBMB\b|\bTNG\b|AUTOGAS/, 'Gorivo'],
  [/TABLET|KAPSUL|SIRUP|\bLEK\b|VITAMIN|BRUFEN|PARACETAMOL|ANDOL|KAPI ZA/, 'Apoteka'],
  [/SAMPON|GEL ZA|PASTA ZA ZUBE|DEZODORANS|DETERDZENT|OMEKSIVAC|SAPUN|TOALET PAPIR|PELENE|KREMA|MARAMIC|CETKIC|BRIJAC/, 'Drogerija'],
  [/KLIMA|INVERTER|TELEVIZOR|\bTV\b|FRIZIDER|MASIN[AE] ZA|USISIVAC|LAPTOP|TELEFON|SLUSALIC|PUNJAC|MONITOR|BOJLER|SPORET|MIKROTALAS|TABLET RACUNAR/, 'Tehnika'],
  [/POSTELJIN|JASTU|PLAFONJER|SIJALIC|\bLED\b|PRIKLJUCNIC|UTICNIC|PREKIDAC|MASKA|DOZNA|BOJA ZA|SRAF|TEPIH|ZAVES|LAMP[AE]|OSVEZIVAC|CISTAC/, 'Kuća'],
  [/MAJIC|PANTALON|JAKN|PATIK|CIPEL|CARAP|DUKS|HALJIN|FARMERK|KOSULJ/, 'Odeća'],
  [/PIZZ|BURGER|SENDVIC|PLJESKAVIC|CEVAP|ESPRESSO|CAPPUCCINO|KAFA ZA PONETI/, 'Restorani'],
  [/MLEKO|HLEB|JOGURT|\bSIR\b|MESO|PILET|SVINJ|JUNET|JAJA|BRASNO|SECER|ULJE|KAFA|\bCAJ\b|\bSOK\b|VODA|PIVO|VINO|COKOLAD|KEKS|BANAN|JABUK|KROMPIR|\bLUK\b|PARADAJZ|TESTENIN|PIRINAC|SALAM|KOBASIC|PASTET|PAVLAK|MARGARIN|PUTER|NAPOLITANK|CIPS|SLADOLED|PECIV|KIFL|BUREK/, 'Hrana'],
];

// The category the items cost most in, or null when none of them is recognized.
function itemsCategory(items) {
  const totals = new Map();
  for (const item of items ?? []) {
    const name = plain(String(item.name));
    const c = ITEM_RULES.find(([re]) => re.test(name))?.[1];
    if (c) totals.set(c, (totals.get(c) ?? 0) + Math.abs(item.total || 0) + 0.01); // +0.01: zero-priced items still count
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// The category the user picked, else the chain's, else what the items are, else a guess from the shop's name.
export function category(r) {
  if (r.category && CATEGORIES.includes(r.category)) return r.category;
  const key = chainKey(r);
  if (BY_TAG[key]) return BY_TAG[key];
  const fromItems = itemsCategory(r.items);
  if (fromItems) return fromItems;
  const words = plain(`${r.shop || ''} ${r.place || ''}`);
  return BY_WORD.find(([re]) => re.test(words))?.[1] ?? 'Ostalo';
}

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), 12);
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();

export function warranty(r, now = new Date()) {
  if (!r.warrantyMonths || !r.date) return null;
  const end = addMonths(r.date, r.warrantyMonths);
  return { end, active: end >= now, daysLeft: Math.ceil((end - now) / 86400000) };
}

// "2026-11" -> 1 Nov 2026; the first installment's month when the user set one, else the month after purchase.
export function firstInstallment(r) {
  const m = /^(\d{4})-(\d{2})$/.exec(r.rateStart || '');
  return m ? new Date(+m[1], +m[2] - 1, 1, 12) : new Date(r.date.getFullYear(), r.date.getMonth() + 1, 1, 12);
}

// A month's installment counts as paid once that month has begun.
export function installments(r, now = new Date()) {
  if (!r.installments || !r.date || r.total === null) return null;
  const count = r.installments;
  const perMonth = Math.round((r.total / count) * 100) / 100;
  const first = firstInstallment(r);
  const paid = Math.min(count, Math.max(0, monthsBetween(first, now) + 1));
  const left = count - paid;
  return {
    count, paid, left, perMonth,
    remaining: Math.round(perMonth * left * 100) / 100,
    firstDue: first,
    nextDue: left ? addMonths(first, paid) : null,
    lastDue: addMonths(first, count - 1),
  };
}

// Months offered as the first installment: the purchase month and the three after it.
export const firstInstallmentChoices = r =>
  Array.from({ length: 4 }, (_, i) => new Date(r.date.getFullYear(), r.date.getMonth() + i, 1, 12));
export const monthValue = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Warranty reminders 30 and 7 days before the end, at 10:00, only those still ahead of now.
export function warrantyReminders(receipts, label, now = new Date()) {
  const out = [];
  for (const r of receipts) {
    const w = warranty(r, now);
    if (!w?.active) continue;
    for (const days of [30, 7]) {
      const at = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate() - days, 10);
      if (at <= now) continue;
      out.push({
        id: `warranty-${r.id}-${days}`,
        date: at,
        title: 'Garancija ističe',
        body: `${label(r)}: garancija ističe ${w.end.toLocaleDateString('sr-RS')} (za ${days} dana).`,
      });
    }
  }
  return out;
}

// This month's spending against the budget (0 = no budget set).
export function budgetStatus(receipts, budget, now = new Date()) {
  const key = monthKey(now);
  const spent = Math.round(receipts.filter(r => monthKey(r.date) === key).reduce((s, r) => s + (r.total ?? 0), 0) * 100) / 100;
  if (!budget) return { spent, budget: 0, ratio: 0, left: 0 };
  return { spent, budget, ratio: spent / budget, left: Math.round((budget - spent) * 100) / 100 };
}

export function categoryTotals(receipts, now = new Date()) {
  const key = monthKey(now);
  const totals = new Map();
  for (const r of receipts) {
    if (monthKey(r.date) !== key || r.total === null) continue;
    const c = category(r);
    totals.set(c, Math.round(((totals.get(c) ?? 0) + r.total) * 100) / 100);
  }
  return [...totals.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}

// Every purchase of items matching the query, grouped by item and newest first, with the unit price where the
// quantity is known.
export function priceHistory(receipts, query) {
  const words = plain(query).split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return [];
  const groups = new Map();
  for (const r of receipts) {
    for (const item of r.items ?? []) {
      const key = itemWords(item.name).join(' ');
      if (!key || !words.every(w => key.includes(w))) continue;
      const unit = item.quantity ? Math.round((item.total / item.quantity) * 100) / 100 : item.total;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ date: r.date, shop: r.shop, price: unit, receipt: r });
    }
  }
  return [...groups.entries()]
    .map(([name, buys]) => {
      buys.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
      const prices = buys.map(b => b.price);
      return { name, buys, min: Math.min(...prices), max: Math.max(...prices) };
    })
    .sort((a, b) => b.buys.length - a.buys.length)
    .slice(0, 20);
}
