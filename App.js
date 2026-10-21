import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, BackHandler, Button, FlatList, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, Vibration, View,
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
import { findSettings, listFolders, saveSettings, findReceipt, uploadPdf } from './drive';
import { REPO, APK_URL, VERSION, isNewer } from './version';
import { saveLogin, restoreLogin, logout } from './auth';
import { isAvailable as ocrAvailable } from './modules/text-scanner';
import PaperScan, { deleteFile } from './PaperScan';
import ReceiptList, { useReceipts } from './screens/ReceiptList';
import Stats from './screens/Stats';
import Intro from './screens/Intro';
import { introDone, setIntroDone } from './prefs';

const TABS = [['scan', '📷', 'Skeniraj'], ['list', '🧾', 'Računi'], ['stats', '📊', 'Pregled'], ['settings', '⚙️', 'Podešavanja']];

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
  // Receipts verified through the no-QR form arrive with the page already loaded.
  const html = r.html ?? await (await fetch(r.url)).text();
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
  const [tab, setTab] = useState('scan');
  const [intro, setIntro] = useState(null); // null = loading, true = show the walkthrough
  const [error, setError] = useState(null);
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const downloading = useUpdates();

  useEffect(() => { introDone().then(done => setIntro(!done)); }, []);
  const finishIntro = useCallback(() => { setIntroDone(true); setIntro(false); }, []);

  // Android back: from any tab to the scanner, then out of the app. Screens on top (viewer, paper scan) handle it first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'scan') return false;
      setTab('scan');
      return true;
    });
    return () => sub.remove();
  }, [tab]);

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
    setTab('scan');
  }, []);

  // Keyed on being signed in, not on the token, so an hourly renewal doesn't reload the screen.
  useEffect(() => {
    if (!signedIn) return;
    setSettings(undefined);
    findSettings(tokenRef.current).then(setSettings, fail);
  }, [signedIn, fail]);

  let screen;
  if (restoring || intro === null) {
    screen = <View style={styles.center}><ActivityIndicator size="large" /></View>;
  } else if (intro) {
    screen = <Intro onDone={finishIntro} />;
  } else if (!token) {
    screen = (
      <View style={styles.center}>
        <Text style={styles.logo}>🧾</Text>
        <Text style={styles.title}>Računi</Text>
        <Text style={[styles.hint, { textAlign: 'center' }]}>
          Poveži Google nalog na čijem Drive-u želiš da čuvaš račune. Aplikacija vidi samo fajlove koje sama napravi ili koje izabereš kao folder za račune.
        </Text>
        <Pressable style={styles.primary} disabled={!request} onPress={() => { setError(null); promptAsync(); }}>
          <Text style={styles.primaryText}>Poveži Google nalog</Text>
        </Pressable>
      </View>
    );
  } else if (settings === undefined) {
    screen = <View style={styles.center}><ActivityIndicator size="large" /></View>;
  } else if (!settings) {
    screen = <Onboarding token={token} current={null} onFail={fail} onDone={setSettings} onLogout={signOut} />;
  } else {
    screen = (
      <Main
        token={token}
        settings={settings}
        tab={tab}
        setTab={setTab}
        onFail={fail}
        onSettings={s => { setSettings(s); setTab('scan'); }}
        onLogout={signOut}
        onShowIntro={() => { setIntroDone(false); setIntro(true); }}
      />
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

function Main({ token, settings, tab, setTab, onFail, onSettings, onLogout, onShowIntro }) {
  const receipts = useReceipts(token, settings, onFail);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {/* The scanner stays mounted so its save queue keeps running on other tabs. */}
        <Scanner token={token} settings={settings} onFail={onFail} active={tab === 'scan'} />
        {tab === 'list' && <ReceiptList token={token} data={receipts} onFail={onFail} />}
        {tab === 'stats' && <Stats token={token} settings={settings} data={receipts} onFail={onFail} />}
        {tab === 'settings' && (
          <Onboarding
            token={token}
            current={settings}
            onFail={onFail}
            onDone={onSettings}
            onCancel={() => setTab('scan')}
            onLogout={onLogout}
            onShowIntro={onShowIntro}
          />
        )}
      </View>
      <View style={styles.tabBar}>
        {TABS.map(([key, icon, label]) => (
          <Pressable key={key} style={styles.tabItem} onPress={() => setTab(key)}>
            <Text style={[styles.tabIcon, tab !== key && styles.tabDim]}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Onboarding({ token, current, onFail, onDone, onCancel, onLogout, onShowIntro }) {
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {current ? <Text style={styles.pageTitle}>Podešavanja</Text> : <Text style={styles.pageTitle}>Još jedan korak</Text>}
      <Text style={styles.h2}>Folder na Google Drive-u</Text>
      <Text style={styles.hint}>Ovde se čuvaju skenirani računi i odavde se prikazuju.</Text>
      <View style={styles.folderBox}>
        {folders === null ? <ActivityIndicator /> : (
          <ScrollView nestedScrollEnabled>
            {folders.length === 0 && <Text style={[styles.hint, { padding: 12 }]}>Nema foldera, napravi novi ispod.</Text>}
            {folders.map(item => (
              <Pressable
                key={item.id}
                style={[styles.folderRow, folder?.id === item.id && styles.folderOn]}
                onPress={() => { setFolder(item); setNewFolderName(''); }}>
                <Text>📁 {item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
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

      <Pressable style={[styles.primary, !canSave && styles.disabled]} disabled={!canSave} onPress={save}>
        <Text style={styles.primaryText}>{saving ? 'Čuvam…' : 'Sačuvaj'}</Text>
      </Pressable>
      {onCancel && <Button title="Odustani" color="#888" onPress={onCancel} />}
      {onShowIntro && <Button title="Prikaži uvod ponovo" color="#888" onPress={onShowIntro} />}
      <Button title="Odjavi se" color="#c62828" onPress={onLogout} />
      <Text style={[styles.hint, { textAlign: 'center', marginTop: 8 }]}>Verzija {VERSION}</Text>
    </ScrollView>
  );
}

// A receipt Poreska uprava couldn't confirm: the checked OCR fields name it, the photos become the PDF.
async function savePaperReceipt(token, settings, p) {
  const existing = await findReceipt(token, p.invoiceNumber);
  if (existing) throw Object.assign(new Error(`Već postoji: ${existing.name}`), { duplicate: true });
  const images = await Promise.all(p.photos.map(uri => new File(uri).base64()));
  const pdf = await Print.printToFileAsync({
    html: `<html><head><meta charset="utf-8"></head><body style="margin:0">${images
      .map(b => `<img src="data:image/jpeg;base64,${b}" style="display:block;width:100%;page-break-after:always">`)
      .join('')}</body></html>`,
    base64: true,
  });
  deleteFile(pdf.uri);
  const saved = await uploadPdf(token, settings.folder.id, fileName(settings.nameFormat, p), p, pdf.base64);
  p.photos.forEach(deleteFile); // kept until the upload succeeded, so a retry still has them
  return saved.name;
}

const KIND_ICON = { wait: '⏳', ok: '✅', dup: '⚠️', err: '❌' };

function Scanner({ token, settings, onFail, active }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState([]); // newest first: { id, kind, title, text, receipt }
  const seen = useRef(new Set());
  const queue = useRef(Promise.resolve());
  // Receipts without a usable QR code: in-app camera, OCR, check, then the verified receipt from Poreska uprava.
  const [paper, setPaper] = useState(false);

  function onVerified(found, fields) {
    setPaper(false);
    if (!found.html) { onScan({ data: found.url }); return; } // the form led to the receipt URL: same as a QR code
    const id = `verify:${fields.invoiceNumber}`;
    if (seen.current.has(id)) return;
    seen.current.add(id);
    Vibration.vibrate(40);
    const r = { url: found.url, html: found.html, invoiceNumber: fields.invoiceNumber, total: fields.total, date: fields.date };
    const title = `${r.total.toFixed(2)} RSD · ${r.date.toLocaleDateString('sr-RS')} · provereno`;
    setItems(list => [{ id, kind: 'wait', title, text: 'Čeka…', receipt: r }, ...list]);
    enqueue(id, r);
  }

  function onSaveImages(r) {
    setPaper(false);
    const id = `paper:${r.invoiceNumber}`;
    if (seen.current.has(id)) { r.photos.forEach(deleteFile); return; }
    seen.current.add(id);
    const title = `${r.total.toFixed(2)} RSD · ${r.date.toLocaleDateString('sr-RS')} · slika`;
    setItems(list => [{ id, kind: 'wait', title, text: 'Čeka…', receipt: r }, ...list]);
    enqueue(id, r);
  }

  const update = (id, patch) => setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)));

  // Saves run one at a time so the duplicate check always sees the previous upload.
  function enqueue(id, r) {
    update(id, { kind: 'wait', text: 'Čeka…' });
    queue.current = queue.current
      .then(() => (r.photos ? savePaperReceipt : saveReceipt)(token, settings, r))
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

  // The QR camera is unmounted meanwhile, so only one of them holds the camera.
  if (paper) {
    return <PaperScan onClose={() => setPaper(false)} onVerified={onVerified} onSaveImages={onSaveImages} onFail={onFail} />;
  }

  const count = k => items.filter(i => i.kind === k).length;
  return (
    <View style={{ flex: 1 }}>
      <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      {ocrAvailable && (
        <Pressable style={styles.scanPaper} onPress={() => setPaper(true)}>
          <Text style={styles.scanPaperText}>📄 Račun bez QR</Text>
        </Pressable>
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


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  page: { padding: 20, gap: 10, paddingBottom: 40 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: '600', marginTop: 8 },
  label: { fontSize: 16, textAlign: 'center' },
  hint: { color: '#666' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  folderBox: { maxHeight: 220, borderWidth: 1, borderColor: '#eee', borderRadius: 8 },
  folderRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  folderOn: { backgroundColor: '#e3f0ff' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e6e8eb', backgroundColor: '#fff', paddingBottom: 4 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabIcon: { fontSize: 20 },
  tabDim: { opacity: 0.45 },
  tabLabel: { fontSize: 11, color: '#888' },
  tabLabelOn: { color: '#1565c0', fontWeight: '700' },
  logo: { fontSize: 64, textAlign: 'center' },
  pageTitle: { fontSize: 24, fontWeight: '700' },
  primary: { padding: 15, borderRadius: 12, backgroundColor: '#1565c0', alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
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
  updateBar: { position: 'absolute', left: 12, right: 12, bottom: 24, padding: 14, borderRadius: 10, backgroundColor: '#1565c0', flexDirection: 'row', alignItems: 'center', gap: 10 },
});
