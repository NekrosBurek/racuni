// Run: node receipt.test.mjs
import assert from 'node:assert';
import {
  parseReceiptUrl, extractJournal, shopName, placeName, journalItems, specificationRequest, specificationItems, fileName, DEFAULT_FORMAT,
} from './receipt.js';
import { itemsTag, shopTag } from './naming.js';

const b = new Uint8Array(60);
const dv = new DataView(b.buffer);
b[0] = 3;
b.set([...'ABCD1234'].map(c => c.charCodeAt(0)), 1);
b.set([...'WXYZ9876'].map(c => c.charCodeAt(0)), 9);
dv.setUint32(17, 4521, true);
dv.setBigUint64(25, 12345678n, true); // 1234.5678 RSD
dv.setBigUint64(33, BigInt(Date.UTC(2026, 9, 21, 10)), false);
const vl = encodeURIComponent(btoa(String.fromCharCode(...b)));

const r = parseReceiptUrl(`https://suf.purs.gov.rs/v/?vl=${vl}`);
assert.equal(r.invoiceNumber, 'ABCD1234-WXYZ9876-4521');
assert.equal(r.total, 1234.5678);
assert.equal(r.date.toISOString().slice(0, 10), '2026-10-21');
assert.equal(fileName('{broj} {iznos}', r), 'ABCD1234-WXYZ9876-4521 1234.57.pdf');
assert.match(fileName('{datum} {prodavac} {iznos} RSD', { ...r, shop: 'MAXI/123' }), /^2026-10-21 MAXI 123 1234.57 RSD\.pdf$/);
assert.equal(fileName('{prodavac}', { ...r, shop: '' }), 'ABCD1234-WXYZ9876-4521.pdf');
assert.equal(shopName(`<pre>=== ФИСКАЛНИ РАЧУН ===
ПИБ: 100000000
DELHAIZE &amp; CO
Maxi 123</pre>`), 'DELHAIZE & CO');
assert.equal(shopName('<pre>nema</pre>'), '');

