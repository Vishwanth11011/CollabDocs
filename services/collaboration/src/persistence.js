// ============================================================
// CollabDocs — Write-Behind Persistence Layer
// ============================================================
// Debounced persistence: waits for 5 seconds of inactivity
// before flushing the Yjs state to PostgreSQL. This prevents
// the database from choking under high concurrent edit loads.
// ============================================================

const Y = require('yjs');

const DEBOUNCE_MS = 5000; // 5-second quiet period
const timers = new Map();

/**
 * Schedule a debounced persistence write for a document.
 * If more edits arrive within 5 seconds, the timer resets.
 * @param {string} docId
 * @param {Y.Doc} ydoc
 * @param {import('pg').Pool} pg
 */
function schedulePersistence(docId, ydoc, pg) {
  // Reset existing timer if present
  if (timers.has(docId)) {
    clearTimeout(timers.get(docId));
  }

  timers.set(docId, setTimeout(async () => {
    try {
      const snapshot = Y.encodeStateAsUpdate(ydoc);
      await pg.query(
        `INSERT INTO documents (doc_id, content_snapshot, last_modified)
         VALUES ($1, $2, NOW())
         ON CONFLICT (doc_id)
         DO UPDATE SET content_snapshot = $2, last_modified = NOW()`,
        [docId, Buffer.from(snapshot)]
      );
      console.log(`[Persistence] Saved document ${docId} (${snapshot.byteLength} bytes)`);
    } catch (err) {
      console.error(`[Persistence] Failed to save document ${docId}:`, err.message);
    } finally {
      timers.delete(docId);
    }
  }, DEBOUNCE_MS));
}

/**
 * Load a document's state from PostgreSQL into a Y.Doc.
 * @param {string} docId
 * @param {Y.Doc} ydoc
 * @param {import('pg').Pool} pg
 * @returns {Promise<boolean>} Whether a snapshot was loaded
 */
async function loadDocument(docId, ydoc, pg) {
  try {
    const result = await pg.query(
      'SELECT content_snapshot FROM documents WHERE doc_id = $1',
      [docId]
    );

    if (result.rows.length > 0 && result.rows[0].content_snapshot) {
      const snapshot = new Uint8Array(result.rows[0].content_snapshot);
      Y.applyUpdate(ydoc, snapshot);
      console.log(`[Persistence] Loaded document ${docId} (${snapshot.byteLength} bytes)`);
      return true;
    }

    // Document doesn't exist in DB — create it
    await pg.query(
      `INSERT INTO documents (doc_id, title)
       VALUES ($1, 'Untitled Document')
       ON CONFLICT (doc_id) DO NOTHING`,
      [docId]
    );
    console.log(`[Persistence] Created new document ${docId}`);
    return false;
  } catch (err) {
    console.error(`[Persistence] Failed to load document ${docId}:`, err.message);
    return false;
  }
}

/**
 * Flush all active rooms to PostgreSQL. Called on SIGTERM.
 * @param {Map} rooms - Map of docId → { ydoc, conns }
 * @param {import('pg').Pool} pg
 */
async function flushAllRooms(rooms, pg) {
  console.log(`[Persistence] Flushing ${rooms.size} active rooms...`);

  // Cancel all pending debounce timers
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();

  const promises = [];
  for (const [docId, room] of rooms) {
    const snapshot = Y.encodeStateAsUpdate(room.ydoc);
    promises.push(
      pg.query(
        `INSERT INTO documents (doc_id, content_snapshot, last_modified)
         VALUES ($1, $2, NOW())
         ON CONFLICT (doc_id)
         DO UPDATE SET content_snapshot = $2, last_modified = NOW()`,
        [docId, Buffer.from(snapshot)]
      ).then(() => {
        console.log(`[Persistence] Flushed ${docId} (${snapshot.byteLength} bytes)`);
      }).catch((err) => {
        console.error(`[Persistence] Failed to flush ${docId}:`, err.message);
      })
    );
  }

  await Promise.allSettled(promises);
  console.log('[Persistence] All rooms flushed.');
}

module.exports = { schedulePersistence, loadDocument, flushAllRooms };
