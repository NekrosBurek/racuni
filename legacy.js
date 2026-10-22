// Fills in the data of receipts saved before the app kept it (or uploaded by hand): Drive extracts the PDF's text
// (drive.js pdfText), and the fields are found by their shape, since the PURS page prints labels and values in
// separate columns.
import { amount } from './paper.js';
import { shopName, placeName } from './receipt.js';

const INVOICE = /\b([A-Z0-9]{8})-([A-Z0-9]{8})-?\s*(\d{1,10})\b/;
const DATE_TIME = /(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const MONEY = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/;
const TOTAL_LABEL = /(За уплату|Укупан износ|Za uplatu|Ukupan iznos(?: računa)?|Iznos za plaćanje)/i;

export function legacyFields(text) {
  const out = { invoiceNumber: null, total: null, date: null, shop: '', place: '' };
  const inv = text.match(INVOICE);
  if (inv) out.invoiceNumber = `${inv[1]}-${inv[2]}-${Number(inv[3])}`;

  const d = text.match(DATE_TIME);
  if (d) {
    const date = new Date(+d[3], +d[2] - 1, +d[1], +d[4], +d[5], +(d[6] ?? 0));
    if (!isNaN(date) && date.getMonth() === +d[2] - 1) out.date = date;
  }

  // The first amount after the "to pay" label; labels and values may be in separate blocks.
  const label = text.search(TOTAL_LABEL);
  const money = (label >= 0 ? text.slice(label) : text).match(MONEY);
  if (money) out.total = amount(money[0]);

  out.shop = shopName(text);
  out.place = placeName(text);
  return out;
}