// Real receipts (QR codes read from the user's PDFs): header fields decode as printed on them.
const REAL = [
  ['https://suf.purs.gov.rs/v/?vl=A1lUM1NBSk5IWVQzU0FKTkhh0AMAx8kDAFAjXAMAAAAAAAABoVPLppYAAABxIrlWwMgQjOmEa54%2FPFVuEiwDsqECjysT5TNqo5XN7PDNTDhVgH2FzDas7Igb13Izt9QSpfGgJiD6JgBQt%2F%2FG40IfbpSCfOFMCLLVvpqoXJPzFWshJopCLq6ZujT5rsmWMjrhfCmpfkqHItu0IXljVapug87%2BAWlnzhGITUnknepBrh5Rs9HAVRH59vPgLkcneszlx8dX5iAwl0g1D8Jem%2BCAmKffi5ElTWVJvPyhNtzpDqVhfcu2pxY%2BVrubtkGLPFgwhklh8SNIfssWEu2IxSHdYdrVUtULsAozO2IYj08T6ZKpUZBD5%2B1%2BF8VHWf2PL9LVStSEJrKPJ57EKN%2BOPgfveiVq049eiRqBI60YuR70b61QtyBW1aRCb%2FNzgXJdyQcBG4WAjV5n5RJvqRdWpysjCMxjjFNkhJU%2Fx7KApVYF1Y6CQ4I05CXvEuPR%2B%2FKhMJJUv1EiCfT%2FpchMYV6trR1PCLtIb4TPzS9kHFPDkSZ6HT90c26GQnEogkyfIR%2FjAF3P9iUgQRp%2FQx%2BZfLawrkT2blsc9TMZuiY7hHs5zSRsb0LycJtklgbF0MRHTi2OWOXTt0N%2B%2BulhSUfspuO1l5GL4720vIKRV0WT4j1daBTIFT7P66GL%2BxsqJuAzoqUwa%2FYJ9ArFjqZtbVi2p%2FyasW%2FRTZ3E1JRDwgDy0jgey0w5sStpuKAOMukwt0EC1io%3D', 'YT3SAJNH-YT3SAJNH-249953', 5637, '2026-10-19'],
  ['https://suf.purs.gov.rs/v/?vl=A1UyMjMyNDVaMzcyQTVXTzA%2BAAAAPgAAAFDUahsAAAAAAAABoV3uu64AAACNNZ0QYSzt%2BPYJneifpz6WoZY2CNuFN%2Bb0zkEAyIDwnc15PL0E%2FAFo9SxIxC3tECEzncBAj6Mrmbvux7aRD1KbQehWyvb4vh47Qp3SnjUxERYTIb6um%2B7t26%2BakL7i6c8OFyOs%2FPgcLhMZZnPPKDe%2BSTk7dZD4ExUD2v2ZfwXa3EWYkLfydlVPJOu9thmem%2BYzO3nlywh1vbinmERhI%2B9kYadBSgLTo%2F0yp4Wgz0eUveshy6tyACcYMjjDAYyp%2BDTAiiVCukUySf1mAkiy0sQh7xl3MsPRuJ8fuC1uqbbExynTPBT3PqIt78ZTEFAe7TUJZ%2B7Ejt6vSeZDzrBHq%2BkCcAsUsF8BiOg5Z1UrhrEyXkjabCngNvLytikXl%2BTYrc2YWrnDNzuNKTeQr%2BfnlwPjDmMdsaFxfg8YavpOFZolPbDLg%2BIgNaZSJL%2B0XNHOKABy1M3WRcvAM3P9MbpKubbMyT0eDl%2BlXVi2lZN6eU10PkzgbjbZpoo4NrdhD%2FMBRZ%2FDVb8FXVvu9%2FkHXceD9R47SNNVSBOD1jFniXP7yaWa5SEBfU26DRpOjqSI%2FKbXvumVFSNMxxL3W9H2Nt58vhYWSLsyWynQswPe2j34VP8mgwvRySfbo09Myr5p91%2FIvYGHEnIlT901Lm51DApkdNpvz7ifAIgWCAqX5gy6YBFYSQHm7b1NZ1AIM6gz6Z0KAMw%3D', 'U223245Z-372A5WO0-62', 45998.6, '2026-10-21'],
  ['https://suf.purs.gov.rs/v/?vl=A1VGSks5NVpQR0VTRTZITzC5AAAAuAAAAIjvbxgAAAAAAAABoIas83QAAAATGreTijDRIg5Fy5THPGrutPBwJkUpz77UO%2BFs%2BaN1UJiIJM85V%2FFljYn73IIPVLop9ymYJul7A1Ap7sJY8VOKos3j%2FQoUBtEV9GF1d9vBlreTBuDCVmfKbT9hSRnssMLM9dald1n49W8tpzKUI6ag4Xp5yZX%2FgkIXlX%2BMaPXmv4B71rEnORxfn19MRB3tzJdXqWcahPnmdMiA2XBuAE819HEw0GaBmOiuAq%2FTdK0a2ScWNGDG4gsrEgKGpNZ8A7RpNzHQKjg79KGopLWSLR%2FwlwXkhELDJEPz6gKcqLWuvKlnSBCmfsY0hIQh9VmK7DGqZipKw0bjTUhp57Myffefpz%2F%2B8gkG5Ez9Uka0YV6PY9nAWrIdnLipwZB%2BkN1VV%2F5tzbUMMbBlfUzGfKXvAhglUWfHml29y2ziv0iLpiKIejUJKpbO9HyCUtbeU5b5nsuHpRRh4ZAhOpVv1mO9rbkhy4MSMWcb8V8RWR0XVSzUI71YWgw9U935ri0v%2Bn3eoJTYPKI2wcICPB51UvBaijAegR6z%2Bem1cS7ikhv5bBY%2BogEBrhwiV88LjrsFXTE6aJPAu%2FWdmWbMWvXSApO0%2FetSDy02rpmK%2FCFbLBsTN8JclO8ylizu2sRb0WxNecX2OCmkiiO24x9hUhAcPVf9jV%2FtJ3rPrUxUlMhEGGc7To4epIHFSzM7tt6Z%2FKYAzT1uWZA%3D', 'UFJK95ZP-GESE6HO0-185', 40998.9, '2026-09-09'],
  ['https://suf.purs.gov.rs/v/?vl=A0JIUU5CSjNGQkhRTkJKM0Y%2FoQAAM34AAKCqSAgAAAAAAAABmB2ANXAAAACJ9i9WXEIlRth6SNIFAN%2Bh9qPFrDKRx%2FVTCRQ%2FRhhxSccrj2t4%2BtGKZ9XmE4%2FWWKLIVbJiGAIt9eK7zp8mgyNT3JTaT1oZIRYaRDX89UjLDVIm%2BbLwvhG5cgIfCaeuxLOJqS4fcNkFIzgoxUVnOwyrPTQWHNm9qoPMe0zhbYa8sa64BsUNDJBLXy0VSt0AZqbaBS9x0Syd192iN9Ea%2B1wK6l%2Fb2%2Fb1CQZkaHZUdqSQCNkcu%2FqwQLEpJXcqN8680m4AP2Hmyb9HbABWART6xUQUaDCfQ%2BFqDMaH1%2ByE%2B38ySaxuitivlWUUmrgN37Ob9VKgWoCNKzSxetSh9Jh4zUbbC3fTkRC%2BRbR%2BKLSR1h0o9o2emMWruCTt4LhQsFZR6Ps5OYww3lMijXmMy17QmzBJH7DsE1hiGyD7i22mL0qdvzDoeXOMP3XJ0PhHgWx%2FFu%2FPzXpWTRpI2VST9J%2Bt1qTd%2FEEqIun47w4%2FKQpqbKtwOEXfosHJIzTzym%2B%2F9Pcu6SnvecryJc%2F1mdaLsxn3lVSdcMEO9KMu15yEKMNQE85FyDdtTLrDuM2osGhdb0cN0Kphylp3ljWjeX%2B9pg370yCr%2FQZ8KV2wcu9BHF1o%2FPWwZAOTkKs59lO1Hjv5QP4ZYFrtyHNO0SS%2B4gRm8DitD0%2BlAYotjjNj8nwsNmJmjZNcyWN7EvZ25cYKF1EN2Ihv%2B7g%3D', 'BHQNBJ3F-BHQNBJ3F-41279', 13898, '2025-07-18'],
  ['https://suf.purs.gov.rs/v/?vl=A0RGWTdRVlNWREZZN1FWU1ZObQAAI2kAAABjnwIAAAAAAAABmzr6OeAAAACSItiEG8DuVy3Bfi41XdFDuoUbwNiwJPlVJpY42F8IFekaN2dsr8n1akTB0qzvbT%2BCo2B3GiWe0o1sbkCBvQjZlr%2Bc%2Fr461J3vKYMyvXxxAQFH1WbbhlgqW1GsgJTmSb3fvtZ2FjkqWjt46KQJ6eluNzIZNUAzvgid9fvb38C%2FaGCuMR7fJpxx8O5XPAdyP1Jd6RUSqiLjWIaTuPc5AEXi0kz7iQj6oGfY9ykj0ycMrxWorLcAwbfcuUFe%2BHGFBF%2Bse%2B%2FkGiQdcVYE3G5ie6cxjS1E4BLETcTlIpxiqeZ5Yj5QCK20Ovk6dOJiq9E3QIE26QqPAlcyWfBhyifP7sgrATTvmaBZBg37Xwz4FV4vCNao22jljX9%2FTkqvg7hHHlu89NULF9vEjnap5omHmqWn0h9lMVTOffdXIqthDMJP4xZWTPXnnDxa2anu%2FcNWwZZOj1B96P5tmqWoX8wqtB23recqSBLYt8OCvJvrAIkQq4jfxwMTj%2Bzr03adDf%2F29Uwi6xJOb7UVcz06feZCOMReDXgFHziGmIXcpOdhdI1dliC%2B5Nob7QildBjmv5H6YJ7yiaO7hdUWaQ4sRZK75uN6hfsW62s7RX8DkoqAuDlpGxIIWBwjxcUcD4Dmpv%2Bd9gn0nmQCGHNyaJNkOR5CiX%2F3SK%2BeGO5fFG42tXU0FZStHflJ0M9bs0GfBIPvd8aqA%2Bw%3D', 'DFY7QVSV-DFY7QVSV-27982', 4400, '2025-12-20'],
];
for (const [url, number, total, day] of REAL) {
  const p = parseReceiptUrl(url);
  assert.equal(p.invoiceNumber, number);
  assert.equal(p.total, total);
  assert.equal(p.date.toISOString().slice(0, 10), day);
}

