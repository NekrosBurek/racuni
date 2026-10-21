import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, Button, FlatList, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, Vibration, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import {
  parseReceiptUrl, extractJournal, shopName, placeName, journalItems, specificationRequest, specificationItems,
  fileName, DEFAULT_FORMAT, FORMAT_TOKENS,
} from './receipt';
import { findSettings, listFolders, saveSettings, findReceipt, listReceipts, uploadPdf } from './drive';
import { REPO, APK_URL, VERSION, isNewer } from './version';
import { saveLogin, restoreLogin, logout } from './auth';
import { rowsFromLines, parsePaper, mergePaper, emptyPaper, amount } from './paper';
import { isAvailable as ocrAvailable, recognizeAsync } from './modules/text-scanner';

WebBrowser.maybeCompleteAuthSession();

// OAuth client IDs from Google Cloud Console (see README.md).
const ANDROID_CLIENT_ID = '21750469073-f08lm2v1en0kmgat0qg5pqh65d9ie17n.apps.googleusercontent.com';
const IOS_CLIENT_ID = 'PASTE-IOS-CLIENT-ID.apps.googleusercontent.com';
const CLIENT_ID = Platform.OS === 'ios' ? IOS_CLIENT_ID : ANDROID_CLIENT_ID;
const REFRESH_EARLY_MS = 5 * 60 * 1000;

const CHECK_EVERY_MS = 60 * 60 * 1000;
const UPDATE_FILE = 'racuni-update.apk';

// Every push to main publishes a GitHub release; returns its version and APK link if it's newer than this build.
async function findUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return null;
    const release = await res.json();
    const latest = release.tag_name.replace(/^v/, '');
    if (!isNewer(latest, VERSION)) return null;
    const asset = release.assets?.find(a => a.name === 'racuni.apk');
    return { latest, url: asset?.browser_download_url ?? APK_URL };
  } catch {
    return null; // offline or GitHub down: just skip the check
  }
}

// Downloads the APK into the cache and hands it to the Android installer; the browser is the fallback.
async function installUpdate(url) {
  try {
    const file = await File.downloadFileAsync(url, new File(Paths.cache, UPDATE_FILE), { idempotent: true });
    await file.preview({ mimeType: 'application/vnd.android.package-archive' });
  } catch {
    Linking.openURL(APK_URL);
  }
}

// Checks at start-up and whenever the app comes back to the foreground, at most once an hour.
function useUpdates() {
  const [downloading, setDownloading] = useState(false);
  const busy = useRef(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    const leftover = new File(Paths.cache, UPDATE_FILE);
    try { if (leftover.exists) leftover.delete(); } catch { /* nothing to clean */ }

    const check = async () => {
      if (busy.current || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      busy.current = true;
      lastCheck.current = Date.now();
      const update = await findUpdate();
      if (!update) { busy.current = false; return; }
      Alert.alert('Nova verzija', `Dostupna je verzija ${update.latest}.`, [
        { text: 'Kasnije', style: 'cancel', onPress: () => { busy.current = false; } },
        {
          text: 'Preuzmi',
          onPress: async () => {
            setDownloading(true);
            await installUpdate(update.url);
            setDownloading(false);
            busy.current = false;
          },
        },
      ], { onDismiss: () => { busy.current = false; } });
    };

    check();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => sub.remove();
  }, []);

  return downloading;
}

// The exact item list from the verification site; the printed journal is the fallback.
async function receiptItems(html, journal) {
  const request = specificationRequest(html);
  if (request) {
    try {
      const res = await fetch('https://suf.purs.gov.rs/specifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `invoiceNumber=${encodeURIComponent(request.invoiceNumber)}&token=${encodeURIComponent(request.token)}`,
      });
      const items = res.ok ? specificationItems(await res.json()) : [];
      if (items.length) return items;
    } catch {
      // fall through to the journal
    }
  }
  return journalItems(journal);
}

