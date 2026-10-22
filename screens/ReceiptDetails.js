// Under a receipt: its category, warranty and installments, with chips to change them. Each change is stored on the
// Drive file right away (appProperties), so it shows up for everyone who shares the folder.
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { setReceiptData } from '../drive';
import { category, warranty, installments, CATEGORIES, WARRANTY_CHOICES, INSTALLMENT_CHOICES } from '../plans';
import { makeStyles, useTheme } from '../theme';

const money = n => n.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const years = m => (m % 12 ? `${m} mes.` : `${m / 12} god.`);

export default function ReceiptDetails({ token, receipt, onChange, onFail }) {
  const styles = useStyles();
  const c = useTheme();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const w = warranty(receipt);
  const rate = installments(receipt);

  async function save(field, value, patch) {
    setSaving(true);
    try {
      await setReceiptData(token, receipt.id, { [field]: value });
      onChange({ ...receipt, ...patch });
    } catch (e) {
      onFail(e);
    } finally {
      setSaving(false);
    }
  }

  const chips = (options, current, label, pick) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map(o => (
        <Pressable key={o} style={[styles.chip, o === current && styles.chipOn]} disabled={saving} onPress={() => pick(o)}>
          <Text style={[styles.chipText, o === current && styles.chipTextOn]}>{label(o)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.box}>
      <Pressable style={styles.summary} onPress={() => setEditing(e => !e)}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.line}>🏷️ {category(receipt)}</Text>
          {w && (
            <Text style={[styles.line, !w.active && styles.dim, w.active && w.daysLeft <= 60 && styles.warn]}>
              🛡️ Garancija {w.active ? 'do' : 'istekla'} {w.end.toLocaleDateString('sr-RS')}
              {w.active && w.daysLeft <= 60 ? ` (još ${w.daysLeft} dana)` : ''}
            </Text>
          )}
          {rate && (
            <Text style={styles.line}>
              💳 {rate.left ? `Rate: plaćeno ${rate.paid}/${rate.count}, ostalo ${rate.left} × ${money(rate.perMonth)} = ${money(rate.remaining)} RSD` : `Otplaćeno (${rate.count} rata)`}
            </Text>
          )}
        </View>
        {saving ? <ActivityIndicator color={c.accent} /> : <Text style={styles.edit}>{editing ? 'Gotovo' : 'Uredi'}</Text>}
      </Pressable>
      {editing && (
        <View style={styles.editor}>
          <Text style={styles.label}>Kategorija</Text>
          {chips(CATEGORIES, category(receipt), x => x, x => save('category', x, { category: x }))}
          <Text style={styles.label}>Garancija</Text>
          {chips(WARRANTY_CHOICES, receipt.warrantyMonths, m => (m ? years(m) : 'Bez'),
            m => save('warranty', m ? String(m) : null, { warrantyMonths: m }))}
          <Text style={styles.label}>Plaćeno na rate</Text>
          {chips(INSTALLMENT_CHOICES, receipt.installments, n => (n ? `${n} rata` : 'Ne'),
            n => save('rate', n ? String(n) : null, { installments: n }))}
          {receipt.installments > 0 && (
            <Text style={styles.hint}>Računa se da prva rata ide mesec posle kupovine.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  box: { borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  line: { color: c.text, fontSize: 14 },
  dim: { color: c.textFaint },
  warn: { color: c.warn, fontWeight: '600' },
  edit: { color: c.accent, fontWeight: '700' },
  editor: { paddingBottom: 10, gap: 4 },
  label: { color: c.textDim, fontSize: 12, paddingHorizontal: 14, marginTop: 4 },
  chips: { gap: 6, paddingHorizontal: 14 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.surfaceAlt },
  chipOn: { backgroundColor: c.button },
  chipText: { color: c.text, fontSize: 13 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  hint: { color: c.textFaint, fontSize: 12, paddingHorizontal: 14 },
}));
