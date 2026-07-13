// ============================================================
// CollabDocs — Yjs Provider Setup
// ============================================================
// Manages Yjs document instances and WebSocket providers.
// y-websocket has built-in offline support:
//   - Queues updates when disconnected
//   - Automatically syncs full state on reconnect
//   - CRDT guarantees convergence regardless of order
// ============================================================

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const WS_URL = import.meta.env.VITE_COLLAB_WS_URL || 'ws://localhost:3001/ws';

/**
 * Create a Yjs document and WebSocket provider for a room.
 * @param {string} docId - UUID of the document
 * @returns {{ ydoc: Y.Doc, provider: WebsocketProvider, ytext: Y.Text }}
 */
export function createCollaborationProvider(docId) {
  const ydoc = new Y.Doc();

  // Connect to the collaboration service WebSocket
  const provider = new WebsocketProvider(WS_URL, docId, ydoc, {
    // Connection options
    connect: true,
    // Reconnect with exponential backoff
    resyncInterval: 3000,
    // Maximum reconnect wait time
    maxBackoffTime: 10000,
  });

  // Get the shared text type for the editor
  const ytext = ydoc.getText('document');

  // Connection status logging
  provider.on('status', ({ status }) => {
    console.log(`[Yjs] WebSocket status: ${status} (doc: ${docId})`);
  });

  provider.on('sync', (isSynced) => {
    console.log(`[Yjs] Sync status: ${isSynced ? 'synced' : 'syncing'} (doc: ${docId})`);
  });

  return { ydoc, provider, ytext };
}

/**
 * Generate a random color for user awareness (cursor color).
 * Uses HSL with high saturation for vibrant colors.
 */
export function getRandomUserColor() {
  const colors = [
    '#6366f1', // Indigo
    '#22d3ee', // Cyan
    '#f472b6', // Pink
    '#34d399', // Emerald
    '#fbbf24', // Amber
    '#a78bfa', // Violet
    '#fb923c', // Orange
    '#38bdf8', // Sky
    '#f87171', // Red
    '#4ade80', // Green
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Generate a random username for anonymous users.
 */
export function getRandomUsername() {
  const adjectives = ['Swift', 'Bright', 'Cosmic', 'Electric', 'Quantum', 'Stellar', 'Rapid', 'Crystal'];
  const nouns = ['Fox', 'Eagle', 'Phoenix', 'Falcon', 'Dragon', 'Tiger', 'Panda', 'Wolf'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

/**
 * Retrieve the current user's identity from localStorage.
 */
export function getUserIdentity() {
  try {
    const saved = localStorage.getItem('collabdocs_user');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to parse user identity', e);
  }
  return { name: 'Anonymous', color: getRandomUserColor() };
}
