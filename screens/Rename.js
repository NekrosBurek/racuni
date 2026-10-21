// "Preimenuj postojeće račune": rebuilds every receipt's file name with the chosen format. Older files without
// stored naming data are read once from their PDF (through Drive); the plan is shown before anything is renamed.
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { listReceipts, pdfText, renameReceipt } from '../drive';
import { receiptInfo, receiptDescription } from '../stats';
import { dataFromText, renamePlan } from '../rename';

export default function RenameExisting({ token, folder, format, onFail }) {
  const [progress, setProgress] = useState(null); // text shown while working

  async function start() {
    try {
      setProgress('Učitavam račune…');
      const receipts = (await listReceipts(token, folder.id)).map(receiptInfo);
      const described = new Map(); // id -> description to store with the new name
      const missing = receipts.filter(r => r.items === null);
      for (const [i, r] of missing.entries()) {
        setProgress(`Čitam starije račune ${i + 1}/${missing.length}…`);
        try {
          const d = dataFromText(await pdfText(token, r.id));
          Object.assign(r, {
            shop: r.shop || d.shop,
            place: d.place,
            items: d.items,
            date: r.date ?? d.date,
            total: r.total ?? d.total,
            invoiceNumber: r.invoiceNumber ?? d.invoiceNumber,
          });
          described.set(r.id, receiptDescription(r));
        } catch {
          // unreadable (e.g. a photo): keep its current name
        }
      }
      const plan = renamePlan(receipts, format);
      setProgress(null);
      if (!plan.length) {
        Alert.alert('Nema promena', 'Svi računi već imaju ime po ovom formatu.');
        return;
      }
      const examples = plan.slice(0, 3).map(p => `${p.from}\n→ ${p.to}`).join('\n\n');
      Alert.alert(`Preimenovati ${plan.length} računa?`, examples + (plan.length > 3 ? '\n\n…' : ''), [
        { text: 'Otkaži', style: 'cancel' },
        { text: 'Preimenuj', onPress: () => apply(plan, described) },
      ]);
    } catch (e) {
      setProgress(null);
      onFail(e);
    }
  }

  async function apply(plan, described) {
    let done = 0;
    try {
      for (const p of plan) {
        setProgress(`Preimenujem ${done + 1}/${plan.length}…`);
        await renameReceipt(token, p.id, p.to, described.get(p.id));
        done++;
      }
      Alert.alert('Gotovo', `Preimenovano ${done} računa.`);
    } catch (e) {
      onFail(e);
    } finally {
      setProgress(null);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Postojeći računi</Text>
      <Text style={styles.hint}>Daje svim računima u folderu ime po formatu iznad, bez ponovnog skeniranja.</Text>
      <Pressable style={[styles.button, progress && styles.busy]} disabled={!!progress} onPress={start}>
        {progress ? <ActivityIndicator color="#1565c0" /> : null}
        <Text style={styles.buttonText}>{progress ?? 'Preimenuj postojeće račune'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#f4f7fb' },
  title: { fontSize: 16, fontWeight: '700' },
  hint: { color: '#666' },
  button: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#e3edfb' },
  busy: { opacity: 0.8 },
  buttonText: { color: '#1565c0', fontWeight: '700' },
});
