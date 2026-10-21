const API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function call(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (res.status === 401) throw new Error('Google prijava je istekla. Prijavi se ponovo.');
  if (!res.ok) throw new Error(`Google Drive greška ${res.status}: ${await res.text()}`);
  return res.json();
}

const search = (token, query, fields = 'id,name', extra = '') =>
  call(token, `${API}?fields=files(${fields})&q=${encodeURIComponent(query)}${extra}`).then(r => r.files);

const patch = (token, id, body) => call(token, `${API}/${id}?fields=id,name,appProperties`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Settings live as hidden appProperties on the chosen folder, so nothing is kept on the phone.
export async function findSettings(token) {
  const [f] = await search(token, `appProperties has { key='racuni' and value='folder' } and trashed=false`,
    'id,name,appProperties');
  return f ? { folder: { id: f.id, name: f.name }, nameFormat: f.appProperties.nameFormat } : null;
}

export const listFolders = token =>
  search(token, `mimeType='${FOLDER}' and trashed=false and 'root' in parents`, 'id,name', '&orderBy=name&pageSize=200');

export async function saveSettings(token, { folder, newFolderName, nameFormat }, previousFolderId) {
  if (!folder) {
    folder = await call(token, `${API}?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName, mimeType: FOLDER }),
    });
  }
  if (previousFolderId && previousFolderId !== folder.id) {
    await patch(token, previousFolderId, { appProperties: { racuni: null, nameFormat: null } });
  }
  await patch(token, folder.id, { appProperties: { racuni: 'folder', nameFormat } });
  return { folder: { id: folder.id, name: folder.name }, nameFormat };
}

// Duplicates are matched on a hidden appProperty, so renaming or moving the file doesn't matter.
export async function findReceipt(token, invoiceNumber) {
  const [found] = await search(token,
    `appProperties has { key='invoiceNumber' and value='${q(invoiceNumber)}' } and trashed=false`);
  return found;
}

export const listReceipts = (token, folderId) =>
  search(token, `'${q(folderId)}' in parents and mimeType='application/pdf' and trashed=false`,
    'id,name,webViewLink,appProperties', '&orderBy=createdTime desc&pageSize=500');

export function uploadPdf(token, folderId, name, r, base64) {
  const boundary = 'racuni' + Date.now();
  const meta = {
    name,
    parents: [folderId],
    mimeType: 'application/pdf',
    // Drive caps key+value at 124 bytes, hence the shop slice.
    appProperties: { invoiceNumber: r.invoiceNumber, total: String(r.total), date: isNaN(r.date) ? '' : r.date.toISOString(), shop: r.shop.slice(0, 40) },
  };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n` +
    `--${boundary}--`;
  return call(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}
