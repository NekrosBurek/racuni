// Shows a receipt PDF inside the app (pdf.js in a WebView) instead of sending the user to Google Drive.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, Text, View } from 'react-native';
import { makeStyles, useTheme } from '../theme';
import { WebView } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import { mediaUrl } from '../drive';
import ReceiptDetails from './ReceiptDetails';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

// Every page drawn to a canvas at the screen's pixel density; pinch to zoom.
const page = (base64, bg) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<script src="${PDFJS}/pdf.min.js"></script>
<style>body{margin:0;background:${bg}}canvas{display:block;width:100%;margin:0 0 8px;background:#fff}</style>
</head><body><div id="pages"></div><script>
pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.js';
var raw = atob('${base64}'), bytes = new Uint8Array(raw.length);
for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
pdfjsLib.getDocument({ data: bytes }).promise.then(async function (pdf) {
  for (var n = 1; n <= pdf.numPages; n++) {
    var p = await pdf.getPage(n);
    var scale = (window.innerWidth * (window.devicePixelRatio || 1)) / p.getViewport({ scale: 1 }).width;
    var vp = p.getViewport({ scale: scale });
    var c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    document.getElementById('pages').appendChild(c);
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
  window.ReactNativeWebView.postMessage('ok');
}).catch(function (e) { window.ReactNativeWebView.postMessage('err:' + e.message); });
</script></body></html>`;

export default function Viewer({ token, receipt, onClose, onDelete, onChange, onFail }) {
  const styles = useStyles();
  const c = useTheme();
  const [html, setHtml] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const target = new File(Paths.cache, `racun-${receipt.id}.pdf`);
      try {
        const file = await File.downloadFileAsync(mediaUrl(receipt.id), target, {
          headers: { Authorization: `Bearer ${token}` },
          idempotent: true,
        });
        const base64 = await file.base64();
        if (alive) setHtml(base64);
      } catch (e) {
        if (alive) setFailed(e.message);
      } finally {
        try { target.delete(); } catch { /* not downloaded */ }
      }
    })();
    return () => { alive = false; };
  }, [token, receipt.id]);

  function confirmDelete() {
    Alert.alert('Obriši račun?', `${receipt.name}\n\nFajl ide u kantu na Google Drive-u, odakle može da se vrati.`, [
      { text: 'Otkaži', style: 'cancel' },
      { text: 'Obriši', style: 'destructive', onPress: () => onDelete(receipt) },
    ]);
  }

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}><Text style={styles.back}>←</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{receipt.shop || receipt.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[receipt.date?.toLocaleDateString('sr-RS'), receipt.total !== null ? `${receipt.total.toFixed(2)} RSD` : null]
              .filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {failed ? (
        <View style={styles.center}><Text style={styles.sub}>Račun nije učitan: {failed}</Text></View>
      ) : html ? (
        <WebView
          style={styles.fill}
          originWhitelist={['*']}
          source={{ html: page(html, c.dark ? '#0f1115' : '#e9e9e9') }}
          onMessage={e => { if (e.nativeEvent.data.startsWith('err:')) setFailed(e.nativeEvent.data.slice(4)); }}
        />
      ) : (
        <View style={styles.center}><ActivityIndicator size="large" color={c.accent} /></View>
      )}
      <ReceiptDetails token={token} receipt={receipt} onChange={onChange} onFail={onFail} />
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => Linking.openURL(receipt.link)}>
          <Text style={styles.actionText}>Otvori u Drive-u</Text>
        </Pressable>
        <Pressable style={[styles.action, styles.danger]} onPress={confirmDelete}>
          <Text style={[styles.actionText, styles.dangerText]}>Obriši</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  fill: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  back: { fontSize: 26, paddingHorizontal: 4, color: c.text },
  title: { fontSize: 17, fontWeight: '700', color: c.text },
  sub: { color: c.textDim },
  actions: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: c.border },
  action: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center' },
  danger: { backgroundColor: c.dangerSoft },
  actionText: { fontWeight: '600', color: c.accent },
  dangerText: { color: c.danger },
}));
