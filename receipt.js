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

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const journalLines = journal => decode(journal.replace(/<[^>]*>/g, '\n')).split('\n').map(l => l.trim()).filter(Boolean);

// "Предузеће: CRAFTER doo" style header lines; the label may also sit alone with the value on the next line.
function headerValue(lines, label) {
  const i = lines.findIndex(l => label.test(l));
  if (i < 0) return '';
  const rest = lines[i].replace(label, '').replace(/^\s*:?\s*/, '');
  return rest || lines[i + 1] || '';
}

// Company (legal name) from the journal header; falls back to the line after "ПИБ:".
export function shopName(journal) {
  const lines = journalLines(journal);
  const company = headerValue(lines, /^(Предузеће|Preduzeće|Preduzece)\s*:?/i);
  if (company) return company;
  const i = lines.findIndex(l => /^(ПИБ|PIB)\s*:/i.test(l));
  return i >= 0 && lines[i + 1] ? lines[i + 1].replace(/^[^:]{1,20}:\s*/, '') : '';
}

export const placeName = journal => headerValue(journalLines(journal), /^(Место продаје|Mesto prodaje)\s*:?/i);

const amount = s => Number(s.replace(/\./g, '').replace(',', '.'));
const ITEM_NUMBERS = /^(.*?)\s*(-?[\d.]+,\d{2})\s+(-?[\d.,]+)\s+(-?[\d.]+,\d{2})$/;

// Items from the journal's "Артикли" block: the name (may wrap over lines), then "price qty total".
export function journalItems(journal) {
  const lines = journalLines(journal);
  const start = lines.findIndex(l => /^(Назив|Naziv)(\s|$)/i.test(l));
  if (start < 0) return [];
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