// Item names exactly as on those receipts; expected names follow the naming guide.
const it = (name, total) => ({ name, total });
const name = (shop, items, d = '2026-10-19') => fileName(DEFAULT_FORMAT, { ...r, date: new Date(`${d}T12:00:00`), ...shop, items });
assert.equal(name({ shop: 'AUTO KRALJEVO', place: 'AUTO KRALJEVO DOO KRALJEVO' }, [
  it('SS25486-AMC VILJUSKA DESNA_24495 /kom', 2700), it('D2F003TT TERMOSTAT_24501 /kom', 1700),
], '2025-12-20'), '2025-12-20_AutoKraljevo_Viljuska_Desna_i_Termostat.pdf');
assert.equal(name({ shop: 'CRAFTER doo', place: 'МП 01 ЗМАЈ' }, [
  it('030101225 4M MASKA CRNA', 1058), it('030101237 4M PRIRUBNICA', 318), it('030101148 2M CRNA ŠUHO PRIKLJUČNICA II+DZ', 1538),
  it('030101164 1M POKLOPAC MEHANIZMA CRNI', 149), it('030101146 1M CRNA ŠUHO PRIKLJUČNICA II+DZ', 499),
  it('110101835 TITANIUM SANTORINI OSVEŽIVAČ PROSTORA 500ML', 699), it('030101133 1M MEHANIZAM UNAKRSNI PREKIDAČ SA INDIKACIJOM', 699),
  it('220300089 TITANIUM VISION ČISTAČ STAKLA 250ML', 319), it('030101245 4M UGRADNA MONTAŽNA KUTIJA (DOZNA)', 358),
]), '2026-10-19_Crafter_Uticnice_Maske_i_Ostalo.pdf');
assert.equal(name({ shop: 'LESNINA S', place: 'Maloprodaja MOMAX B3' }, [
  it('1164000102 JASTUK ZA VRAT', 3730.57), it('3917063402 POSTELJINA', 932.88), it('3917063602 DEKORATIVNA JASTUCNI', 373.15),
  it('7370000102 POSTELJINA', 466.44), it('82271606 LED PLAFONJERA', 8394.96),
], '2025-07-18'), '2025-07-18_Momax_Rasveta_Jastuci_i_Posteljina.pdf');
assert.equal(name({ shop: 'Telekom Srbija a.d. Beograd,' }, [it('1182520 BOSCH Inverter klime CL3000iU W 35 E', 45998.6)], '2026-10-21'),
  '2026-10-21_TelekomSrbija_Bosch_Inverter_Klime.pdf');
assert.equal(name({ shop: 'Telekom Srbija a.d. Beograd,' }, [it('1204155 BEKO Mašine za pranje veša B3WFU48215WW ES', 40998.9)], '2026-09-09'),
  '2026-09-09_TelekomSrbija_Beko_Masine_Za_Pranje_Vesa.pdf');
// 30+ items: the biggest categories by amount, the rest as "Ostalo".
const groceries = Array.from({ length: 34 }, (_, k) => it(['MLEKO 1L', 'HLEB BELI', 'PILECI FILE', 'SAMPON 400ML'][k % 4], [300, 80, 900, 50][k % 4]));
assert.equal(itemsTag([it('1234 GARNITURA SA LENJIVCEM', 89990)]), 'Garnitura_Sa_Lenjivcem');
assert.equal(itemsTag([it('DETERDZENT', 900), it('OSVEZIVAC', 300), it('SAMPON', 200), it('KREMA', 100), it('HLEB', 50)]), 'Kucna_Hemija_Kozmetika_i_Pekara');
assert.equal(itemsTag(groceries), 'Meso_Mlecni_i_Ostalo');
// A branded device that is most of a bigger bill still names it.
assert.equal(itemsTag([it('BOSCH UDARNA BUSILICA GSB13-2RE', 9000), it('BURGIJA 6MM', 300), it('TIPLE 8MM', 100)]), 'Bosch_Udarna_Busilica_i_Ostalo');
assert.equal(itemsTag([]), '');
assert.equal(name({ shop: 'CRAFTER doo' }, []), '2026-10-19_Crafter.pdf');
assert.equal(shopTag({ company: 'ТЕЛЕКОМ СРБИЈА А.Д. БЕОГРАД' }), 'TelekomSrbija');

// Journal layout as printed by the fiscal system: header lines, then name / "price qty total" pairs.
const journal = `<pre>============ ФИСКАЛНИ РАЧУН ============
ПИБ:                           112069571
Предузеће:                   CRAFTER doo
Место продаје:                МП 01 ЗМАЈ
-------------ПРОМЕТ ПРОДАЈА-------------
Артикли
========================================
Назив   Цена         Кол.         Укупно
030101225 4M MASKA CRNA (Ђ)
                529,00          2       1.058,00
110101835 TITANIUM SANTORINI OSVEŽIVAČ
PROSTORA 500ML (Ђ)
                699,00          1         699,00
----------------------------------------
Укупан износ:                   1.757,00</pre>`;
assert.equal(shopName(journal), 'CRAFTER doo');
assert.equal(placeName(journal), 'МП 01 ЗМАЈ');
assert.deepEqual(journalItems(journal), [
  { name: '030101225 4M MASKA CRNA (Ђ)', quantity: 2, total: 1058 },
  { name: '110101835 TITANIUM SANTORINI OSVEŽIVAČ PROSTORA 500ML (Ђ)', quantity: 1, total: 699 },
]);
assert.deepEqual(journalItems('<pre>nema artikala</pre>'), []);
assert.deepEqual(specificationRequest("viewModel.InvoiceNumber('AB-CD-1'); viewModel.Token('t0k');"), { invoiceNumber: 'AB-CD-1', token: 't0k' });
assert.equal(specificationRequest('<html></html>'), null);
assert.deepEqual(specificationItems({ success: true, items: [{ name: 'TERMOSTAT', quantity: 1, total: 1700 }] }),
  [{ name: 'TERMOSTAT', quantity: 1, total: 1700 }]);
assert.deepEqual(specificationItems({ success: false }), []);

