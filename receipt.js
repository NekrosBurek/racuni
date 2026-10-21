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

// shortcut: shop = the line right after "ПИБ:" in the journal header; returns '' if the layout differs.
export function shopName(journal) {
  const lines = journal.replace(/<[^>]*>/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  const i = lines.findIndex(l => /^(ПИБ|PIB)\s*:/i.test(l));
  return i >= 0 && lines[i + 1] ? lines[i + 1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
}

export const DEFAULT_FORMAT = '{datum} {prodavac} {iznos} RSD';
export const FORMAT_TOKENS = '{datum} {vreme} {prodavac} {iznos} {broj}';

export function fileName(format, r) {
  const ok = !isNaN(r.date);
  const pad = n => String(n).padStart(2, '0');
  const values = {
    datum: ok ? `${r.date.getFullYear()}-${pad(r.date.getMonth() + 1)}-${pad(r.date.getDate())}` : 'bez-datuma',
    vreme: ok ? `${pad(r.date.getHours())}.${pad(r.date.getMinutes())}` : '',
    prodavac: r.shop || '',
    iznos: r.total.toFixed(2),
    broj: r.invoiceNumber,
  };
  const name = format.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m))
    .replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${name || r.invoiceNumber}.pdf`;
}
