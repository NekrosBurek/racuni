// Renames saved receipts to the current name format without scanning again. Files saved from now on keep their
// naming data (description); older ones are read once from their PDF text through Drive.
import { fileName, shopName, placeName, journalItems } from './receipt.js';
import { legacyFields } from './legacy.js';

// Naming data from the text of a receipt PDF the app saved (the PURS journal).
export function dataFromText(text) {
  const f = legacyFields(text);
  return { ...f, shop: shopName(text) || f.shop, place: placeName(text) || f.place, items: journalItems(text) };
}

// [{ id, from, to, receipt }] for receipts whose name would change; ones without a date or anything to name them
// by are left alone rather than renamed to something worse.
export function renamePlan(receipts, format) {
  const plan = [];
  for (const r of receipts) {
    if (!r.date || !(r.shop || r.items?.length)) continue;
    const to = fileName(format, {
      date: r.date, total: r.total ?? 0, shop: r.shop, place: r.place, items: r.items ?? [], invoiceNumber: r.invoiceNumber ?? '',
    });
    if (to !== `${r.name}.pdf`) plan.push({ id: r.id, from: `${r.name}.pdf`, to, receipt: r });
  }
  return plan;
}
