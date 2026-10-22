import { shopTag, itemsTag } from './naming.js';

// Serbian fiscal receipt QR: https://suf.purs.gov.rs/v/?vl=<base64 of the signed invoice header>.
// The header holds the invoice number, so duplicates are detected without any network call.
export function parseReceiptUrl(text) {
  let url;
  try { url = new URL(text); } catch { throw new Error('QR nije link.'); }
  const vl = url.searchParams.get('vl');
  if (!url.hostname.endsWith('suf.purs.gov.rs') || !vl) throw new Error('Ovo nije QR fiskalnog računa.');

  const bin = atob(vl.replace(/-/g, '+').replace(/_/g, '/'));
  const b = Uint8Array.from(bin, c => c.charCodeAt(0));
  if (b.length < 41) throw new Error('Neispravan QR računa.');
  const dv = new DataView(b.buffer);
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));

  const requestedBy = ascii(1, 9);
  const signedBy = ascii(9, 17);
  if (!/^[A-Z0-9]{8}$/.test(requestedBy) || !/^[A-Z0-9]{8}$/.test(signedBy)) {
    throw new Error('Neispravan QR računa.');
  }
  const counter = dv.getUint32(17, true);
  const total = Number(dv.getBigUint64(25, true)) / 10000;
  // shortcut: date endianness picked by plausibility; drop the fallback once confirmed on real receipts.
  let ms = Number(dv.getBigUint64(33, false));
  if (ms < Date.UTC(2015, 0) || ms > Date.UTC(2100, 0)) ms = Number(dv.getBigUint64(33, true));
  const date = new Date(ms);

  return { url: text, invoiceNumber: `${requestedBy}-${signedBy}-${counter}`, total, date };
}

// The verification page shows the receipt journal (text as printed, incl. QR image) in a <pre>.
export function extractJournal(html) {
  const m = html.match(/<pre[\s\S]*?<\/pre>/i);
  if (!m) throw new Error('Račun još nije dostupan na sajtu Poreske uprave. Pokušaj kasnije.');
  return m[0];
}

// The PURS page writes its Cyrillic labels as numeric entities ("&#x41F;&#x440;…" = "Пр…"), so those are decoded too.
const decode = s => s.replace(/&nbsp;/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/ /g, ' ')
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const journalLines = journal => decode(journal.replace(/<[^>]*>/g, '\n')).split('\n').map(l => l.trim()).filter(Boolean);

// "Предузеће: CRAFTER doo" style header lines. A value on the label's own line wins; otherwise the next line, unless
// that is another label (PDF text of the PURS page can list all labels first and the values after them).
const LABEL_ONLY = /^[^\d:]{2,30}:\s*$/;
function headerValue(lines, label) {
  let next = '';
  for (const [i, line] of lines.entries()) {
    if (!label.test(line)) continue;
    const rest = line.replace(label, '').replace(/^\s*:?\s*/, '');
    if (rest) return rest;
    if (!next && lines[i + 1] && !LABEL_ONLY.test(lines[i + 1])) next = lines[i + 1];
  }
  return next;
}

// Company (legal name) from the journal header; falls back to the line after "ПИБ:".
export function shopName(journal) {
  const lines = journalLines(journal);
  const company = headerValue(lines, /^(Предузеће|Preduzeće|Preduzece)\s*:?/i);
  if (company) return company;
  const i = lines.findIndex(l => /^(ПИБ|PIB)\s*:/i.test(l));
  const afterPib = i >= 0 && lines[i + 1] ? lines[i + 1].replace(/^[^:]{1,20}:\s*/, '') : '';
  if (afterPib) return afterPib;
  return bareHeader(journal)?.company ?? '';
}

// Journals that print the tax number alone under the title: "=== ФИСКАЛНИ РАЧУН ===", "112069571", "CRAFTER doo",
// "1405628-mts W …". Drive's text of a saved PDF joins those lines with runs of spaces ("…===  100416234 \r\n
// TEHNOMANIJA DOO BEOGRAD   1061841-T033"), so the header is split on line breaks and on 2+ spaces alike.
function bareHeader(journal) {
  const text = decode(journal.replace(/<[^>]*>/g, '\n'));
  const m = text.match(/(?:ФИСКАЛНИ РАЧУН|FISKALNI RA[ČC]UN)([\s\S]*?)(?:Касир|Kasir|ЕСИР|ESIR|$)/i);
  if (!m) return null;
  const parts = m[1].split(/\r?\n|\s{2,}/).map(s => s.replace(/^=+|=+$/g, '').trim()).filter(Boolean);
  if (!/^\d{9}$/.test(parts[0] ?? '') || !parts[1]) return null;
  return { company: parts[1], place: (parts[2] ?? '').replace(/^\d+-\s*/, '') };
}

