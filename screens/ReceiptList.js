// Receipts in the Drive folder: a list grouped by month with totals, or a gallery of previews; searchable,
// tap to view, long press to delete. Older files without the app's data (no total) can be filled in from their own text.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { listReceipts, trashReceipt, pdfText, setReceiptData } from '../drive';
import { receiptInfo, groupByMonth, filterReceipts } from '../stats';
import { legacyFields } from '../legacy';
import Viewer from './Viewer';
import { ShopIcon } from './ShopIcon';
import { makeStyles, useTheme } from '../theme';

const day = d => (d ? d.toLocaleDateString('sr-RS') : '');
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
  const styles = useStyles();
  const c = useTheme();
  const { receipts, loading, reload, remove, replace } = data;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [filling, setFilling] = useState(null); // { done, of }
  const [gallery, setGallery] = useState(false);

  useEffect(() => { reload(); }, [reload]);

  const shown = useMemo(() => filterReceipts(receipts ?? [], query), [receipts, query]);
  const sections = useMemo(() => groupByMonth(shown), [shown]);
  const newestFirst = useMemo(() => sections.flatMap(s => s.data), [sections]);
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

  const empty = !loading && (
    <Text style={styles.empty}>{query ? 'Ništa ne odgovara pretrazi.' : 'Nema računa u folderu. Skeniraj prvi!'}</Text>
  );
  const press = item => ({ onPress: () => setOpen(item), onLongPress: () => askDelete(item), delayLongPress: 350 });

  return (
    <View style={styles.fill}>
      <View style={styles.top}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder="Pretraži radnju, datum, iznos…"
            placeholderTextColor={c.textFaint}
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
          />
          <Pressable
            style={styles.viewToggle}
            onPress={() => setGallery(g => !g)}
            accessibilityRole="button"
            accessibilityLabel={gallery ? 'Prikaži kao listu' : 'Prikaži kao galeriju'}>
            <Text style={styles.viewToggleText}>{gallery ? '☰' : '▦'}</Text>
          </Pressable>
        </View>
        {receipts && (
          <Text style={styles.summary}>{shown.length} računa · ukupno {money(total)} RSD</Text>
        )}
        {missing.length > 0 && !query && (
          <Pressable style={styles.fillBar} onPress={fillAll} disabled={!!filling}>
            {filling && <ActivityIndicator size="small" color={c.warnText} />}
            <Text style={styles.fillText}>
              {filling
                ? `Dopunjujem ${filling.done}/${filling.of}…`
                : `${missing.length} starijih računa nema iznos ili PFR broj. Dodirni da ih dopuniš iz PDF-a.`}
            </Text>
          </Pressable>
        )}
      </View>
      {gallery ? (
        <FlatList
          key="gallery"
          data={newestFirst}
          keyExtractor={r => r.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          refreshing={loading}
          onRefresh={reload}
          ListEmptyComponent={empty}
          renderItem={({ item }) => <Card token={token} item={item} {...press(item)} />}
        />
      ) : (
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
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} {...press(item)}>
              <ShopIcon receipt={item} dark={c.dark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.shop || item.name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{[day(item.date), item.name].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={[styles.amount, item.total === null && styles.amountMissing]}>
                {item.total !== null ? money(item.total) : '—'}
              </Text>
            </Pressable>
          )}
        />
      )}
      {receipts === null && <View style={styles.loading}><ActivityIndicator size="large" color={c.accent} /></View>}
    </View>
  );
}

// One gallery tile: Drive's preview of the receipt's first page; the store icon until (or if no) preview exists.
function Card({ token, item, ...press }) {
  const styles = useStyles();
  const c = useTheme();
  const [noThumb, setNoThumb] = useState(!item.thumb);
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} {...press}>
      <View style={styles.thumbBox}>
        {noThumb ? (
          <ShopIcon receipt={item} size={64} dark={c.dark} />
        ) : (
          <Image
            source={{ uri: item.thumb, headers: { Authorization: `Bearer ${token}` } }}
            style={styles.thumb}
            resizeMode="cover"
            onError={() => setNoThumb(true)}
          />
        )}
      </View>
      <View style={styles.cardInfo}>
        <ShopIcon receipt={item} size={22} dark={c.dark} />
        <Text style={styles.cardShop} numberOfLines={1}>{item.shop || item.name}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardDate}>{day(item.date)}</Text>
        <Text style={[styles.cardAmount, item.total === null && styles.amountMissing]}>
          {item.total !== null ? money(item.total) : '—'}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(c => ({
  fill: { flex: 1, backgroundColor: c.bg },
  top: { padding: 12, gap: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, backgroundColor: c.surfaceAlt, color: c.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  viewToggle: { width: 44, borderRadius: 10, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  viewToggleText: { fontSize: 20, color: c.accent },
  summary: { fontWeight: '600', color: c.text },
  fillBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: c.warnBg },
  fillText: { flex: 1, color: c.warnText },
  section: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.surfaceAlt },
  sectionTitle: { fontWeight: '700', color: c.text },
  sectionTotal: { fontWeight: '700', color: c.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.borderSoft },
  pressed: { backgroundColor: c.selected },
  rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  rowSub: { color: c.textFaint, fontSize: 12 },
  amount: { fontSize: 15, fontWeight: '700', color: c.text },
  amountMissing: { color: c.textFaint },
  grid: { padding: 8 },
  gridRow: { gap: 8, marginBottom: 8 },
  card: { flex: 1, maxWidth: '50%', borderRadius: 12, backgroundColor: c.surface, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
  thumbBox: { height: 180, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: '100%' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 8, paddingTop: 6 },
  cardShop: { flex: 1, fontWeight: '600', color: c.text, fontSize: 13 },
  cardDate: { color: c.textFaint, fontSize: 12, paddingBottom: 8 },
  cardAmount: { fontWeight: '700', color: c.text, fontSize: 13, paddingBottom: 8 },
  empty: { padding: 32, textAlign: 'center', color: c.textFaint },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
}));
