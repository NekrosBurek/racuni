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
    'id,name,webViewLink,appProperties,createdTime', '&orderBy=createdTime desc&pageSize=1000');

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

// Moves a receipt to the Drive trash, so a mistaken delete can still be undone from Drive.
export const trashReceipt = (token, id) => patch(token, id, { trashed: true });

export const setReceiptData = (token, id, appProperties) => patch(token, id, { appProperties });

export const mediaUrl = id => `${API}/${id}?alt=media`;

// The PDF's text, extracted by Drive: a temporary Google Docs copy (Drive reads the PDF, with OCR where needed),
// exported as plain text and deleted again.
export async function pdfText(token, id) {
  const doc = await call(token, `${API}/${id}/copy?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'racuni-tmp-ocr', mimeType: 'application/vnd.google-apps.document' }),
  });
  try {
    const res = await fetch(`${API}/${doc.id}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google Drive greška ${res.status}`);
    return await res.text();
  } finally {
    await fetch(`${API}/${doc.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
}

// A CSV (or any text) file in the receipts folder.
export function uploadText(token, folderId, name, mimeType, text) {
  const boundary = 'racuni' + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], mimeType })}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${text}\r\n` +
    `--${boundary}--`;
  return call(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}