async function saveReceipt(token, settings, r) {
  const existing = await findReceipt(token, r.invoiceNumber);
  if (existing) throw Object.assign(new Error(`Već postoji: ${existing.name}`), { duplicate: true });
  const html = await (await fetch(r.url)).text();
  const journal = extractJournal(html);
  const receipt = { ...r, shop: shopName(journal), place: placeName(journal), items: await receiptItems(html, journal) };
  const pdf = await Print.printToFileAsync({
    html: `<html><head><meta charset="utf-8"></head><body style="display:flex;justify-content:center">${journal}</body></html>`,
    base64: true,
  });
  new File(pdf.uri).delete(); // only the base64 copy is needed; keep nothing on the device
  const saved = await uploadPdf(token, settings.folder.id, fileName(settings.nameFormat, receipt), receipt, pdf.base64);
  return saved.name;
}

export default function App() {
  // The access token lives in memory; auth.js keeps the refresh token so the sign-in survives restarts.
  // Folder and name format are read back from Drive.
  const [session, setSession] = useState(null); // { accessToken, expiresAt }
  const [restoring, setRestoring] = useState(true);
  const token = session?.accessToken ?? null;
  const signedIn = !!token;
  const tokenRef = useRef(null);
  tokenRef.current = token;
  const [settings, setSettings] = useState(undefined); // undefined = loading, null = onboarding needed
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('scan');
  const [error, setError] = useState(null);
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const downloading = useUpdates();

  useEffect(() => {
    if (response?.type === 'success') saveLogin(response.authentication).then(setSession, e => setError(e.message));
  }, [response]);

  // Silent sign-in from the stored refresh token; offline keeps it for the next try.
  const refresh = useCallback(async () => {
    try {
      setSession(await restoreLogin(CLIENT_ID));
    } catch {
      setError('Nema veze sa Google-om. Proveri internet.');
    }
  }, []);

  useEffect(() => { refresh().finally(() => setRestoring(false)); }, [refresh]);

  // Renew shortly before the hour runs out; timers stop in the background, so check again on return.
  useEffect(() => {
    if (!session) return;
    const due = () => session.expiresAt - Date.now() - REFRESH_EARLY_MS;
    const timer = setTimeout(refresh, Math.max(0, due()));
    const sub = AppState.addEventListener('change', s => { if (s === 'active' && due() <= 0) refresh(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [session, refresh]);

  const fail = useCallback(e => {
    if (e.message.includes('istekla')) {
      // Renew quietly; if that fails the session ends and the sign-in screen shows.
      refresh();
      setError('Prijava je obnovljena. Pokušaj ponovo.');
      return;
    }
    setError(e.message);
  }, [refresh]);

  const signOut = useCallback(async () => {
    await logout();
    setSession(null);
    setSettings(undefined);
    setEditing(false);
  }, []);

  // Keyed on being signed in, not on the token, so an hourly renewal doesn't reload the screen.
  useEffect(() => {
    if (!signedIn) return;
    setSettings(undefined);
    findSettings(tokenRef.current).then(setSettings, fail);
  }, [signedIn, fail]);

  let screen;
  if (restoring) {
    screen = <View style={styles.center}><ActivityIndicator size="large" /></View>;
  } else if (!token) {
    screen = (
      <View style={styles.center}>
        <Text style={styles.title}>Računi</Text>
        <Text style={styles.hint}>Korak 1 od 2: poveži Google nalog na kom čuvaš račune.</Text>
        <Button title="Poveži Google nalog" disabled={!request} onPress={() => { setError(null); promptAsync(); }} />
      </View>
    );
  } else if (settings === undefined) {
    screen = <View style={styles.center}><ActivityIndicator size="large" /></View>;
  } else if (!settings || editing) {
    screen = (
      <Onboarding
        token={token}
        current={settings}
        onFail={fail}
        onDone={s => { setSettings(s); setEditing(false); }}
        onCancel={settings ? () => setEditing(false) : null}
        onLogout={signOut}
      />
    );
  } else {
    screen = (
      <View style={{ flex: 1 }}>
        <View style={styles.tabs}>
          {[['scan', 'Skeniraj'], ['list', 'Računi']].map(([key, label]) => (
            <Pressable key={key} style={[styles.tab, tab === key && styles.tabOn]} onPress={() => setTab(key)}>
              <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.tab} onPress={() => setEditing(true)}>
            <Text style={styles.tabText}>⚙</Text>
          </Pressable>
        </View>
        <Scanner token={token} settings={settings} onFail={fail} active={tab === 'scan'} />
        {tab === 'list' && <ReceiptList token={token} settings={settings} onFail={fail} />}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.root}>
      {screen}
      {downloading && (
        <View style={styles.updateBar}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.errorText}>Preuzimam novu verziju…</Text>
        </View>
      )}
      {error && (
        <Pressable style={styles.errorBar} onPress={() => setError(null)}>
          <Text style={styles.errorText}>{error} (dodirni da zatvoriš)</Text>
        </Pressable>
      )}
      <StatusBar barStyle="dark-content" />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Onboarding({ token, current, onFail, onDone, onCancel, onLogout }) {
  const [folders, setFolders] = useState(null);
  const [folder, setFolder] = useState(current?.folder ?? null);
  const [newFolderName, setNewFolderName] = useState('');
  const [nameFormat, setNameFormat] = useState(current?.nameFormat || DEFAULT_FORMAT);
  const [saving, setSaving] = useState(false);

  useEffect(() => { listFolders(token).then(setFolders, onFail); }, [token, onFail]);

  const example = fileName(nameFormat, {
    date: new Date(), total: 4400, shop: 'AUTO KRALJEVO', invoiceNumber: 'ABCD1234-ABCD1234-42',
    items: [{ name: 'VILJUSKA DESNA', total: 2700 }, { name: 'TERMOSTAT', total: 1700 }],
  });
  const canSave = (folder || newFolderName.trim()) && nameFormat.trim() && !saving;

  async function save() {
    setSaving(true);
    try {
      onDone(await saveSettings(token, { folder, newFolderName: newFolderName.trim(), nameFormat }, current?.folder.id));
    } catch (e) {
      onFail(e);
      setSaving(false);
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.h2}>Korak 2 od 2: folder na Drive-u</Text>
      <Text style={styles.hint}>Ovde se čuvaju skenirani računi i odavde se prikazuju.</Text>
      <View style={styles.folderBox}>
        {folders === null ? <ActivityIndicator /> : (
          <FlatList
            data={folders}
            keyExtractor={f => f.id}
            ListEmptyComponent={<Text style={styles.hint}>Nema foldera, napravi novi ispod.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.folderRow, folder?.id === item.id && styles.folderOn]}
                onPress={() => { setFolder(item); setNewFolderName(''); }}>
                <Text>📁 {item.name}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
      <TextInput
        style={styles.input}
        placeholder="…ili ime novog foldera"
        value={newFolderName}
        onChangeText={t => { setNewFolderName(t); if (t) setFolder(null); }}
      />

      <Text style={styles.h2}>Format imena fajla</Text>
      <TextInput style={styles.input} value={nameFormat} onChangeText={setNameFormat} autoCapitalize="none" />
      <Text style={styles.hint}>Polja: {FORMAT_TOKENS}</Text>
      <Text style={styles.hint}>Primer: {example}</Text>
      {nameFormat !== DEFAULT_FORMAT && (
        <Button title="Standardni format (datum_radnja_stavke)" color="#888" onPress={() => setNameFormat(DEFAULT_FORMAT)} />
      )}

      <Button title={saving ? 'Čuvam…' : 'Sačuvaj'} disabled={!canSave} onPress={save} />
      {onCancel && <Button title="Odustani" color="#888" onPress={onCancel} />}
      <Button title="Odjavi se" color="#c62828" onPress={onLogout} />
    </View>
  );
}

const deleteFile = uri => { try { if (uri) new File(uri).delete(); } catch { /* already gone */ } };
const pad2 = n => String(n).padStart(2, '0');
const formatDay = d => (d ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}` : '');
const INVOICE_NUMBER = /^[A-Z0-9]{8}-[A-Z0-9]{8}-\d+$/;

// "20.12.2025" (or with commas/spaces) -> Date at noon; null when it isn't a real date.
function parseDay(text) {
  const m = text.trim().match(/^(\d{1,2})\s*[.,/]\s*(\d{1,2})\s*[.,/]\s*(\d{4})\.?$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], 12);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? d : null;
}

// A receipt scanned from paper: Google's scanner made the PDF, the checked OCR fields name it.
async function savePaperReceipt(token, settings, p) {
  const existing = await findReceipt(token, p.invoiceNumber);
  if (existing) throw Object.assign(new Error(`Već postoji: ${existing.name}`), { duplicate: true });
  const base64 = await new File(p.pdfUri).base64();
  const saved = await uploadPdf(token, settings.folder.id, fileName(settings.nameFormat, p), p, base64);
  [p.pdfUri, ...p.pages].forEach(deleteFile); // kept until the upload succeeded, so a retry still has them
  return saved.name;
}

const KIND_ICON = { wait: '⏳', ok: '✅', dup: '⚠️', err: '❌' };

function Scanner({ token, settings, onFail, active }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState([]); // newest first: { id, kind, title, text, receipt }
  const seen = useRef(new Set());
  const queue = useRef(Promise.resolve());
  // Paper receipt: Google's document scanner, then OCR, then a check by the user before saving.
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState(null); // { pages, pdfUri, rows, data, form }
  const [showText, setShowText] = useState(false);
  const reviewRef = useRef(null);
  reviewRef.current = review;
  const discardFiles = r => r && [r.pdfUri, ...r.pages].forEach(deleteFile);

  useEffect(() => () => discardFiles(reviewRef.current), []);

  async function scanPaper() {
    let result;
    try {
      result = await CameraView.scanDocumentAsync({ requestPdf: true });
    } catch (e) {
      onFail(e);
      return;
    }
    if (!result?.pages?.length) return; // cancelled
    if (!result.pdfUri) {
      discardFiles({ pdfUri: null, pages: result.pages });
      onFail(new Error('Skener nije napravio PDF. Pokušaj ponovo.'));
      return;
    }
    setReading(true);
    try {
      let data = emptyPaper();
      const rows = [];
      for (const page of result.pages) {
        const pageRows = rowsFromLines(await recognizeAsync(page));
        rows.push(...pageRows);
        data = mergePaper(data, parsePaper(pageRows));
      }
      setShowText(false);
      setReview({
        pages: result.pages,
        pdfUri: result.pdfUri,
        rows,
        data,
        form: {
          invoiceNumber: data.invoiceNumber ?? '',
          date: formatDay(data.date),
          total: data.total !== null ? data.total.toFixed(2).replace('.', ',') : '',
          shop: data.shop,
        },
      });
    } catch (e) {
      discardFiles({ pdfUri: result.pdfUri, pages: result.pages });
      onFail(e);
    } finally {
      setReading(false);
    }
  }

  const setField = (key, value) => setReview(r => ({ ...r, form: { ...r.form, [key]: value } }));
  const form = review?.form;
  const invoiceOk = form && INVOICE_NUMBER.test(form.invoiceNumber.trim().toUpperCase());
  const dateOk = form && !!parseDay(form.date);
  const totalOk = form && (!form.total.trim() || !isNaN(amount(form.total)));

  function discardPaper() {
    discardFiles(review);
    setReview(null);
  }

  function savePaper() {
    const { data, pages, pdfUri } = review;
    const invoiceNumber = form.invoiceNumber.trim().toUpperCase();
    // Keep the scanned time when the day wasn't changed.
    const date = form.date === formatDay(data.date) ? data.date : parseDay(form.date);
    const total = form.total.trim() ? amount(form.total) : data.items.reduce((s, i) => s + i.total, 0);
    setReview(null);
    const id = `paper:${invoiceNumber}`;
    if (seen.current.has(id)) { discardFiles({ pages, pdfUri }); return; }
    seen.current.add(id);
    Vibration.vibrate(40);
    const r = { ...data, invoiceNumber, date, total, shop: form.shop.trim(), pages, pdfUri };
    const title = `${total.toFixed(2)} RSD · ${date.toLocaleDateString('sr-RS')} · papir`;
    setItems(list => [{ id, kind: 'wait', title, text: 'Čeka…', receipt: r }, ...list]);
    enqueue(id, r);
  }

  const update = (id, patch) => setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)));

  // Saves run one at a time so the duplicate check always sees the previous upload.
  function enqueue(id, r) {
    update(id, { kind: 'wait', text: 'Čeka…' });
    queue.current = queue.current
      .then(() => (r.pdfUri ? savePaperReceipt : saveReceipt)(token, settings, r))
      .then(
        name => update(id, { kind: 'ok', text: name }),
        e => {
          if (e.message.includes('istekla')) onFail(e);
          update(id, { kind: e.duplicate ? 'dup' : 'err', text: e.message });
        },
      );
  }

  function onScan({ data }) {
    if (seen.current.has(data)) return; // the camera reports the same code many times per second
    seen.current.add(data);
    Vibration.vibrate(40);
    let r;
    try {
      r = parseReceiptUrl(data);
    } catch (e) {
      setItems(list => [{ id: data, kind: 'err', title: 'Nepoznat QR', text: e.message }, ...list]);
      return;
    }
    const title = `${r.total.toFixed(2)} RSD · ${isNaN(r.date) ? '' : r.date.toLocaleDateString('sr-RS')}`;
    setItems(list => [{ id: data, kind: 'wait', title, text: 'Čeka…', receipt: r }, ...list]);
    enqueue(data, r);
  }

  if (!active || !permission) return null;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.label}>Potreban je pristup kameri.</Text>
        <Button title="Dozvoli kameru" onPress={requestPermission} />
      </View>
    );
  }

  const count = k => items.filter(i => i.kind === k).length;
  return (
    <View style={{ flex: 1 }}>
      <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      {ocrAvailable && CameraView.isDocumentScannerAvailable && !review && (
        <Pressable style={styles.scanPaper} onPress={scanPaper} disabled={reading}>
          {reading && <ActivityIndicator color="#fff" />}
          <Text style={styles.scanPaperText}>{reading ? 'Čitam račun…' : '📄 Račun bez QR'}</Text>
        </Pressable>
      )}
      {review && (
        <ScrollView style={styles.paper} keyboardShouldPersistTaps="handled">
          <Text style={styles.rowTitle}>Proveri pročitano (artikala: {review.data.items.length})</Text>
          {[
            ['invoiceNumber', 'PFR broj računa', invoiceOk, 'characters'],
            ['date', 'Datum (dd.mm.gggg)', dateOk, 'none'],
            ['total', 'Iznos (RSD)', totalOk, 'none'],
            ['shop', 'Radnja', true, 'characters'],
          ].map(([key, label, ok, caps]) => (
            <View key={key}>
              <Text style={styles.hint}>{label}</Text>
              <TextInput
                style={[styles.input, !ok && styles.inputBad]}
                value={form[key]}
                onChangeText={v => setField(key, v)}
                autoCapitalize={caps}
                keyboardType={key === 'date' || key === 'total' ? 'numbers-and-punctuation' : 'default'}
              />
            </View>
          ))}
          <View style={styles.paperButtons}>
            <Button title="Sačuvaj" disabled={!(invoiceOk && dateOk && totalOk)} onPress={savePaper} />
            <Button title="Odbaci" color="#888" onPress={discardPaper} />
          </View>
          <Button title={showText ? 'Sakrij pročitan tekst' : 'Prikaži pročitan tekst'} color="#888" onPress={() => setShowText(s => !s)} />
          {showText && <Text selectable style={styles.ocrText}>{review.rows.join('\n') || '(ništa nije pročitano)'}</Text>}
        </ScrollView>
      )}
      <View style={styles.sheet}>
        <Text style={styles.summary}>
          {items.length === 0
            ? `Skeniraj račune jedan za drugim · ${settings.folder.name}`
            : `✅ ${count('ok')}   ⚠️ ${count('dup')}   ❌ ${count('err')}   ⏳ ${count('wait')}`}
        </Text>
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              // Failed saves (e.g. receipt not yet on the tax site) can be retried with a tap.
              onPress={() => item.kind === 'err' && item.receipt && enqueue(item.id, item.receipt)}>
              <Text style={styles.rowIcon}>{KIND_ICON[item.kind]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles[item.kind]} numberOfLines={2}>
                  {item.text}{item.kind === 'err' && item.receipt ? ' · dodirni za ponovo' : ''}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

function ReceiptList({ token, settings, onFail }) {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listReceipts(token, settings.folder.id).then(setFiles, onFail).finally(() => setLoading(false));
  }, [token, settings, onFail]);

  useEffect(load, [load]);

  const total = (files || []).reduce((s, f) => s + (Number(f.appProperties?.total) || 0), 0);
  return (
    <FlatList
      data={files || []}
      keyExtractor={f => f.id}
      refreshing={loading}
      onRefresh={load}
      ListHeaderComponent={files && (
        <Text style={styles.summary}>{files.length} računa · ukupno {total.toFixed(2)} RSD</Text>
      )}
      ListEmptyComponent={!loading && <Text style={[styles.hint, { padding: 24 }]}>Nema računa u folderu.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => Linking.openURL(item.webViewLink)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.appProperties?.shop || item.name}</Text>
            <Text style={styles.hint} numberOfLines={1}>{item.name}</Text>
          </View>
          {item.appProperties?.total ? <Text style={styles.amount}>{Number(item.appProperties.total).toFixed(2)}</Text> : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  page: { flex: 1, padding: 20, gap: 10 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: '600', marginTop: 8 },
  label: { fontSize: 16, textAlign: 'center' },
  hint: { color: '#666' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  folderBox: { maxHeight: 220, borderWidth: 1, borderColor: '#eee', borderRadius: 8 },
  folderRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  folderOn: { backgroundColor: '#e3f0ff' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { paddingVertical: 14, paddingHorizontal: 18 },
  tabOn: { borderBottomWidth: 3, borderBottomColor: '#1565c0' },
  tabText: { fontSize: 16, color: '#666' },
  tabTextOn: { color: '#1565c0', fontWeight: '600' },
  sheet: { height: '40%', borderTopLeftRadius: 16, borderTopRightRadius: 16, marginTop: -16, backgroundColor: '#fff' },
  summary: { padding: 14, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  rowIcon: { fontSize: 20 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '600' },
  wait: { color: '#666' },
  ok: { color: '#1a7f37' },
  dup: { color: '#b35900' },
  err: { color: '#c62828' },
  errorBar: { position: 'absolute', left: 12, right: 12, bottom: 24, padding: 14, borderRadius: 10, backgroundColor: '#c62828' },
  errorText: { color: '#fff' },
  scanPaper: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#000a', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  scanPaperText: { color: '#fff', fontWeight: '600' },
  inputBad: { borderColor: '#c62828', borderWidth: 2 },
  ocrText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, marginTop: 6 },
  paper: { position: 'absolute', top: 12, bottom: 12, left: 12, right: 12, padding: 12, borderRadius: 10, backgroundColor: '#fff', zIndex: 2, elevation: 4 },
  paperButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  updateBar: { position: 'absolute', left: 12, right: 12, bottom: 24, padding: 14, borderRadius: 10, backgroundColor: '#1565c0', flexDirection: 'row', alignItems: 'center', gap: 10 },
});
