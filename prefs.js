// Small per-device flags (encrypted store, like the sign-in): whether the intro was already shown.
import * as SecureStore from 'expo-secure-store';

const INTRO = 'intro-done';

export const introDone = () => SecureStore.getItemAsync(INTRO).then(v => v === '1', () => false);
export const setIntroDone = done =>
  (done ? SecureStore.setItemAsync(INTRO, '1') : SecureStore.deleteItemAsync(INTRO)).catch(() => {});
