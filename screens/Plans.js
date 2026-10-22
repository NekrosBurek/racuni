// Overview sections built on plans.js: monthly budget, spending by category, running installments, warranties and
// item price history.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { saveBudget } from '../drive';
import { budgetStatus, categoryTotals, installments, warranty, priceHistory } from '../plans';
import { itemsSummary } from '../stats';
import { makeStyles, useTheme } from '../theme';

const money = n => n.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const month = d => d.toLocaleDateString('sr-RS', { month: 'short', year: 'numeric' });
const day = d => (d ? d.toLocaleDateString('sr-RS') : '');

export default function Plans({ token, settings, receipts, onBudget, onOpen, onFail }) {
  const styles = useStyles();
  const c = useTheme();
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetText, setBudgetText] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [query, setQuery] = useState('');

  const budget = budgetStatus(receipts, settings.budget);
  const cats = useMemo(() => categoryTotals(receipts), [receipts]);
  const rates = useMemo(() => receipts.map(r => ({ r, s: installments(r) })).filter(x => x.s?.left), [receipts]);
  const warranties = useMemo(() => receipts.map(r => ({ r, w: warranty(r) })).filter(x => x.w?.active)
    .sort((a, b) => a.w.end - b.w.end), [receipts]);
  const prices = useMemo(() => priceHistory(receipts, query), [receipts, query]);
  const monthlyRates = rates.reduce((s, x) => s + x.s.perMonth, 0);
  const catMax = Math.max(1, ...cats.map(x => x.total));

  async function storeBudget() {
    const value = Math.round(Number(budgetText.replace(/\./g, '').replace(',', '.')) || 0);
    setSavingBudget(true);
    try {
      await saveBudget(token, settings.folder.id, value);
      onBudget(value);
      setEditingBudget(false);
    } catch (e) {
      onFail(e);
    } finally {
      setSavingBudget(false);
    }
  }

  const over = budget.ratio >= 1;
  const near = !over && budget.ratio >= 0.8;
  return (
    <>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>Budžet za ovaj mesec</Text>
          <Pressable hitSlop={8} onPress={() => { setBudgetText(settings.budget ? String(settings.budget) : ''); setEditingBudget(e => !e); }}>
            <Text style={styles.link}>{editingBudget ? 'Otkaži' : settings.budget ? 'Promeni' : 'Postavi'}</Text>
          </Pressable>
        </View>
        {editingBudget ? (
          <View style={styles.budgetEdit}>
            <TextInput
              style={styles.input}
              value={budgetText}
              onChangeText={setBudgetText}
              keyboardType="numeric"
              placeholder="npr. 80000 (0 = bez budžeta)"
              placeholderTextColor={c.textFaint}
              autoFocus
            />
            <Pressable style={styles.button} onPress={storeBudget} disabled={savingBudget}>
              {savingBudget ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sačuvaj</Text>}
            </Pressable>
          </View>
        ) : budget.budget ? (
          <>
            <Text style={styles.cardValue}>{money(budget.spent)} / {money(budget.budget)}</Text>
            <View style={styles.track}>
              <View style={[styles.fillBar, { width: `${Math.min(100, budget.ratio * 100)}%` }, near && styles.fillWarn, over && styles.fillOver]} />
            </View>
            <Text style={[styles.cardSub, near && styles.warn, over && styles.over]}>
              {over ? `Prekoračeno za ${money(-budget.left)} RSD` : `Ostalo ${money(budget.left)} RSD`}
            </Text>
          </>
        ) : (
          <Text style={styles.cardSub}>Postavi mesečni limit i aplikacija će pokazati koliko ti je ostalo.</Text>
        )}
      </View>

      {cats.length > 0 && (
        <>
          <Text style={styles.h2}>Ovaj mesec po kategorijama</Text>
          <View style={styles.card}>
            {cats.map(x => (
              <View key={x.name} style={styles.catRow}>
                <Text style={styles.catName}>{x.name}</Text>
                <View style={styles.catTrack}><View style={[styles.catBar, { width: `${(x.total / catMax) * 100}%` }]} /></View>
                <Text style={styles.catTotal}>{money(x.total)}</Text>
              </View>
            ))}
            <Text style={styles.cardSub}>Kategoriju računa menjaš u pregledu računa → Uredi.</Text>
          </View>
        </>
      )}

      {rates.length > 0 && (
        <>
          <Text style={styles.h2}>Rate u toku · {money(monthlyRates)} RSD mesečno</Text>
          {rates.map(({ r, s }) => (
            <Pressable key={r.id} style={styles.item} onPress={() => onOpen(r)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{itemsSummary(r) || r.shop || r.name}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>{r.shop} · plaćeno {s.paid}/{s.count} · poslednja {month(s.lastDue)}</Text>
                <View style={styles.track}><View style={[styles.fillBar, { width: `${(s.paid / s.count) * 100}%` }]} /></View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.itemTitle}>{money(s.remaining)}</Text>
                <Text style={styles.cardSub}>{s.left} × {money(s.perMonth)}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {warranties.length > 0 && (
        <>
          <Text style={styles.h2}>Garancije</Text>
          {warranties.map(({ r, w }) => (
            <Pressable key={r.id} style={styles.item} onPress={() => onOpen(r)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{itemsSummary(r) || r.shop || r.name}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>{r.shop} · kupljeno {day(r.date)}</Text>
              </View>
              <Text style={[styles.cardSub, w.daysLeft <= 60 && styles.warn]}>do {day(w.end)}</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={styles.h2}>Cene artikala</Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Npr. mleko, hleb, deterdžent…"
        placeholderTextColor={c.textFaint}
      />
      {query.trim().length > 1 && prices.length === 0 && (
        <Text style={styles.cardSub}>Nema tog artikla na računima koji imaju sačuvane stavke.</Text>
      )}
      {prices.map(p => (
        <View key={p.name} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={[styles.itemTitle, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.cardSub}>{p.min === p.max ? money(p.min) : `${money(p.min)} – ${money(p.max)}`}</Text>
          </View>
          {p.buys.slice(0, 6).map((b, i) => (
            <Pressable key={i} style={styles.rowBetween} onPress={() => onOpen(b.receipt)}>
              <Text style={styles.cardSub} numberOfLines={1}>{day(b.date)} · {b.shop}</Text>
              <Text style={[styles.priceText, b.price === p.min && p.min !== p.max && styles.cheapest]}>{money(b.price)}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </>
  );
}

const useStyles = makeStyles(c => ({
  card: { padding: 14, borderRadius: 14, backgroundColor: c.surface, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardLabel: { color: c.textDim, fontSize: 13 },
  cardValue: { fontSize: 20, fontWeight: '700', color: c.text },
  cardSub: { color: c.textFaint, fontSize: 12 },
  link: { color: c.accent, fontWeight: '700' },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 8, color: c.text },
  track: { height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden', marginTop: 4 },
  fillBar: { height: '100%', borderRadius: 4, backgroundColor: c.accent },
  fillWarn: { backgroundColor: c.warn },
  fillOver: { backgroundColor: c.danger },
  warn: { color: c.warn, fontWeight: '600' },
  over: { color: c.danger, fontWeight: '600' },
  budgetEdit: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.text, backgroundColor: c.surfaceAlt },
  button: { paddingHorizontal: 16, borderRadius: 10, backgroundColor: c.button, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catName: { width: 110, color: c.text, fontSize: 13 },
  catTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
  catBar: { height: '100%', borderRadius: 4, backgroundColor: c.accent },
  catTotal: { width: 90, textAlign: 'right', color: c.text, fontSize: 13, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: c.surface },
  itemTitle: { fontWeight: '600', color: c.text },
  priceText: { color: c.text, fontWeight: '600' },
  cheapest: { color: c.ok },
}));