// Paper receipts read by OCR (Latin model, so Cyrillic labels come out garbled as below).
const { rowsFromLines, parsePaper, mergePaper, emptyPaper, paperReady, fixDigits, formatPfrTime, parsePfrTime } = await import('./paper.js');
const box = (text, left, top) => ({ text, left, top, right: left + 100, bottom: top + 20 });
assert.deepEqual(rowsFromLines([box('4.400,00', 300, 102), box('Ykynah n3hoc:', 10, 100), box('NNb: 105278961', 10, 40)]),
  ['NNb: 105278961', 'Ykynah n3hoc: 4.400,00']);

const frameTop = [
  '============ ONCKANHN PAYYH ============', 'NNb: 105278961', 'Npeay3ehe: AUTO KRALJEVO',
  'Mecto npoaaje: AUTO KRALJEVO DOO KRALJEVO', 'Aapeca: AMMNTPNJA TYLOBNNA 11', 'Kacnp: Mirko',
  'ECNP 6poj: 444/1.0', '------------- NPOMET NPOAAJA -------------', 'Aptnkn', '========================================',
  'Ha3nB Uena Kon. Ykynho', 'SS25486-AMC VILJUSKA DESNA_24495 /kom (b)', '2.700,00 1 2.700,00',
];
const frameBottom = [
  'SS25486-AMC VILJUSKA DESNA_24495 /kom (b)', '2.700,00 1 2.700,00',
  'D2F003TT TERMOSTAT_24501 /kom (b)', '1.700,00 1 1.700,00', '----------------------------------------',
  'Ykynah n3hoc: 4.400,00', 'Nnatha kaptnua: 4.400,00', '========================================',
  'Oshaka Mme Ctoпa Nope3', 'b O-NAB 20,00% 733,33', 'NOP Bpeme: 20.12.2025. 09:57:16',
  'NOP 6poj payyha: DFY7QVSV-DFY7QVSV-27982', 'Bpojay payyha: 26915/27982NN',
];
const top = parsePaper(frameTop);
assert.equal(top.shop, 'AUTO KRALJEVO');
assert.equal(paperReady(top), false);
const paper = mergePaper(mergePaper(emptyPaper(), top), parsePaper(frameBottom));
assert.equal(paper.invoiceNumber, 'DFY7QVSV-DFY7QVSV-27982');
assert.equal(paper.date.getFullYear(), 2025);
assert.equal(paper.date.getDate(), 20);
assert.equal(paper.total, 4400);
assert.equal(paper.items.length, 2);
assert.equal(paperReady(paper), true);
assert.equal(fileName(DEFAULT_FORMAT, { ...paper, shop: paper.shop }), '2025-12-20_AutoKraljevo_Viljuska_Desna_i_Termostat.pdf');

// Wrapped item names, cash payment (largest amount isn't the total), Crafter layout.
const crafter = parsePaper([
  'NNb: 112069571', 'Npeay3ehe: CRAFTER doo', 'Mecto npoaaje: MN 01 3MAJ', 'Ha3nB Uena Kon. Ykynho',
  '030101225 4M MASKA CRNA (b)', '529,00 2 1.058,00',
  '110101835 TITANIUM SANTORINI OSVEZIVAC', 'PROSTORA 500ML (b)', '699,00 1 699,00',
  '----------------------------------------', 'Ykynah n3hoc: 1.757,00', 'oTOBNHa: 2.000,00', 'Nobpahaj: 243,00',
]);
assert.equal(crafter.total, 1757);
assert.deepEqual(crafter.items.map(i => i.name), ['030101225 4M MASKA CRNA (b)', '110101835 TITANIUM SANTORINI OSVEZIVAC PROSTORA 500ML (b)']);
assert.equal(crafter.shop, 'CRAFTER doo');
// A frame with no items guesses the total; a later frame that has the real one wins.
const guess = parsePaper(['Nnatha kaptnua: 4.400,00', 'Ykynah n3hoc: 4.400,00', 'Ђ 20,00% 733,33']);
assert.equal(guess.total, 4400);
assert.equal(guess.totalSure, false);
assert.equal(mergePaper({ ...emptyPaper(), total: 999 }, parsePaper(frameBottom)).total, 4400);

// OCR punctuation noise: the date and the amounts still come through.
const noisy = parsePaper([
  'NNb: 105278961', 'Npeay3ehe: AUTO KRALJEVO', 'Ha3nB Uena Kon. Ykynho',
  'SS25486-AMC VILJUSKA DESNA_24495 /kom (b)', '2,700,00 1 2.700.00',
  'D2F003TT TERMOSTAT_24501 /kom (b)', '1.700, 00 1 1.700,00', '------------------',
  'Nnatha kaptnua: 4.400,00', // no "Укупан износ" row: the first single amount after the items
  'ECNP Bpeme: 20,12,2025 09.50.02', 'NOP Bpeme: 20.12.2025 . 09:57:16',
  'NOP 6poj payyha: DFY7QVSV – DFY7QVSV - 279B2', 'NOP 6poj payyha: DFY7QVSV-DFY7QVSV-2798O',
]);
assert.deepEqual(noisy.items.map(i => i.total), [2700, 1700]);
assert.equal(noisy.total, 4400);
assert.equal(noisy.date.getMonth(), 11);
assert.equal(noisy.date.getMinutes(), 57); // the later (PFR) time wins
assert.equal(noisy.invoiceNumber, 'DFY7QVSV-DFY7QVSV-27980');
// Total from the items' sum when it is printed somewhere (e.g. only in the payment block).
const summed = parsePaper(['MASKA (b)', '529,00 2 1.058,00', 'PRIRUBNICA (b)', '159,00 2 318,00', 'Ђ 20,00% 229,33 1.376,00']);
assert.equal(summed.total, 1376);
// Implausible dates (not this decade) are ignored; a date without a time still counts.
assert.equal(parsePaper(['31.13.2025 10:00']).date, null);
assert.equal(parsePaper(['01.01.1999 10:00']).date, null);
assert.equal(parsePaper(['20.12.2025.']).date.getDate(), 20);

