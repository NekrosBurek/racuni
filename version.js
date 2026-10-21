export const REPO = 'NekrosBurek/racuni';
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/racuni.apk`;

export function isNewer(latest, current) {
  const a = latest.split('.').map(Number), b = (current || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}
