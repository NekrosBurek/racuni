// First-run walkthrough: what the app does, where receipts go, and how to scan with or without a QR code.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const SLIDES = [
  { icon: '🧾', title: 'Računi na jednom mestu', text: 'Skeniraš QR kod sa fiskalnog računa i aplikacija preuzme overen račun sa sajta Poreske uprave.' },
  { icon: '☁️', title: 'Sve ide na tvoj Google Drive', text: 'Svaki račun se čuva kao PDF u folderu koji izabereš, sa imenom po datumu, radnji i kupljenim stavkama. Isti račun se ne čuva dvaput.' },
  { icon: '📷', title: 'Skeniraj jedan za drugim', text: 'Kamera radi stalno: drži račune ispred nje redom, a čuvanje ide u pozadini.' },
  { icon: '📄', title: 'Nema QR koda?', text: 'Slikaj dno računa. Aplikacija pročita PFR broj, brojač, vreme i iznos i preuzme isti overen račun bez QR koda.' },
  { icon: '📊', title: 'Pregled potrošnje', text: 'Vidi koliko trošiš po mesecima i radnjama, pretraži račune i izvezi tabelu za knjigovodstvo.' },
];

export default function Intro({ onDone }) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <View style={styles.fill}>
      <Pressable style={styles.skip} onPress={onDone} hitSlop={12}><Text style={styles.skipText}>Preskoči</Text></Pressable>
      <View style={styles.body}>
        <Text style={styles.icon}>{slide.icon}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.text}>{slide.text}</Text>
      </View>
      <View style={styles.dots}>
        {SLIDES.map((_, n) => <View key={n} style={[styles.dot, n === i && styles.dotOn]} />)}
      </View>
      <View style={styles.buttons}>
        {i > 0 ? (
          <Pressable style={styles.secondary} onPress={() => setI(i - 1)}><Text style={styles.secondaryText}>Nazad</Text></Pressable>
        ) : <View style={{ flex: 1 }} />}
        <Pressable style={styles.primary} onPress={() => (last ? onDone() : setI(i + 1))}>
          <Text style={styles.primaryText}>{last ? 'Počni' : 'Dalje'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#fff', padding: 24 },
  skip: { alignSelf: 'flex-end' },
  skipText: { color: '#1565c0', fontWeight: '600' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  icon: { fontSize: 72 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 16, color: '#555', textAlign: 'center', lineHeight: 23 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d5dbe3' },
  dotOn: { width: 22, backgroundColor: '#1565c0' },
  buttons: { flexDirection: 'row', gap: 12 },
  primary: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: '#1565c0', alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: '#eef3fb', alignItems: 'center' },
  secondaryText: { color: '#1565c0', fontWeight: '700', fontSize: 16 },
});
