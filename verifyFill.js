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

// The values in every shape an input might want. Amounts without thousands separators (masks reject the dots);
// times with and without seconds, since some pickers only go to minutes.
export function verifyValues({ invoiceNumber, counter, date, total }) {
  return {
    invoiceNumber,
    counter,
    total: { text: total.toFixed(2).replace('.', ','), number: total.toFixed(2) },
    time: {
      y: date.getFullYear(), M: date.getMonth() + 1, d: date.getDate(),
      h: date.getHours(), m: date.getMinutes(), s: date.getSeconds(),
    },
  };
}

// The script injected into every page the WebView loads. It reports each page ({ href, html }) back to the app,
// which recognizes the verified receipt, fills and submits the form once per session, and reports how the form
// looked and what was filled ({ type: 'form' }) so a miss can be shown and sent for fixing.
export function verifyScript(values) {
  return `(function () {
  var V = ${JSON.stringify(values)};
  var FIELDS = ${JSON.stringify(FIELDS)};
  function post(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function clean(s) { return (s || '').replace(/\\s+/g, ' ').trim(); }
  var INPUTS = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea';
  function own(el) {
    var parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title, el.getAttribute('data-original-title')];
    if (el.labels) for (var i = 0; i < el.labels.length; i++) parts.push(el.labels[i].textContent);
    var by = el.getAttribute('aria-labelledby');
    if (by) by.split(' ').forEach(function (id) { var l = document.getElementById(id); if (l) parts.push(l.textContent); });
    return clean(parts.filter(Boolean).join(' ')).toLowerCase();
  }
  // Text of the largest ancestor that still holds only this input: its own label, not the whole form's.
  function near(el) {
    var node = el, best = '';
    while (node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
      if (node.querySelectorAll(INPUTS).length > 1) break;
      best = node.textContent;
    }
    return clean(best).toLowerCase().slice(0, 160);
  }
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var T = V.time;
  // A date pattern from the input's placeholder or data attributes ("dd.MM.yyyy HH:mm:ss", "гггг-мм-дд" …).
  function byPattern(pat) {
    if (!pat || !/(yy|гг|dd|дд)/i.test(pat)) return null;
    return pat.replace(/yyyy|YYYY|гггг/g, T.y).replace(/yy|YY|гг/g, String(T.y).slice(2))
      .replace(/MM|[mм]{2}(?=[.\\-\\/])/g, p2(T.M)).replace(/dd|DD|дд/g, p2(T.d))
      .replace(/HH|hh|чч/g, p2(T.h)).replace(/mm|мм/g, p2(T.m)).replace(/ss|сс/g, p2(T.s));
  }
  function timeValue(el) {
    var day = T.y + '-' + p2(T.M) + '-' + p2(T.d), hm = p2(T.h) + ':' + p2(T.m), hms = hm + ':' + p2(T.s);
    var minutesOnly = el.step && Number(el.step) >= 60;
    if (el.type === 'datetime-local') return day + 'T' + (minutesOnly ? hm : hms);
    if (el.type === 'date') return day;
    if (el.type === 'time') return minutesOnly ? hm : hms;
    var pat = el.getAttribute('data-date-format') || el.getAttribute('data-format') || el.placeholder;
    return byPattern(pat) || (p2(T.d) + '.' + p2(T.M) + '.' + T.y + '. ' + hms);
  }
  function valueFor(field, el) {
    var v = V[field];
    if (typeof v === 'string') return v;
    if (field === 'total') return el.type === 'number' ? v.number : v.text;
    return timeValue(el);
  }
  function fire(el, types) { types.forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); }); }
  function setNative(el, v) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  }
  // Plain set first; date-picker libraries get their own API; masked inputs get the value typed key by key.
  function setValue(el, v, field) {
    el.focus();
    if (field === 'time') {
      var d = new Date(T.y, T.M - 1, T.d, T.h, T.m, T.s);
      if (el._flatpickr) { el._flatpickr.setDate(d, true); return; }
      var $ = window.jQuery;
      if ($ && $(el).data('DateTimePicker')) { $(el).data('DateTimePicker').date(v); return; }
      if ($ && $(el).data('datetimepicker')) { try { $(el).datetimepicker('date', d); return; } catch (e) {} }
      if ($ && $(el).data('datepicker')) { try { $(el).datepicker('setDate', d); } catch (e) {} }
    }
    setNative(el, v);
    fire(el, ['input', 'change']);
    if (el.value !== v) {
      setNative(el, '');
      for (var i = 0; i < v.length; i++) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: v[i], bubbles: true }));
        setNative(el, el.value + v[i]);
        fire(el, ['input']);
        el.dispatchEvent(new KeyboardEvent('keyup', { key: v[i], bubbles: true }));
      }
      fire(el, ['change']);
    }
    fire(el, ['blur']);
  }
  function report(inputs, matched) {
    post({ type: 'form', href: location.href,
      fields: matched.map(function (m) { return { field: m.field, value: m.el.value, wanted: m.value }; }),
      inputs: inputs.map(function (el) {
        return { type: el.type, name: el.name, id: el.id, placeholder: el.placeholder,
          readonly: el.readOnly, cls: el.className, own: own(el), near: near(el), value: el.value };
      }) });
  }
  function fill() {
    var inputs = [].slice.call(document.querySelectorAll(INPUTS));
    if (!inputs.length) return false;
    var used = [], matched = [];
    FIELDS.forEach(function (f) {
      var field = f[0], keys = f[1];
      var hit = function (text) { return keys.some(function (k) { return text.indexOf(k) >= 0; }); };
      // An input's own label wins over the text around it.
      [own, near].some(function (where) {
        var found = inputs.filter(function (el) { return used.indexOf(el) < 0 && hit(where(el)); });
        // The PFR time may be split into a date and a time input; other fields take one input.
        var take = field === 'time' && found.length > 1 && found.every(function (el) { return el.type === 'date' || el.type === 'time'; })
          ? found : found.slice(0, 1);
        take.forEach(function (el) {
          used.push(el);
          var v = valueFor(field, el);
          setValue(el, v, field);
          matched.push({ field: field, el: el, value: v });
        });
        return take.length > 0;
      });
    });
    report(inputs, matched);
    var done = ['counter', 'invoiceNumber', 'total', 'time'].every(function (f) {
      return matched.some(function (m) { return m.field === f && m.el.value; });
    });
    if (!done) return matched.length > 0; // filled what it could; the user finishes the rest
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
