// Receipts without a usable QR code: photograph them in-app, read the PFR data by OCR, let the user check it, then
// fetch the verified receipt from Poreska uprava's form (the same result a QR scan gives), or keep just the photos.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Button, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { File } from 'expo-file-system';
import { ReceiptCamera, recognizeAsync } from './modules/text-scanner';
import { rowsFromLines, parsePaper, mergePaper, emptyPaper, amount, formatPfrTime, parsePfrTime } from './paper';
import { VERIFY_URL, verifyValues, verifyScript, verifiedReceipt } from './verifyFill';

const MAX_PHOTOS = 4;
const INVOICE_NUMBER = /^[A-Z0-9]{8}-[A-Z0-9]{8}-\d+$/;
const COUNTER = /^\d+\/\d+[ПКОА][ПР]$/;

export const deleteFile = uri => { try { if (uri) new File(uri).delete(); } catch { /* already gone */ } };

// The four PFR fields the form needs, plus the shop for the file name; null values where a field is invalid.
function checkForm(form) {
  const invoiceNumber = form.invoiceNumber.trim().toUpperCase();
  // Typed or OCR'd Latin look-alikes in the type suffix: NN -> ПП, NP -> ПР, KN -> КП …
  const LATIN = { N: 'П', M: 'П', P: 'Р', K: 'К', O: 'О', A: 'А' };
  const counter = form.counter.trim().toUpperCase().replace(/\s/g, '')
    .replace(/[A-ZА-Я]{2}$/, s => [...s].map(c => LATIN[c] ?? c).join(''));
  const total = form.total.trim() ? amount(form.total) : NaN;
  return {
    invoiceNumber: INVOICE_NUMBER.test(invoiceNumber) ? invoiceNumber : null,
    counter: COUNTER.test(counter) ? counter : null,
    date: parsePfrTime(form.time),
    total: Number.isFinite(total) && total > 0 ? total : null,
    shop: form.shop.trim(),
  };
}

const FIELD_NAMES = { counter: 'brojač', invoiceNumber: 'PFR broj', total: 'iznos', time: 'PFR vreme' };

// "Popunjeno: …" or which fields the page didn't take, so the user knows what to finish by hand.
function formSummary(report) {
  const missing = Object.keys(FIELD_NAMES).filter(f => !report.fields.some(x => x.field === f && x.value));
  return missing.length
    ? `Nije popunjeno: ${missing.map(f => FIELD_NAMES[f]).join(', ')}. Dopuni na stranici, ili pošalji opis forme za popravku.`
    : 'Sva polja su popunjena.';
}