// Counter "26915/27982ПП": garbled suffix normalized, confirmed by the PFR number; ESIR "444/1.0" is not a counter.
const counted = parsePaper(['ECNP 6poj: 444/1.0', 'NOP 6poj payyha: DFY7QVSV-DFY7QVSV-27982', 'Bpojay payyha: 26915/27982NN']);
assert.equal(counted.counter, '26915/27982ПП');
assert.equal(counted.counterSure, true);
assert.equal(parsePaper(['Bpojay payyha: 12/40NP']).counter, '12/40ПР');
assert.equal(parsePaper(['Bpojay payyha: 26915 / 27982']).counter, '26915/27982ПП');
assert.equal(parsePaper(['ECNP 6poj: 444/1.0']).counter, null);
assert.equal(mergePaper(parsePaper(['1/5NN']), counted).counter, '26915/27982ПП');
// Look-alike letters in dates, two-digit years before a time, date and time on separate rows.
assert.equal(fixDigits('2O.12.2O25. O9:57:l6'), '20.12.2025. 09:57:16');
assert.equal(fixDigits('NOP Bpeme:'), 'NOP Bpeme:');
const lookalike = parsePaper(['NOP Bpeme: 2O.12.2O25. O9:57:l6']).date;
assert.equal(formatPfrTime(lookalike), '20.12.2025. 09:57:16');
assert.equal(formatPfrTime(parsePaper(['NOP Bpeme: 20.12.25 09:57:16']).date), '20.12.2025. 09:57:16');
assert.equal(formatPfrTime(parsePaper(['NOP Bpeme: 20.12.2025.', '09:57:16']).date), '20.12.2025. 09:57:16');
assert.equal(parsePaper(['3a ynnaTy: 20.12.25']).date, null); // a short year without a time is ignored
assert.equal(formatPfrTime(parsePfrTime('20.12.2025. 09:57:16')), '20.12.2025. 09:57:16');
assert.equal(formatPfrTime(parsePfrTime('20.12.2025 9:57')), '20.12.2025. 09:57:00');
assert.equal(parsePfrTime('31.02.2025. 09:57:16'), null);
assert.equal(parsePfrTime('20.12.2025.'), null);

// No-QR verification form: values in every format, a script that parses, and recognizing the result page.
const { verifyValues, verifyScript, verifiedReceipt } = await import('./verifyFill.js');
const vv = verifyValues({ invoiceNumber: 'DFY7QVSV-DFY7QVSV-27982', counter: '26915/27982ПП', date: new Date(2025, 11, 20, 9, 57, 16), total: 4400 });
assert.deepEqual(vv.total, { text: '4400,00', number: '4400.00' });
assert.deepEqual(vv.time, { y: 2025, M: 12, d: 20, h: 9, m: 57, s: 16 });
const script = verifyScript(vv);
new Function(script); // must be valid JavaScript
assert.ok(script.includes('"26915/27982ПП"') && script.includes('бројач') && script.includes('ReactNativeWebView'));
assert.ok(script.indexOf('"counter"') < script.indexOf('"invoiceNumber",'), 'the counter is matched before the invoice number');
assert.deepEqual(verifiedReceipt({ href: `https://suf.purs.gov.rs/v/?vl=${vl}`, html: '' }, 'DFY7QVSV-DFY7QVSV-27982'),
  { url: `https://suf.purs.gov.rs/v/?vl=${vl}` });
const resultPage = '<html><pre>==== ФИСКАЛНИ РАЧУН ====\nПФР број рачуна: DFY7QVSV-DFY7QVSV-27982</pre></html>';
assert.equal(verifiedReceipt({ href: 'https://suf.purs.gov.rs/verify', html: resultPage }, 'DFY7QVSV-DFY7QVSV-27982').html, resultPage);
assert.equal(verifiedReceipt({ href: 'https://suf.purs.gov.rs/verify', html: '<form>Провери</form>' }, 'DFY7QVSV-DFY7QVSV-27982'), null);

// Older receipts: fields from the text Drive extracts out of a PURS page PDF (labels and values in separate blocks).
const { legacyFields } = await import('./legacy.js');
const legacy = legacyFields(`10/21/26, 8:50 PM
DFY7QVSV-DFY7QVSV-27982
ПИБ: 105278961
Предузеће: AUTO KRALJEVO
Број рачуна:
DFY7QVSV-DFY7QVSV27982
Место продаје: AUTO KRALJEVO DOO KRA
ЕСИР број: 444/1.0
За уплату:
Порез укупно:
Време на безбедносном
елементу:
4.400,00
733,33
Платна картица
20.12.2025.
09:57:16
26915/27982ПП`);
assert.equal(legacy.invoiceNumber, 'DFY7QVSV-DFY7QVSV-27982');
assert.equal(legacy.total, 4400);
assert.equal(legacy.date.getDate(), 20);
assert.equal(legacy.date.getHours(), 9);
assert.equal(legacy.shop, 'AUTO KRALJEVO');
assert.equal(legacyFields('Ukupan iznos računa 45.998,60\nPFR vreme: 21.10.2026 12:08:09').total, 45998.6);

// List helpers: data from appProperties, else from the file name; months, search, stats and CSV.
const { receiptInfo, groupByMonth, filterReceipts, spendingStats, toCsv } = await import('./stats.js');
const saved = receiptInfo({ id: '1', name: '2026-10-19_Crafter_Uticnice.pdf', appProperties: { total: '5637', date: '2026-10-19T10:53:37.000Z', shop: 'CRAFTER doo', invoiceNumber: 'YT3SAJNH-YT3SAJNH-249953' } });
assert.equal(saved.total, 5637);
assert.equal(saved.complete, true);
const old = receiptInfo({ id: '2', name: '2025-12-20_AutoKraljevo_DesnaViljuska_i_Termostat.pdf' });
assert.equal(old.total, null);
assert.equal(old.shop, 'Auto Kraljevo');
assert.equal(old.date.getMonth(), 11);
assert.equal(old.complete, false);
const groups = groupByMonth([old, saved]);
assert.deepEqual(groups.map(g => [g.title, g.total, g.data.length]), [['Oktobar 2026', 5637, 1], ['Decembar 2025', 0, 1]]);
assert.deepEqual(filterReceipts([old, saved], 'crafter').map(r => r.id), ['1']);
const stats = spendingStats([old, saved], new Date(2026, 9, 25));
assert.equal(stats.thisMonth.total, 5637);
assert.equal(stats.missingTotals, 1);
assert.equal(stats.months.length, 6);
assert.equal(stats.topShops[0].shop, 'CRAFTER doo');
const csv = toCsv([saved, old]);
assert.ok(csv.startsWith('﻿Datum;Radnja;Iznos (RSD)'));
assert.ok(csv.includes(';5637,00;YT3SAJNH-YT3SAJNH-249953;'));

