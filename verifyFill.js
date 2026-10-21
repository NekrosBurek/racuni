// Poreska uprava's check for receipts without a QR code: suf.purs.gov.rs/verify takes the PFR invoice number, the
// receipt counter, the PFR time and the total, and shows the verified receipt. The page's markup isn't known here,
// so the injected script finds the inputs by their label, placeholder, name or id, fills them and presses Провери.
// If that misses, the page stays on screen for the user to finish by hand.

export const VERIFY_URL = 'https://suf.purs.gov.rs/verify';

// Checked in this order, each input used once ("Бројач рачуна" must not be taken for "ПФР број рачуна").
const FIELDS = [
  ['counter', ['бројач', 'brojač', 'brojac', 'counter']],
  ['invoiceNumber', ['пфр број', 'pfr broj', 'број рачуна', 'broj računa', 'broj racuna', 'invoicenumber', 'invoice']],
  ['total', ['укупан износ', 'ukupan iznos', 'износ', 'iznos', 'amount', 'total']],
  ['time', ['пфр време', 'pfr vreme', 'време', 'vreme', 'datum', 'датум', 'date', 'time', 'sdc']],
];

const p2 = n => String(n).padStart(2, '0');

// The values in every shape an input might want: text as printed on the receipt, or HTML date/time formats.
export function verifyValues({ invoiceNumber, counter, date, total }) {
  const day = `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
  const time = `${p2(date.getHours())}:${p2(date.getMinutes())}:${p2(date.getSeconds())}`;
  const [int, dec] = total.toFixed(2).split('.');
  return {
    invoiceNumber,
    counter,
    total: { text: `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`, number: total.toFixed(2) },
    time: {
      text: `${p2(date.getDate())}.${p2(date.getMonth() + 1)}.${date.getFullYear()}. ${time}`,
      datetime: `${day}T${time}`,
      date: day,
      time,
    },
  };
}

// The script injected into every page the WebView loads. It reports each page ({ href, html }) back to the app,
// which recognizes the verified receipt, and fills and submits the form once per session.
export function verifyScript(values) {
  return `(function () {
  var V = ${JSON.stringify(values)};
  var FIELDS = ${JSON.stringify(FIELDS)};
  function post(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function describe(el) {
    var parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title];
    if (el.labels) for (var i = 0; i < el.labels.length; i++) parts.push(el.labels[i].textContent);
    var group = el.closest('.form-group, .field, .row, td, tr, div');
    if (group) parts.push(group.textContent.slice(0, 200));
    return parts.filter(Boolean).join(' ').toLowerCase();
  }
  function setValue(el, v) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    ['input', 'change', 'blur'].forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); });
  }
  function valueFor(field, el) {
    var v = V[field];
    if (typeof v === 'string') return v;
    if (field === 'total') return el.type === 'number' ? v.number : v.text;
    if (el.type === 'datetime-local') return v.datetime;
    if (el.type === 'date') return v.date;
    if (el.type === 'time') return v.time;
    return v.text;
  }
  function fill() {
    var inputs = [].slice.call(document.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea'));
    if (!inputs.length) return false;
    var used = [], filled = {};
    FIELDS.forEach(function (f) {
      var field = f[0], keys = f[1];
      inputs.forEach(function (el) {
        if (used.indexOf(el) >= 0) return;
        // The PFR time may be split into a date and a time input; other fields take one input.
        if (filled[field] && !(field === 'time' && (el.type === 'date' || el.type === 'time'))) return;
        var text = describe(el);
        if (!keys.some(function (k) { return text.indexOf(k) >= 0; })) return;
        used.push(el);
        setValue(el, valueFor(field, el));
        filled[field] = true;
      });
    });
    if (!(filled.counter && filled.invoiceNumber && filled.total && filled.time)) return false;
    var buttons = [].slice.call(document.querySelectorAll('button, input[type=submit], a.btn'));
    var go = buttons.filter(function (b) { return /провери|proveri|verify|check/i.test(b.textContent + ' ' + (b.value || '')); })[0];
    if (go) go.click(); else if (used[0].form) used[0].form.submit();
    return true;
  }
  post({ type: 'page', href: location.href, html: document.documentElement.outerHTML });
  var key = 'racuni-filled';
  if (!sessionStorage.getItem(key)) {
    var tries = 0;
    (function attempt() {
      if (fill()) { sessionStorage.setItem(key, '1'); return; }
      if (++tries < 20) setTimeout(attempt, 250); // the form may render after load
    })();
  }
  setTimeout(function () { post({ type: 'page', href: location.href, html: document.documentElement.outerHTML }); }, 1500);
})();
true;`;
}

// What the app does with a page the WebView reports: the receipt URL (same as a QR code), the receipt page itself,
// or nothing yet.
export function verifiedReceipt({ href, html }, invoiceNumber) {
  if (/\/v\/?\?vl=/.test(href)) return { url: href };
  const journal = html.match(/<pre[\s\S]*?<\/pre>/i)?.[0];
  const counter = invoiceNumber.split('-')[2];
  if (journal && (journal.includes(invoiceNumber) || /ФИСКАЛНИ|FISKALNI/i.test(journal)) && html.includes(counter)) {
    return { html, url: href };
  }
  return null;
}
