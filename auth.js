// Keeps the Google sign-in between launches: only the refresh token is stored, encrypted by the Android Keystore
// (expo-secure-store); a fresh one-hour access token is fetched from it at start-up and before it expires.
import * as SecureStore from 'expo-secure-store';
import { refreshAsync, revokeAsync } from 'expo-auth-session';
import { discovery } from 'expo-auth-session/providers/google';

const KEY = 'google-refresh-token';

// { accessToken, expiresAt } from an expo-auth-session TokenResponse.
const session = auth => ({ accessToken: auth.accessToken, expiresAt: Date.now() + (auth.expiresIn ?? 3600) * 1000 });

export async function saveLogin(auth) {
  if (auth.refreshToken) await SecureStore.setItemAsync(KEY, auth.refreshToken);
  return session(auth);
}

// A new session from the stored refresh token; null when there is none or Google no longer accepts it.
// Throws on network errors so an offline start doesn't forget the login.
export async function restoreLogin(clientId) {
  let refreshToken;
  try {
    refreshToken = await SecureStore.getItemAsync(KEY);
  } catch {
    await SecureStore.deleteItemAsync(KEY).catch(() => {}); // unreadable after a restore to another phone
    return null;
  }
  if (!refreshToken) return null;
  try {
    const auth = await refreshAsync({ clientId, refreshToken }, discovery);
    if (auth.refreshToken && auth.refreshToken !== refreshToken) await SecureStore.setItemAsync(KEY, auth.refreshToken);
    return session(auth);
  } catch (e) {
    if (/invalid_grant|unauthorized_client|invalid_client/i.test(`${e.code} ${e.message}`)) {
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
    throw e;
  }
}

export async function logout() {
  const refreshToken = await SecureStore.getItemAsync(KEY).catch(() => null);
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
  if (refreshToken) await revokeAsync({ token: refreshToken }, discovery).catch(() => {});
}