// The fill script on simulated forms: all fields in one block (labels must not leak between inputs),
// a text date with a "dd.mm.yyyy HH:mm:ss" placeholder, a number total, and a minutes-only time picker.
const { JSDOM } = await import('jsdom');
function runForm(body, values) {
  const dom = new JSDOM(`<html><body>${body}</body></html>`, { runScripts: 'outside-only', url: 'https://suf.purs.gov.rs/verify' });
  const posts = [];
  dom.window.ReactNativeWebView = { postMessage: m => posts.push(JSON.parse(m)) };
  dom.window.eval(verifyScript(values));
  return { doc: dom.window.document, posts };
}
const febValues = verifyValues({ invoiceNumber: 'DFY7QVSV-DFY7QVSV-27982', counter: '26915/27982ПП', date: new Date(2026, 1, 17, 10, 49, 10), total: 4400 });
const oneBlock = runForm(`<form><div class="card">
  <label for="a">Укупан износ</label><input id="a" name="TotalAmount" type="number">
  <label for="b">ПФР време</label><input id="b" name="SdcTime" placeholder="dd.mm.yyyy HH:mm:ss">
  <label for="c">ПФР број рачуна</label><input id="c" name="InvoiceNumber">
  <label for="d">Бројач рачуна</label><input id="d" name="Counter">
  <button type="button">Провери</button></div></form>`, febValues);
const val = id => oneBlock.doc.getElementById(id).value;
assert.equal(val('a'), '4400.00');
assert.equal(val('b'), '17.02.2026 10:49:10');
assert.equal(val('c'), 'DFY7QVSV-DFY7QVSV-27982');
assert.equal(val('d'), '26915/27982ПП');
const report = oneBlock.posts.find(p => p.type === 'form');
assert.equal(report.fields.length, 4);
// No labels at all, only the text around each input; a minutes-only datetime picker; a text amount.
const bare = runForm(`<div><div>Износ <input class="x"></div><div>Време <input type="datetime-local" step="60"></div>
  <div>Број рачуна <input></div><div>Бројач <input></div></div>`, febValues);
const ins = [...bare.doc.querySelectorAll('input')].map(i => i.value);
assert.deepEqual(ins, ['4400,00', '2026-02-17T10:49', 'DFY7QVSV-DFY7QVSV-27982', '26915/27982ПП']);

// Renaming to the current format: from stored data, or from the PDF's journal text for older files.
const { renamePlan, dataFromText } = await import('./rename.js');
const stored = receiptInfo({ id: 'r1', name: 'Termostat.pdf', appProperties: { total: '4400', date: '2025-12-20T08:57:16.000Z', shop: 'AUTO KRALJEVO', invoiceNumber: 'DFY7QVSV-DFY7QVSV-27982' },
  description: JSON.stringify({ racuni: 1, place: 'AUTO KRALJEVO DOO KRALJEVO', items: [{ n: 'SS25486-AMC VILJUSKA DESNA_24495 /kom', t: 2700 }, { n: 'D2F003TT TERMOSTAT_24501 /kom', t: 1700 }] }) });
assert.equal(stored.items.length, 2);
const planned = renamePlan([stored, receiptInfo({ id: 'r2', name: 'nesto.pdf' })], DEFAULT_FORMAT);
assert.equal(planned.length, 1); // r2 has neither a date nor a shop: left alone
assert.equal(planned[0].to, `${stored.date.getFullYear()}-12-20_AutoKraljevo_Viljuska_Desna_i_Termostat.pdf`);
assert.equal(renamePlan([{ ...stored, name: planned[0].to.replace('.pdf', '') }], DEFAULT_FORMAT).length, 0);
const fromText = dataFromText(journal);
assert.equal(fromText.shop, 'CRAFTER doo');
assert.equal(fromText.items.length, 2);
// The page header gives the shop even when the journal doesn't have it.
const { receiptHeader } = await import('./receipt.js');
assert.deepEqual(receiptHeader('<div><label>Предузеће:</label><span>LESNINA S</span><label>Место продаје:</label><span>Maloprodaja&nbsp;MOMAX B3</span></div><pre>bez zaglavlja</pre>', '<pre>bez zaglavlja</pre>'),
  { shop: 'LESNINA S', place: 'Maloprodaja MOMAX B3' });

assert.throws(() => parseReceiptUrl('https://example.com/?vl=abc'), /nije QR/);
assert.throws(() => parseReceiptUrl('hello'), /nije link/);
assert.equal(extractJournal('<div><pre class="x">RAČUN</pre></div>'), '<pre class="x">RAČUN</pre>');
assert.throws(() => extractJournal('<div>nema</div>'), /nije dostupan/);

const { isNewer } = await import('./version.js');
assert.equal(isNewer('1.0.12', '1.0.9'), true);
assert.equal(isNewer('1.0.9', '1.0.9'), false);
assert.equal(isNewer('1.0.8', '1.0.9'), false);
assert.equal(isNewer('1.0.1', undefined), true);
console.log('ok');

// Store icons: known chains map to their website, everything else gets initials.
const { shopDomain, initials } = await import('./shops.js');
assert.equal(shopDomain({ shop: 'DELHAIZE SERBIA DOO', place: 'MAXI 123 Beograd' }), 'maxi.rs');
assert.equal(shopDomain({ shop: 'Telekom Srbija a.d. Beograd,' }), 'mts.rs');
assert.equal(shopDomain({ shop: 'NIS a.d. Novi Sad' }), 'nis.rs');
assert.equal(shopDomain({ shop: 'PEKARA ZLATNI KLAS DOO NIŠ' }), null); // the city must not match NIS
assert.equal(shopDomain({ shop: '' }), null);
assert.equal(initials('AUTO KRALJEVO'), 'AK');
assert.equal(initials('Lidl'), 'L');
assert.equal(initials(''), '?');
console.log('shops ok');

