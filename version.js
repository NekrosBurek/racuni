// CI writes the build's version here (see .github/workflows/build.yml).
export const VERSION = '1.0.0';

export const REPO = 'NekrosBurek/racuni';
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/racuni.apk`;

export function isNewer(latest, current) {
  const a = latest.split('.').map(Number), b = (current || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// Every push to main publishes a GitHub release; returns its version and APK link if it's newer than this build.
export async function findUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return null;
    const release = await res.json();
    const latest = release.tag_name.replace(/^v/, '');
    if (!isNewer(latest, VERSION)) return null;
    const asset = release.assets?.find(a => a.name === 'racuni.apk');
    return { latest, url: asset?.browser_download_url ?? APK_URL };
  } catch {
    return null; // offline or GitHub down: just skip the check
  }
}
