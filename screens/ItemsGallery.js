// A receipt's purchases as tiles: the receipt itself (PDF) first, then one tile per item with its picture, name,
// quantity and price.
import { useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { itemIcon } from '../plans';
import { itemLabel } from '../stats';
import { makeStyles } from '../theme';

const money = n => n.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ItemsGallery({ token, receipt, onOpenPdf, footer }) {
  const styles = useStyles();
  const tiles = [{ key: 'pdf' }, ...receipt.items.map((item, i) => ({ key: String(i), item }))];
  return (
    <FlatList
      data={tiles}
      keyExtractor={t => t.key}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.grid}
      ListFooterComponent={footer}
      renderItem={({ item: t }) => (t.item
        ? <ItemTile item={t.item} />
        : <PdfTile token={token} receipt={receipt} onPress={onOpenPdf} />)}
    />
  );
}

function PdfTile({ token, receipt, onPress }) {
  const styles = useStyles();
  const [noThumb, setNoThumb] = useState(!receipt.thumb);
  return (
    <Pressable style={({ pressed }) => [styles.tile, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <View style={styles.picture}>
        {noThumb
          ? <Text style={styles.emoji}>🧾</Text>
          : <Image source={{ uri: receipt.thumb, headers: { Authorization: `Bearer ${token}` } }} style={styles.thumb} resizeMode="cover" onError={() => setNoThumb(true)} />}
      </View>
      <Text style={styles.name}>Račun (PDF)</Text>
      <Text style={styles.price}>{receipt.total !== null ? `${money(receipt.total)} RSD` : ''}</Text>
    </Pressable>
  );
}

function ItemTile({ item }) {
  const styles = useStyles();
  const qty = item.quantity && item.quantity !== 1 ? `${item.quantity} × ${money(item.total / item.quantity)}` : null;
  return (
    <View style={styles.tile}>
      <View style={styles.picture}><Text style={styles.emoji}>{itemIcon(item.name)}</Text></View>
      <Text style={styles.name} numberOfLines={3}>{itemLabel(item.name) || item.name}</Text>
      {qty && <Text style={styles.qty}>{qty}</Text>}
      <Text style={styles.price}>{money(item.total)} RSD</Text>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  grid: { padding: 8, backgroundColor: c.bg },
  row: { gap: 8, marginBottom: 8 },
  tile: { flex: 1, maxWidth: '50%', borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: 'hidden', paddingBottom: 10 },
  pressed: { backgroundColor: c.selected },
  picture: { height: 120, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: '100%' },
  emoji: { fontSize: 52 },
  name: { color: c.text, fontWeight: '600', fontSize: 13, paddingHorizontal: 10, paddingTop: 8 },
  qty: { color: c.textFaint, fontSize: 12, paddingHorizontal: 10, paddingTop: 2 },
  price: { color: c.accent, fontWeight: '700', fontSize: 13, paddingHorizontal: 10, paddingTop: 4 },
}));
