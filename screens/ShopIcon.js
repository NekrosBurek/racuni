// Store icon: a known chain shows its website's icon, any other shop a colored circle with its initials.
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { shopDomain, initials, shopHue } from '../shops';


export function ShopIcon({ receipt, size = 38, dark }) {
  const domain = shopDomain(receipt);
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
  if (domain && !failed) {
    return (
      <View style={[box, { backgroundColor: '#fff' }]}>
        <Image
          source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=128` }}
          style={{ width: size * 0.7, height: size * 0.7 }}
          onError={() => setFailed(true)}
        />
      </View>
    );
  }
  const h = shopHue(receipt.shop || receipt.name || '?');
  return (
    <View style={[box, { backgroundColor: `hsl(${h}, 55%, ${dark ? 28 : 90}%)` }]}>
      <Text style={{ fontWeight: '700', fontSize: size * 0.38, color: `hsl(${h}, 60%, ${dark ? 80 : 32}%)` }}>
        {initials(receipt.shop || receipt.name)}
      </Text>
    </View>
  );
}
