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
