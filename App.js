import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Button, FlatList, Linking, Pressable, StatusBar, StyleSheet, Text, TextInput, Vibration, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as Print from 'expo-print';
import { File } from 'expo-file-system';
import { parseReceiptUrl, extractJournal, shopName, fileName, DEFAULT_FORMAT, FORMAT_TOKENS } from './receipt';
import { findSettings, listFolders, saveSettings, findReceipt, listReceipts, uploadPdf } from './drive';
import { REPO, APK_URL, VERSION, isNewer } from './version';

WebBrowser.maybeCompleteAuthSession();

// OAuth client IDs from Google Cloud Console (see README.md).
const ANDROID_CLIENT_ID = '21750469073-f08lm2v1en0kmgat0qg5pqh65d9ie17n.apps.googleusercontent.com';
const IOS_CLIENT_ID = 'PASTE-IOS-CLIENT-ID.apps.googleusercontent.com';

// Every push to main publishes a GitHub release; offer it if it's newer than this build.
async function checkForUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return;
    const latest = (await res.json()).tag_name.replace(/^v/, '');
    if (!isNewer(latest, VERSION)) return;
    Alert.alert('Nova verzija', `Dostupna je verzija ${latest}.`, [
      { text: 'Kasnije', style: 'cancel' },
      { text: 'Preuzmi', onPress: () => Linking.openURL(APK_URL) },
    ]);
  } catch {
    // offline or GitHub down: just skip the check
  }
}

async function saveReceipt(token, settings, r) {
  const existing = await findReceipt(token, r.invoiceNumber);
  if (existing) throw Object.assign(new Error(`Već postoji: ${existing.name}`), { duplicate: true });
  const journal = extractJournal(await (await fetch(r.url)).text());
  const receipt = { ...r, shop: shopName(journal) };
  const pdf = await Print.printToFileAsync({
    html: `<html><head><meta charset="utf-8"></head><body style="display:flex;justify-content:center">${journal}</body></html>`,
    base64: true,
  });
  new File(pdf.uri).delete(); // only the base64 copy is needed; keep nothing on the device
  const saved = await uploadPdf(token, settings.folder.id, fileName(settings.nameFormat, receipt), receipt, pdf.base64);
  return saved.name;
}

export default function App() {
  // Only the access token lives here (in memory); folder and name format are read back from Drive.
  const [token, setToken] = useState(null);
  const [settings, setSettings] = useState(undefined); // undefined = loading, null = onboarding needed
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('scan');
  const [error, setError] = useState(null);
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  useEffect(() => { checkForUpdate(); }, []);

  useEffect(() => {
    if (response?.type === 'success') setToken(response.authentication.accessToken);
  }, [response]);

  const fail = useCallback(e => {
    if (e.message.includes('istekla')) setToken(null);
    setError(e.message);
  }, []);

  useEffect(() => {
    if (!token) return;
    setSettings(undefined);
    findSettings(token).then(setSettings, fail);
  }, [token, fail]);

  let screen;
  if (!token) {
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

function Onboarding({ token, current, onFail, onDone, onCancel }) {
  const [folders, setFolders] = useState(null);
  const [folder, setFolder] = useState(current?.folder ?? null);
  const [newFolderName, setNewFolderName] = useState('');
  const [nameFormat, setNameFormat] = useState(current?.nameFormat || DEFAULT_FORMAT);
  const [saving, setSaving] = useState(false);

  useEffect(() => { listFolders(token).then(setFolders, onFail); }, [token, onFail]);

  const example = fileName(nameFormat, {
    date: new Date(), total: 1234.5, shop: 'MAXI 123', invoiceNumber: 'ABCD1234-ABCD1234-42',
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

      <Button title={saving ? 'Čuvam…' : 'Sačuvaj'} disabled={!canSave} onPress={save} />
      {onCancel && <Button title="Odustani" color="#888" onPress={onCancel} />}
    </View>
  );
}

const KIND_ICON = { wait: '⏳', ok: '✅', dup: '⚠️', err: '❌' };

function Scanner({ token, settings, onFail, active }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState([]); // newest first: { id, kind, title, text, receipt }
  const seen = useRef(new Set());
  const queue = useRef(Promise.resolve());

  const update = (id, patch) => setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)));

  // Saves run one at a time so the duplicate check always sees the previous upload.
  function enqueue(id, r) {
    update(id, { kind: 'wait', text: 'Čeka…' });
    queue.current = queue.current
      .then(() => saveReceipt(token, settings, r))
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
});
