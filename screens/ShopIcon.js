// Store icon: the shop's website icon (known chain, or a site guessed from its name), otherwise a colored circle
// with its initials. The icon service answers 404 when a site has no icon, which moves on to the next guess.
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { shopDomains, initials, shopHue } from '../shops';


export function ShopIcon({ receipt, size = 38, dark }) {
  const domains = shopDomains(receipt);
  const [attempt, setAttempt] = useState(0);
  const domain = domains[attempt];
  const box = { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
  if (domain) {
    return (
      <View style={[box, { backgroundColor: '#fff' }]}>
        <Image
          source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=128` }}
          style={{ width: size * 0.7, height: size * 0.7 }}
          onError={() => setAttempt(a => a + 1)}
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
