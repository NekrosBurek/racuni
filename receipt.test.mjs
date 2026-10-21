// Run: node receipt.test.mjs
import assert from 'node:assert';
import { parseReceiptUrl, extractJournal, shopName, fileName, DEFAULT_FORMAT } from './receipt.js';

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
assert.match(fileName(DEFAULT_FORMAT, { ...r, shop: 'MAXI/123' }), /^2026-10-21 MAXI 123 1234.57 RSD\.pdf$/);
assert.equal(fileName('{prodavac}', { ...r, shop: '' }), 'ABCD1234-WXYZ9876-4521.pdf');
assert.equal(shopName(`<pre>=== ФИСКАЛНИ РАЧУН ===
ПИБ: 100000000
DELHAIZE &amp; CO
Maxi 123</pre>`), 'DELHAIZE & CO');
assert.equal(shopName('<pre>nema</pre>'), '');

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
