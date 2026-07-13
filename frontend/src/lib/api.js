// ============================================================
// CollabDocs — REST API Client
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';
const WS_URL = import.meta.env.VITE_COLLAB_WS_URL || 'ws://localhost:3001';
const COLLAB_API_URL = import.meta.env.VITE_COLLAB_API_URL || WS_URL.replace('ws://', 'http://').replace('wss://', 'https://');

/**
 * Fetch all documents.
 */
export async function fetchDocuments() {
  const res = await fetch(`${COLLAB_API_URL}/api/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  const data = await res.json();
  return data.documents;
}

/**
 * Create a new document.
 * @param {string} title
 */
export async function createDocument(title = 'Untitled Document') {
  const res = await fetch(`${COLLAB_API_URL}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to create document');
  return res.json();
}

/**
 * Get a single document's info.
 * @param {string} docId
 */
export async function fetchDocument(docId) {
  const res = await fetch(`${COLLAB_API_URL}/api/documents/${docId}`);
  if (!res.ok) throw new Error('Failed to fetch document');
  return res.json();
}

/**
 * Update a document's title.
 * @param {string} docId
 * @param {string} title
 */
export async function updateDocumentTitle(docId, title) {
  const res = await fetch(`${COLLAB_API_URL}/api/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to update document title');
  return res.json();
}

/**
 * Generate a short link for a document.
 * @param {string} docId
 */
export async function createShortLink(docId) {
  const res = await fetch(`${API_URL}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_id: docId }),
  });
  if (!res.ok) throw new Error('Failed to create short link');
  return res.json();
}

/**
 * Get short link info (click count, etc).
 * @param {string} shortCode
 */
export async function fetchLinkInfo(shortCode) {
  const res = await fetch(`${API_URL}/api/links/${shortCode}`);
  if (!res.ok) throw new Error('Link not found');
  return res.json();
}
