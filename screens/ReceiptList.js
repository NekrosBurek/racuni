// Receipts in the Drive folder: grouped by month with totals, searchable, tap to view, long press to delete.
// Older files without the app's data (no total) can be filled in from their own text.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { listReceipts, trashReceipt, pdfText, setReceiptData } from '../drive';
import { receiptInfo, groupByMonth, filterReceipts } from '../stats';
import { legacyFields } from '../legacy';
import Viewer from './Viewer';

const money = n => n.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Shared by the list and the overview, so both show the same data after a delete or a fill-in.
export function useReceipts(token, settings, onFail) {
  const [receipts, setReceipts] = useState(null);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const reload = useCallback(() => {
    setLoading(true);
    return listReceipts(tokenRef.current, settings.folder.id)
      .then(files => setReceipts(files.map(receiptInfo)), onFail)
      .finally(() => setLoading(false));
  }, [settings.folder.id, onFail]);

  const remove = useCallback(async r => {
    try {
      await trashReceipt(tokenRef.current, r.id);
      setReceipts(list => list.filter(x => x.id !== r.id));
    } catch (e) {
      onFail(e);
    }
  }, [onFail]);

  const replace = useCallback(r => setReceipts(list => list.map(x => (x.id === r.id ? r : x))), []);

  return { receipts, loading, reload, remove, replace };
}

// Reads one old receipt's PDF text through Drive and stores what it finds as the file's data.
async function fillIn(token, r) {
  const f = legacyFields(await pdfText(token, r.id));
  const data = { checked: '1' }; // tried once; files without readable text don't come back to the list
  if (f.total !== null) data.total = String(f.total);
  if (f.date) data.date = f.date.toISOString();
  if (f.invoiceNumber) data.invoiceNumber = f.invoiceNumber;
  if (f.shop && !r.shop) data.shop = f.shop.slice(0, 40);
  await setReceiptData(token, r.id, data);
  return {
    ...r,
    checked: true,
    total: f.total ?? r.total,
    date: f.date ?? r.date,
    invoiceNumber: f.invoiceNumber ?? r.invoiceNumber,
    shop: r.shop || f.shop,
    complete: !!(f.invoiceNumber ?? r.invoiceNumber) && (f.total ?? r.total) !== null,
  };
}

export default function ReceiptList({ token, data, onFail }) {
  const { receipts, loading, reload, remove, replace } = data;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [filling, setFilling] = useState(null); // { done, of }

  useEffect(() => { reload(); }, [reload]);

  const shown = useMemo(() => filterReceipts(receipts ?? [], query), [receipts, query]);
  const sections = useMemo(() => groupByMonth(shown), [shown]);
  const missing = (receipts ?? []).filter(r => !r.checked && (r.total === null || !r.invoiceNumber));
  const total = shown.reduce((s, r) => s + (r.total ?? 0), 0);

  function askDelete(r) {
    Alert.alert('Obriši račun?', `${r.name}\n\nFajl ide u kantu na Google Drive-u, odakle može da se vrati.`, [
      { text: 'Otkaži', style: 'cancel' },
      { text: 'Obriši', style: 'destructive', onPress: () => remove(r) },
    ]);
  }

  async function fillAll() {
    setFilling({ done: 0, of: missing.length });
    let found = 0;
    for (const [i, r] of missing.entries()) {
      try {
        const updated = await fillIn(token, r);
        replace(updated);
        if (updated.total !== null && updated.invoiceNumber) found++;
      } catch (e) {
        onFail(e);
        break;
      }
      setFilling({ done: i + 1, of: missing.length });
    }
    setFilling(null);
    Alert.alert('Dopunjeno', `Podaci pronađeni za ${found} od ${missing.length} računa.`);
  }

  if (open) {
    return (
      <Viewer
        token={token}
        receipt={open}
        onClose={() => setOpen(null)}
        onDelete={r => { setOpen(null); remove(r); }}
      />
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.top}>
        <TextInput
          style={styles.search}
          placeholder="Pretraži radnju, datum, iznos…"
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
        {receipts && (
          <Text style={styles.summary}>{shown.length} računa · ukupno {money(total)} RSD</Text>
        )}
        {missing.length > 0 && !query && (
          <Pressable style={styles.fillBar} onPress={fillAll} disabled={!!filling}>
            {filling && <ActivityIndicator size="small" />}
            <Text style={styles.fillText}>
              {filling
                ? `Dopunjujem ${filling.done}/${filling.of}…`
                : `${missing.length} starijih računa nema iznos ili PFR broj. Dodirni da ih dopuniš iz PDF-a.`}
            </Text>
          </Pressable>
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={r => r.id}
        refreshing={loading}
        onRefresh={reload}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionTotal}>{money(section.total)} RSD</Text>
          </View>
        )}
        ListEmptyComponent={!loading && (
          <Text style={styles.empty}>{query ? 'Ništa ne odgovara pretrazi.' : 'Nema računa u folderu. Skeniraj prvi!'}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => setOpen(item)}
            onLongPress={() => askDelete(item)}
            delayLongPress={350}>
            <View style={styles.badge}><Text style={styles.badgeText}>{item.date ? item.date.getDate() : '?'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.shop || item.name}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={[styles.amount, item.total === null && styles.amountMissing]}>
              {item.total !== null ? money(item.total) : '—'}
            </Text>
          </Pressable>
        )}
      />
      {receipts === null && <View style={styles.loading}><ActivityIndicator size="large" /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#f6f7f9' },
  top: { padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  search: { backgroundColor: '#f0f2f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  summary: { fontWeight: '600', color: '#333' },
  fillBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#fff6e0' },
  fillText: { flex: 1, color: '#7a5600' },
  section: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#eef1f5' },
  sectionTitle: { fontWeight: '700', color: '#333' },
  sectionTotal: { fontWeight: '700', color: '#1565c0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  pressed: { backgroundColor: '#f2f6fc' },
  badge: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e3edfb', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '700', color: '#1565c0' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { color: '#888', fontSize: 12 },
  amount: { fontSize: 15, fontWeight: '700' },
  amountMissing: { color: '#bbb' },
  empty: { padding: 32, textAlign: 'center', color: '#888' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
