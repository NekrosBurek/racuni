// Spending overview from the receipts' data: this month vs last, the last six months, top shops, CSV export.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { spendingStats, toCsv } from '../stats';
import { uploadText } from '../drive';

const money = n => n.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Stats({ token, settings, data, onFail }) {
  const { receipts, reload } = data;
  const [exporting, setExporting] = useState(false);
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

  if (!s) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
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

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#f6f7f9' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#fff', gap: 2, elevation: 1 },
  cardLabel: { color: '#666', fontSize: 13 },
  cardValue: { fontSize: 22, fontWeight: '700' },
  cardSub: { color: '#888', fontSize: 12 },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170, padding: 12, borderRadius: 14, backgroundColor: '#fff' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: 22, borderRadius: 6, backgroundColor: '#1565c0' },
  barValue: { fontSize: 10, color: '#666' },
  barLabel: { fontSize: 12, color: '#444' },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#fff' },
  rank: { width: 24, textAlign: 'center', fontWeight: '700', color: '#1565c0' },
  shopName: { fontWeight: '600' },
  shopTotal: { fontWeight: '700' },
  note: { color: '#7a5600', backgroundColor: '#fff6e0', padding: 10, borderRadius: 10 },
  export: { marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: '#1565c0', alignItems: 'center' },
  exportText: { color: '#fff', fontWeight: '700' },
});