// Warranty, installments, categories, budget and price history (plans.js).
{
  const P = await import('./plans.js');
  const bought = new Date(2026, 9, 21, 12); // 21 Oct 2026
  const klima = { total: 45998.6, date: bought, installments: 24, warrantyMonths: 24, shop: 'Telekom Srbija a.d. Beograd,' };
  let s = P.installments(klima, new Date(2026, 9, 22));
  assert.deepEqual([s.paid, s.left, s.perMonth], [0, 24, 1916.61]);
  s = P.installments(klima, new Date(2027, 2, 5)); // Nov..Mar charged
  assert.deepEqual([s.paid, s.left], [5, 19]);
  assert.equal(P.installments(klima, new Date(2029, 0, 1)).left, 0);
  assert.equal(P.installments({ ...klima, installments: 0 }), null);
  const w = P.warranty(klima, new Date(2028, 8, 1));
  assert.equal(w.end.toISOString().slice(0, 10), '2028-10-21');
  assert.ok(w.active && w.daysLeft <= 60);
  assert.equal(P.warranty(klima, new Date(2029, 0, 1)).active, false);

  assert.equal(P.category({ shop: 'DELHAIZE SERBIA DOO', place: 'MAXI 123' }), 'Hrana');
  assert.equal(P.category({ shop: 'NIS a.d. Novi Sad' }), 'Gorivo');
  assert.equal(P.category({ shop: 'APOTEKA ZDRAVLJE DOO' }), 'Apoteka');
  assert.equal(P.category({ shop: 'NIS a.d. Novi Sad', category: 'Auto' }), 'Auto');
  assert.equal(P.category({ shop: 'Nešto Nepoznato' }), 'Ostalo');
  assert.equal(P.category({ shop: 'X', category: 'Izmišljeno' }), 'Ostalo');

  const now = new Date(2026, 9, 25);
  const list = [
    { total: 1000, date: new Date(2026, 9, 2), shop: 'LIDL SRBIJA KD' },
    { total: 500, date: new Date(2026, 9, 3), shop: 'NIS a.d. Novi Sad' },
    { total: 9999, date: new Date(2026, 8, 3), shop: 'LIDL SRBIJA KD' },
  ];
  assert.deepEqual(P.budgetStatus(list, 2000, now), { spent: 1500, budget: 2000, ratio: 0.75, left: 500 });
  assert.equal(P.budgetStatus(list, 0, now).budget, 0);
  assert.deepEqual(P.categoryTotals(list, now), [{ name: 'Hrana', total: 1000 }, { name: 'Gorivo', total: 500 }]);

  const withItems = [
    { date: new Date(2026, 9, 1), shop: 'LIDL', items: [{ name: '4012345 MLEKO 2,8% 1L', total: 278, quantity: 2 }] },
    { date: new Date(2026, 9, 9), shop: 'MAXI', items: [{ name: 'MLEKO 2,8% 1L (Е)', total: 149 }, { name: 'HLEB', total: 80 }] },
    { date: new Date(2026, 9, 9), shop: 'MAXI', items: null },
  ];
  const h = P.priceHistory(withItems, 'mleko');
  assert.equal(h.length, 1);
  assert.deepEqual(h[0].buys.map(b => b.price), [149, 139]);
  assert.deepEqual([h[0].min, h[0].max], [139, 149]);
  assert.equal(P.priceHistory(withItems, ' ').length, 0);
  console.log('plans ok');
}
{
  const { shopDomain } = await import('./shops.js');
  assert.equal(shopDomain({ shop: 'LIDL SRBIJA KD' }), 'lidl.rs');
  assert.equal(shopDomain({ shop: 'A1 Srbija d.o.o.' }), 'a1.rs');
  assert.equal(shopDomain({ shop: 'SRBIJA' }), null);
}
{
  const { itemLabel, itemsSummary, receiptInfo } = await import('./stats.js');
  const { shopDomains } = await import('./shops.js');
  const P = await import('./plans.js');
  assert.equal(itemLabel('1204155 BEKO Mašine za pranje veša B3WFU48215WW ES (Ђ)'), 'Beko mašine za pranje veša');
  assert.equal(itemLabel('SS25486-AMC VILJUSKA DESNA_24495 /kom'), 'Viljuska desna');
  assert.equal(itemsSummary({ items: [{ name: 'HLEB', total: 80 }, { name: '1182520 BOSCH Inverter klime CL3000iU W 35 E', total: 45998.6 }] }),
    'Bosch inverter klime +1');
  assert.equal(itemsSummary({ items: null }), '');

  // A shop read from a file name like "…_Beko_Masine…" may be an item's brand: no guessed logo for it.
  const old = receiptInfo({ id: 'x', name: '2025-09-09_Beko_Masine.pdf' });
  assert.equal(old.shopGuessed, true);
  assert.deepEqual(shopDomains(old), []);
  assert.deepEqual(shopDomains({ shop: 'CRAFTER doo' }), ['crafter.rs', 'crafter.co.rs', 'crafter.com']);
  assert.deepEqual(shopDomains({ shop: 'PEKARA doo' }), []);
  assert.equal(receiptInfo({ id: 'y', name: 'a.pdf', appProperties: { shop: 'LIDL SRBIJA KD' } }).shopGuessed, false);

  // Categories from items when the shop isn't a known chain.
  assert.equal(P.category({ shop: 'AUTO KRALJEVO', items: [{ name: 'D2F003TT TERMOSTAT_24501 /kom', total: 1700 }] }), 'Auto');
  assert.equal(P.category({ shop: 'CRAFTER doo', items: [{ name: '030101225 4M MASKA CRNA', total: 1058 }, { name: 'TITANIUM VISION ČISTAČ STAKLA 250ML', total: 319 }] }), 'Kuća');
  assert.equal(P.category({ shop: 'Telekom Srbija a.d.', items: [{ name: 'BEKO Mašine za pranje veša', total: 40998.9 }] }), 'Telefon i internet'); // chain wins
  assert.equal(P.category({ shop: 'Nepoznato doo', items: [{ name: 'BEKO Mašine za pranje veša', total: 40998.9 }, { name: 'HLEB', total: 80 }] }), 'Tehnika');

  // First installment month chosen by the user.
  const klima = { total: 24000, date: new Date(2026, 9, 21, 12), installments: 24 };
  let s = P.installments(klima, new Date(2026, 10, 3)); // default: first in Nov 2026
  assert.deepEqual([s.paid, P.monthValue(s.firstDue), P.monthValue(s.lastDue), P.monthValue(s.nextDue)], [1, '2026-11', '2028-10', '2026-12']);
  s = P.installments({ ...klima, rateStart: '2026-10' }, new Date(2026, 10, 3));
  assert.deepEqual([s.paid, P.monthValue(s.lastDue)], [2, '2028-09']);
  s = P.installments({ ...klima, rateStart: '2027-01' }, new Date(2026, 10, 3));
  assert.deepEqual([s.paid, s.left], [0, 24]);
  assert.equal(P.installments(klima, new Date(2029, 0, 1)).nextDue, null);
  assert.deepEqual(P.firstInstallmentChoices(klima).map(P.monthValue), ['2026-10', '2026-11', '2026-12', '2027-01']);
  console.log('labels/categories/rates ok');
}
{
  const { warrantyReminders } = await import('./plans.js');
  const r = { id: 'k', date: new Date(2026, 9, 21, 12), warrantyMonths: 24, shop: 'Telekom' };
  const all = warrantyReminders([r, { id: 'n', date: new Date(2026, 9, 1) }], x => x.shop, new Date(2026, 9, 22));
  assert.deepEqual(all.map(n => [n.id, n.date.toISOString().slice(0, 10)]), [['warranty-k-30', '2028-09-21'], ['warranty-k-7', '2028-10-14']]);
  assert.match(all[0].body, /^Telekom: garancija ističe .* \(za 30 dana\)\.$/);
  assert.deepEqual(warrantyReminders([r], x => x.shop, new Date(2028, 9, 1)).map(n => n.id), ['warranty-k-7']);
  console.log('reminders ok');
}
{
  // Old PDFs: Drive's text of the PURS page may list the labels first and the values after them.
  const { legacyFields } = await import('./legacy.js');
  const { dataFromText } = await import('./rename.js');
  const columns = 'Предузеће:\nМесто продаје:\nАдреса:\nКУВАЛО ТРГОВИНА DOO\nKuvalo shop 3\nBulevar 1\n'
    + '============ ФИСКАЛНИ РАЧУН ============\nПИБ: 101234567\nПредузеће: KUVALO TRGOVINA DOO\nМесто продаје: Kuvalo shop 3\n';
  assert.equal(legacyFields(columns).shop, 'KUVALO TRGOVINA DOO'); // the journal's own line, not the label column
  assert.equal(legacyFields(columns).place, 'Kuvalo shop 3');
  assert.equal(legacyFields('Предузеће:\nМесто продаје:\nНешто\n').shop, ''); // never a label as the shop
  const bare = '============ ФИСКАЛНИ РАЧУН ============\n112069571\nCRAFTER doo\nМП 01 ЗМАЈ\n';
  assert.equal(dataFromText(bare).shop, 'CRAFTER doo');
  assert.equal(legacyFields('Предузеће: CRAFTER doo\n').shop, 'CRAFTER doo');
  const { receiptInfo } = await import('./stats.js');
  assert.equal(receiptInfo({ id: 'a', name: 'x.pdf', appProperties: { checked: '1' } }).checked, false); // read again
  assert.equal(receiptInfo({ id: 'a', name: 'x.pdf', appProperties: { checked: '2' } }).checked, true);
  console.log('legacy shop ok');
}
{
  // The PURS page writes Cyrillic labels as numeric entities; journals may print the tax number without "ПИБ:".
  const { receiptHeader } = await import('./receipt.js');
  const page = '<p><strong>&#x41F;&#x440;&#x435;&#x434;&#x443;&#x437;&#x435;&#x45B;&#x435;:</strong>&nbsp;<span>Telekom Srbija a.d. Beograd</span></p>'
    + '<p><strong>&#x41C;&#x435;&#x441;&#x442;&#x43E; &#x43F;&#x440;&#x43E;&#x434;&#x430;&#x458;&#x435;:</strong>&nbsp;<span>mts W Vrnja&#x10D;ka Banja</span></p>';
  assert.deepEqual(receiptHeader(page, '<pre>x</pre>'), { shop: 'Telekom Srbija a.d. Beograd', place: 'mts W Vrnjačka Banja' });
  const { dataFromText } = await import('./rename.js');
  const journal = '============ ФИСКАЛНИ РАЧУН ============\n               100002887                \n      Telekom Srbija a.d. Beograd       \n'
    + '      1405628-mts W Vrnjačka Banja      \n           КНЕЗА МИЛОША 13              \nКасир:                                  \n';
  const d = dataFromText(journal);
  assert.equal(d.shop, 'Telekom Srbija a.d. Beograd');
  assert.equal(d.place, 'mts W Vrnjačka Banja');
  console.log('entities ok');
}
{
  const { filterReceipts, matchedItem } = await import('./stats.js');
  const { widgetSummary } = await import('./plans.js');
  const list = [
    { id: 1, shop: 'CRAFTER doo', name: '2026-10-19_Crafter', total: 5637, date: new Date(2026, 9, 19), items: [{ name: '220300089 TITANIUM VISION ČISTAČ STAKLA 250ML', total: 319 }] },
    { id: 2, shop: 'Telekom Srbija a.d.', name: '2026-10-21_TelekomSrbija_Bosch', total: 45998.6, date: new Date(2026, 9, 21), items: [{ name: 'BOSCH Inverter klime', total: 45998.6 }] },
    { id: 3, shop: 'MAXI', name: 'x', total: 100, date: new Date(2026, 9, 1), items: [{ name: 'ЧИСТАЧ ЗА ПОД', total: 100 }] },
  ];
  assert.deepEqual(filterReceipts(list, 'cistac').map(r => r.id), [1, 3]); // Latin, no diacritics, Cyrillic item
  assert.deepEqual(filterReceipts(list, 'čistač stakla').map(r => r.id), [1]);
  assert.deepEqual(filterReceipts(list, 'klime').map(r => r.id), [2]);
  assert.deepEqual(filterReceipts(list, 'telekom').map(r => r.id), [2]);
  assert.equal(matchedItem(list[0], 'cistac'), 'Titanium vision čistač stakla');
  assert.equal(matchedItem(list[1], 'telekom'), ''); // matched the shop, not an item
  assert.equal(filterReceipts(list, '  ').length, 3);

  const w = widgetSummary([{ ...list[1], installments: 24 }, list[0]], 60000, new Date(2026, 9, 25));
  assert.equal(w.spent, 51635.6);
  assert.equal(w.count, 2);
  assert.equal(w.nextRate.amount, 1916.61);
  assert.equal(w.nextRate.due.slice(0, 7), '2026-11');
  console.log('search/widget ok');
}
