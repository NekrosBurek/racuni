// Spending overview from the receipts' data: this month vs last, budget, categories, installments, warranties,
// item prices, the last six months, top shops, CSV export.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { makeStyles, useTheme } from '../theme';
import { spendingStats, toCsv } from '../stats';
import { uploadText } from '../drive';
import Plans from './Plans';
import Viewer from './Viewer';

const money = n => n.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Stats({ token, settings, data, onFail, onBudget }) {
  const styles = useStyles();
  const c = useTheme();
  const { receipts, reload, remove, replace } = data;
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => { reload(); }, [reload]);
  const s = useMemo(() => receipts && spendingStats(receipts), [receipts]);

  async function exportCsv() {
    setExporting(true);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const file = await uploadText(token, settings.folder.id, `Racuni_${day}.csv`, 'text/csv', toCsv(receipts));
      Alert.alert('Izvezeno', `${file.name} je sačuvan u folderu ${settings.folder.name}.`, [
        { text: 'U redu' },
        { text: 'Otvori', onPress: () => Linking.openURL(file.webViewLink) },
      ]);
    } catch (e) {
      onFail(e);
    } finally {
      setExporting(false);
    }
  }

  if (open) {
    return (
      <Viewer
        token={token}
        receipt={open}
        onClose={() => setOpen(null)}
        onDelete={r => { setOpen(null); remove(r); }}
        onChange={r => { replace(r); setOpen(r); }}
        onFail={onFail}
      />
    );
  }

  if (!s) return <View style={styles.center}><ActivityIndicator size="large" color={c.accent} /></View>;
  const max = Math.max(1, ...s.months.map(m => m.total));
  const change = s.lastMonth.total ? Math.round(((s.thisMonth.total - s.lastMonth.total) / s.lastMonth.total) * 100) : null;

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      <View style={styles.cards}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Ovaj mesec</Text>
          <Text style={styles.cardValue}>{money(s.thisMonth.total)}</Text>
          <Text style={styles.cardSub}>
            {s.thisMonth.count} računa{change !== null ? ` · ${change > 0 ? '+' : ''}${change}% od prošlog` : ''}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Prošli mesec</Text>
          <Text style={styles.cardValue}>{money(s.lastMonth.total)}</Text>
          <Text style={styles.cardSub}>{s.lastMonth.count} računa</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Prosečan račun</Text>
        <Text style={styles.cardValue}>{money(s.average)} RSD</Text>
      </View>

      <Plans token={token} settings={settings} receipts={receipts} onBudget={onBudget} onOpen={setOpen} onFail={onFail} />

      <Text style={styles.h2}>Poslednjih 6 meseci</Text>
      <View style={styles.chart}>
        {s.months.map(m => (
          <View key={m.key} style={styles.barCol}>
            <Text style={styles.barValue} numberOfLines={1}>{m.total ? Math.round(m.total / 1000) + 'k' : ''}</Text>
            <View style={[styles.bar, { height: 4 + (m.total / max) * 120 }]} />
            <Text style={styles.barLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h2}>Najviše trošiš u</Text>
      {s.topShops.length === 0 && <Text style={styles.cardSub}>Još nema računa sa iznosom.</Text>}
      {s.topShops.map((shop, i) => (
        <View key={shop.shop} style={styles.shopRow}>
          <Text style={styles.rank}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.shopName} numberOfLines={1}>{shop.shop}</Text>
            <Text style={styles.cardSub}>{shop.count} računa</Text>
          </View>
          <Text style={styles.shopTotal}>{money(shop.total)}</Text>
        </View>
      ))}
      {s.missingTotals > 0 && (
        <Text style={styles.note}>{s.missingTotals} računa nema iznos i nisu uračunati. U listi „Računi" ih možeš dopuniti.</Text>
      )}

      <Pressable style={styles.export} onPress={exportCsv} disabled={exporting || !receipts.length}>
        {exporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.exportText}>Izvezi tabelu (CSV) u Drive folder</Text>}
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles(c => ({
  fill: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: c.surface, gap: 2, elevation: c.dark ? 0 : 1 },
  cardLabel: { color: c.textDim, fontSize: 13 },
  cardValue: { fontSize: 22, fontWeight: '700', color: c.text },
  cardSub: { color: c.textFaint, fontSize: 12 },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 8, color: c.text },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170, padding: 12, borderRadius: 14, backgroundColor: c.surface },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: 22, borderRadius: 6, backgroundColor: c.accent },
  barValue: { fontSize: 10, color: c.textDim },
  barLabel: { fontSize: 12, color: c.textDim },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: c.surface },
  rank: { width: 24, textAlign: 'center', fontWeight: '700', color: c.accent },
  shopName: { fontWeight: '600', color: c.text },
  shopTotal: { fontWeight: '700', color: c.text },
  note: { color: c.warnText, backgroundColor: c.warnBg, padding: 10, borderRadius: 10 },
  export: { marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: c.button, alignItems: 'center' },
  exportText: { color: '#fff', fontWeight: '700' },
}));
