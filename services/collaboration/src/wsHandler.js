// ============================================================
// CollabDocs — WebSocket Room Manager (Yjs Protocol)
// ============================================================
// Manages WebSocket connections, Yjs document sync, and
// awareness (remote cursors). Each document gets a "room"
// with an in-memory Y.Doc and a set of connected clients.
// ============================================================

const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const { schedulePersistence, loadDocument } = require('./persistence');

// Message types (matching y-websocket protocol)
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// In-memory rooms: docId → { ydoc, awareness, conns: Set<ws> }
const rooms = new Map();

// Idle room cleanup timers
const cleanupTimers = new Map();
const ROOM_IDLE_TIMEOUT = 60000; // 60 seconds

/**
 * Get or create a room for a document.
 * Loads persisted state from PostgreSQL on first access.
 * @param {string} docId
 * @param {import('pg').Pool} pg
 * @returns {Promise<{ydoc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Set}>}
 */
async function getOrCreateRoom(docId, pg) {
  // Cancel any pending cleanup
  if (cleanupTimers.has(docId)) {
    clearTimeout(cleanupTimers.get(docId));
    cleanupTimers.delete(docId);
  }

  if (!rooms.has(docId)) {
    const ydoc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(ydoc);

    // Load persisted state from PostgreSQL
    await loadDocument(docId, ydoc, pg);

    rooms.set(docId, { ydoc, awareness, conns: new Set() });
    console.log(`[Room] Created room for document ${docId}`);
  }

  return rooms.get(docId);
}

/**
 * Handle a new WebSocket connection joining a document room.
 * @param {import('ws').WebSocket} ws
 * @param {string} docId
 * @param {import('pg').Pool} pg
 * @param {import('./redisPubSub')} pubsub
 */
async function handleConnection(ws, docId, pg, pubsub) {
  const room = await getOrCreateRoom(docId, pg);
  room.conns.add(ws);

  // Subscribe to Redis Pub/Sub for this document (if not already)
  if (pubsub) {
    await pubsub.subscribe(docId);
  }

  // ── Send initial sync (Step 1) ──
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, room.ydoc);
  ws.send(encoding.toUint8Array(syncEncoder));

  // ── Send current awareness states ──
  const awarenessStates = awarenessProtocol.encodeAwarenessUpdate(
    room.awareness,
    Array.from(room.awareness.getStates().keys())
  );
  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
  encoding.writeVarUint8Array(awarenessEncoder, awarenessStates);
  ws.send(encoding.toUint8Array(awarenessEncoder));

  console.log(`[Room] Client joined ${docId} (${room.conns.size} connected)`);

  // ── Handle incoming messages ──
  ws.on('message', (data) => {
    try {
      const uint8 = new Uint8Array(data);
      const decoder = decoding.createDecoder(uint8);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MSG_SYNC: {
          const syncEncoder = encoding.createEncoder();
          encoding.writeVarUint(syncEncoder, MSG_SYNC);
          const syncMessageType = syncProtocol.readSyncMessage(
            decoder,
            syncEncoder,
            room.ydoc,
            null // transactionOrigin
          );

          // If the encoder has content (sync step 2 response), send it back
          if (encoding.length(syncEncoder) > 1) {
            ws.send(encoding.toUint8Array(syncEncoder));
          }

          // If this was a sync step 2 (update), broadcast and persist
          if (syncMessageType === 2) {
            // Broadcast to other local connections
            broadcastToRoom(room, data, ws);

            // Publish to Redis for cross-instance sync
            if (pubsub) {
              pubsub.publish(docId, uint8);
            }

            // Schedule debounced persistence
            schedulePersistence(docId, room.ydoc, pg);
          }
          break;
        }

        case MSG_AWARENESS: {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws);

          // Broadcast awareness to all other connections
          broadcastToRoom(room, data, ws);

          // Publish awareness to Redis
          if (pubsub) {
            pubsub.publish(docId, uint8);
          }
          break;
        }

        default:
          console.warn(`[Room] Unknown message type: ${messageType}`);
      }
    } catch (err) {
      console.error(`[Room] Error processing message in ${docId}:`, err.message);
    }
  });

  // ── Handle ping/pong for heartbeat ──
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // ── Handle disconnect ──
  ws.on('close', () => {
    room.conns.delete(ws);
    console.log(`[Room] Client left ${docId} (${room.conns.size} remaining)`);

    // Remove awareness state for this client
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [room.ydoc.clientID],
      null
    );

    if (room.conns.size === 0) {
      scheduleRoomCleanup(docId, pg, pubsub);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Room] WebSocket error in ${docId}:`, err.message);
  });
}

/**
 * Broadcast data to all connections in a room except the sender.
 */
function broadcastToRoom(room, data, sender) {
  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  for (const conn of room.conns) {
    if (conn !== sender && conn.readyState === 1) { // WebSocket.OPEN
      conn.send(uint8);
    }
  }
}

/**
 * Schedule room cleanup after all clients disconnect.
 * Gives 60 seconds for reconnection before destroying the room.
 */
function scheduleRoomCleanup(docId, pg, pubsub) {
  if (cleanupTimers.has(docId)) {
    clearTimeout(cleanupTimers.get(docId));
  }

  cleanupTimers.set(docId, setTimeout(async () => {
    const room = rooms.get(docId);
    if (room && room.conns.size === 0) {
      // Final flush to PostgreSQL
      try {
        const snapshot = Y.encodeStateAsUpdate(room.ydoc);
        await pg.query(
          `INSERT INTO documents (doc_id, content_snapshot, last_modified)
           VALUES ($1, $2, NOW())
           ON CONFLICT (doc_id)
           DO UPDATE SET content_snapshot = $2, last_modified = NOW()`,
          [docId, Buffer.from(snapshot)]
        );
        console.log(`[Room] Final flush for ${docId}`);
      } catch (err) {
        console.error(`[Room] Failed to flush ${docId}:`, err.message);
      }

      // Unsubscribe from Redis
      if (pubsub) {
        await pubsub.unsubscribe(docId);
      }

      // Destroy room
      room.ydoc.destroy();
      room.awareness.destroy();
      rooms.delete(docId);
      cleanupTimers.delete(docId);
      console.log(`[Room] Destroyed room ${docId}`);
    }
  }, ROOM_IDLE_TIMEOUT));
}

/**
 * Get the rooms Map (used by persistence.flushAllRooms on SIGTERM).
 */
function getRooms() {
  return rooms;
}

module.exports = { handleConnection, getRooms, rooms };