// "Место продаје: …", else the line under the company in a journal that prints the tax number alone
// ("1405628-mts W Vrnjačka Banja" -> "mts W Vrnjačka Banja").
export function placeName(journal) {
  const lines = journalLines(journal);
  const labeled = headerValue(lines, /^(Место продаје|Mesto prodaje)\s*:?/i);
  if (labeled) return labeled;
  return bareHeader(journal)?.place ?? '';
}

// The verification page prints "Предузеће: …" and "Место продаје: …" above the receipt itself; that header is
// tried first, the journal's own header second.
export function receiptHeader(html, journal) {
  const page = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<pre[\s\S]*?<\/pre>/gi, '');
  return {
    shop: shopName(page) || shopName(journal),
    place: placeName(page) || placeName(journal),
  };
}

const amount = s => Number(s.replace(/\./g, '').replace(',', '.'));
const ITEM_NUMBERS = /^(.*?)\s*(-?[\d.]+,\d{2})\s+(-?[\d.,]+)\s+(-?[\d.]+,\d{2})$/;

// Items from the journal's "Артикли" block: the name (may wrap over lines), then "price qty total".
export function journalItems(journal) {
  const lines = journalLines(journal);
  const start = lines.findIndex(l => /^(Назив|Naziv)(\s|$)/i.test(l));
  if (start < 0) return flatItems(journal);
  const items = [];
  let name = '';
  for (const line of lines.slice(start + 1)) {
    if (/^-{5,}|^={5,}|^(Укупан износ|Ukupan iznos)/i.test(line)) break;
    const m = line.match(ITEM_NUMBERS);
    if (!m) { name = `${name} ${line}`.trim(); continue; }
    name = `${name} ${m[1]}`.trim();
    if (name) items.push({ name, quantity: amount(m[3]), total: amount(m[4]) });
    name = '';
  }
  return items;
}

// The verification page loads the exact item list from /specifications with a token embedded in its script.
// Items from text whose lines were merged (Drive's text of a saved PDF): the block between the column header and
// the dashed line, read as consecutive "name price qty total" runs.
function flatItems(journal) {
  const flat = decode(journal.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
  const block = flat.match(/(?:Назив|Naziv) (?:Цена|Cena) (?:Кол|Kol)\.? (?:Укупно|Ukupno) (.*?) -{5,}/i)?.[1];
  if (!block) return [];
  const items = [];
  for (const m of block.matchAll(/\s*(.+?) (-?[\d.]+,\d{2}) (-?[\d.,]+) (-?[\d.]+,\d{2})(?= |$)/g)) {
    items.push({ name: m[1].trim(), quantity: amount(m[3]), total: amount(m[4]) });
  }
  return items;
}

export function specificationRequest(html) {
  const token = html.match(/viewModel\.Token\('([^']+)'\)/)?.[1];
  const invoiceNumber = html.match(/viewModel\.InvoiceNumber\('([^']+)'\)/)?.[1];
  return token && invoiceNumber ? { invoiceNumber, token } : null;
}

export function specificationItems(json) {
  if (!json?.success || !Array.isArray(json.items)) return [];
  return json.items.map(i => ({ name: String(i.name ?? ''), quantity: Number(i.quantity), total: Number(i.total) }))
    .filter(i => i.name && Number.isFinite(i.total));
}

export const DEFAULT_FORMAT = '{datum}_{radnja}_{stavke}';
export const FORMAT_TOKENS = '{datum} {vreme} {radnja} {stavke} {prodavac} {iznos} {broj}';

export function fileName(format, r) {
  const ok = !isNaN(r.date);
  const pad = n => String(n).padStart(2, '0');
  const values = {
    datum: ok ? `${r.date.getFullYear()}-${pad(r.date.getMonth() + 1)}-${pad(r.date.getDate())}` : 'bez-datuma',
    vreme: ok ? `${pad(r.date.getHours())}.${pad(r.date.getMinutes())}` : '',
    prodavac: r.shop || '',
    iznos: r.total.toFixed(2),
    broj: r.invoiceNumber,
    radnja: shopTag({ company: r.shop || '', place: r.place || '' }),
    stavke: itemsTag(r.items),
  };
  const name = format.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m))
    .replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ')
    .replace(/_{2,}/g, '_').replace(/^[\s_-]+|[\s_-]+$/g, ''); // empty parts leave no stray separators
  return `${name || r.invoiceNumber}.pdf`;
}