export default function PaperScan({ onClose, onVerified, onSaveImages, onFail }) {
  const [stage, setStage] = useState('camera'); // camera | reading | review | verify
  const [photos, setPhotos] = useState([]);
  const [torch, setTorch] = useState(false);
  const [focus, setFocus] = useState(null); // { x, y } of the last tap, shown briefly
  const [shooting, setShooting] = useState(false);
  const [scan, setScan] = useState(null); // { data, rows }
  const [form, setForm] = useState(null);
  const [showText, setShowText] = useState(false);
  const [formReport, setFormReport] = useState(null); // what the fill script found on the Poreska form
  const camera = useRef(null);
  const kept = useRef(false); // photos handed over to a save; don't delete them on close
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => { if (!kept.current) photosRef.current.forEach(deleteFile); }, []);

  // Android back: from the Poreska page to the review, otherwise out of the paper flow.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stage === 'verify') setStage('review');
      else if (stage !== 'reading') onClose();
      return true;
    });
    return () => sub.remove();
  }, [stage, onClose]);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => setFocus(null), 1200);
    return () => clearTimeout(t);
  }, [focus]);

  async function shoot() {
    if (shooting) return;
    setShooting(true);
    try {
      const uri = await camera.current.takePictureAsync();
      setPhotos(list => [...list, uri]);
    } catch (e) {
      onFail(e);
    } finally {
      setShooting(false);
    }
  }

  async function read() {
    setStage('reading');
    try {
      let data = emptyPaper();
      const rows = [];
      for (const uri of photos) {
        const pageRows = rowsFromLines(await recognizeAsync(uri));
        rows.push(...pageRows);
        data = mergePaper(data, parsePaper(pageRows));
      }
      setScan({ data, rows });
      setForm({
        invoiceNumber: data.invoiceNumber ?? '',
        counter: data.counter ?? '',
        time: formatPfrTime(data.date),
        total: data.total !== null ? data.total.toFixed(2).replace('.', ',') : '',
        shop: data.shop,
      });
      setShowText(false);
      setStage('review');
    } catch (e) {
      onFail(e);
      setStage('camera');
    }
  }

  function retake() {
    photos.forEach(deleteFile);
    setPhotos([]);
    setStage('camera');
  }

  const checked = form && checkForm(form);
  const canVerify = checked && checked.invoiceNumber && checked.counter && checked.date && checked.total;
  const canSaveImages = checked && checked.invoiceNumber && checked.date;

  function saveImages() {
    kept.current = true;
    onSaveImages({ ...scan.data, ...checked, total: checked.total ?? scan.data.total ?? 0, photos });
  }

  function onMessage(event) {
    let page;
    try { page = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (page.type === 'form') { setFormReport(page); return; }
    const found = page.type === 'page' && verifiedReceipt(page, checked.invoiceNumber);
    if (!found) return;
    photos.forEach(deleteFile); // the verified receipt replaces the photos
    kept.current = true;
    onVerified(found, { ...scan.data, ...checked });
  }

  if (stage === 'camera' || stage === 'reading') {
    return (
      <View style={styles.fill}>
        <ReceiptCamera
          ref={camera}
          style={styles.fill}
          torch={torch}
          onFocus={({ nativeEvent }) => setFocus(nativeEvent)}
        />
        {focus && <View pointerEvents="none" style={[styles.focusRing, { left: focus.x - 30, top: focus.y - 30 }]} />}
        <Text style={styles.hint}>Dodirni ekran da izoštriš. Slikaj dno računa sa PFR podacima ili ceo račun.</Text>
        <View style={styles.bar}>
          <Pressable style={styles.small} onPress={onClose}><Text style={styles.smallText}>✕</Text></Pressable>
          <Pressable style={styles.small} onPress={() => setTorch(t => !t)}>
            <Text style={styles.smallText}>{torch ? '🔦 uklj.' : '🔦'}</Text>
          </Pressable>
          <Pressable
            style={[styles.shutter, (shooting || photos.length >= MAX_PHOTOS) && styles.disabled]}
            disabled={shooting || photos.length >= MAX_PHOTOS || stage === 'reading'}
            onPress={shoot}>
            {shooting && <ActivityIndicator color="#000" />}
          </Pressable>
          <Pressable
            style={[styles.small, !photos.length && styles.disabled]}
            disabled={!photos.length || stage === 'reading'}
            onPress={read}>
            <Text style={styles.smallText}>
              {stage === 'reading' ? 'Čitam…' : photos.length ? `Gotovo (${photos.length})` : 'Gotovo'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (stage === 'verify') {
    return (
      <View style={styles.fill}>
        <View style={styles.webBar}>
          <Button title="← Nazad" onPress={() => setStage('review')} />
          <Text style={styles.webTitle}>Poreska uprava · provera računa</Text>
        </View>
        <WebView
          style={styles.fill}
          source={{ uri: VERIFY_URL }}
          injectedJavaScript={verifyScript(verifyValues(checked))}
          onMessage={onMessage}
          startInLoadingState
        />
        {formReport && (
          <View style={styles.formBar}>
            <Text style={styles.formBarText}>{formSummary(formReport)}</Text>
            <Button title="Pošalji opis forme" onPress={() => Share.share({ message: JSON.stringify(formReport, null, 1) })} />
          </View>
        )}
      </View>
    );
  }

  const field = (key, label, ok, extra) => (
    <View key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !ok && styles.inputBad]}
        value={form[key]}
        onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
        {...extra}
      />
    </View>
  );
  return (
    <ScrollView style={styles.review} contentContainerStyle={{ gap: 6, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Proveri podatke sa računa</Text>
      <Text style={styles.label}>Pročitano artikala: {scan.data.items.length}</Text>
      {field('invoiceNumber', 'PFR broj računa (XXXXXXXX-XXXXXXXX-broj)', !!checked.invoiceNumber, { autoCapitalize: 'characters' })}
      {field('counter', 'Brojač računa (npr. 26915/27982ПП)', !!checked.counter, { autoCapitalize: 'characters' })}
      {field('time', 'PFR vreme sa sekundama (dd.mm.gggg. hh:mm:ss), ne ESIR vreme', !!checked.date, { keyboardType: 'numbers-and-punctuation' })}
      {field('total', 'Ukupan iznos (RSD)', !!checked.total, { keyboardType: 'numbers-and-punctuation' })}
      {field('shop', 'Radnja (za ime fajla)', true, { autoCapitalize: 'characters' })}
      <Button title="Preuzmi sa Poreske uprave" disabled={!canVerify} onPress={() => { setFormReport(null); setStage('verify'); }} />
      <Button title="Sačuvaj samo sliku" color="#555" disabled={!canSaveImages} onPress={saveImages} />
      <View style={styles.row}>
        <View style={styles.half}><Button title="Slikaj ponovo" color="#888" onPress={retake} /></View>
        <View style={styles.half}><Button title="Odbaci" color="#888" onPress={onClose} /></View>
      </View>
      <Button title={showText ? 'Sakrij pročitan tekst' : 'Prikaži pročitan tekst'} color="#888" onPress={() => setShowText(s => !s)} />
      {showText && <Text selectable style={styles.ocr}>{scan.rows.join('\n') || '(ništa nije pročitano)'}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hint: { position: 'absolute', top: 12, left: 12, right: 12, color: '#fff', backgroundColor: '#0009', padding: 10, borderRadius: 8, textAlign: 'center' },
  bar: { position: 'absolute', bottom: 24, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', borderWidth: 5, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  small: { minWidth: 56, padding: 10, borderRadius: 20, backgroundColor: '#0009', alignItems: 'center' },
  smallText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  focusRing: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#ffeb3b' },
  webBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: '#f2f2f2' },
  webTitle: { fontWeight: '600', flexShrink: 1 },
  formBar: { padding: 10, gap: 6, backgroundColor: '#fff6e0', borderTopWidth: 1, borderTopColor: '#f0d58c' },
  formBarText: { color: '#7a5600' },
  review: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700' },
  label: { color: '#555', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16 },
  inputBad: { borderColor: '#c62828', borderWidth: 2 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  ocr: { fontFamily: 'monospace', fontSize: 11 },
});
