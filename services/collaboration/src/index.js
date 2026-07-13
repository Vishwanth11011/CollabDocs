// ============================================================
// CollabDocs — Collaboration Service Entry Point
// ============================================================
// Fastify + WebSocket server for real-time document collaboration.
// Uses Yjs CRDTs for conflict-free concurrent editing,
// Redis Pub/Sub for cross-instance sync, and debounced
// write-behind persistence to PostgreSQL.
// ============================================================

require('dotenv').config();

const Fastify = require('fastify');
const websocket = require('@fastify/websocket');
const cors = require('@fastify/cors');
const { handleConnection, getRooms } = require('./wsHandler');
const { flushAllRooms } = require('./persistence');
const RedisPubSub = require('./redisPubSub');
const pg = require('./db');

const PORT = parseInt(process.env.PORT || process.env.COLLAB_PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const HEARTBEAT_INTERVAL = 30000; // 30-second ping/pong

async function start() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // ── CORS ──
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // ── WebSocket Plugin ──
  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB max message size
      perMessageDeflate: true,
    },
  });

  // ── Redis Pub/Sub ──
  const pubsub = new RedisPubSub(REDIS_URL);
  const rooms = getRooms();
  await pubsub.connect(rooms);

  // ── Health Check ──
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'collaboration',
    activeRooms: rooms.size,
    totalConnections: Array.from(rooms.values()).reduce((sum, r) => sum + r.conns.size, 0),
  }));

  // ── REST API: List active documents ──
  fastify.get('/api/documents', async (request, reply) => {
    try {
      const result = await pg.query(
        `SELECT doc_id, title, created_at, last_modified
         FROM documents
         ORDER BY last_modified DESC
         LIMIT 50`
      );
      return reply.send({ documents: result.rows });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch documents' });
    }
  });

  // ── REST API: Create a new document ──
  fastify.post('/api/documents', async (request, reply) => {
    const { title } = request.body || {};
    try {
      const result = await pg.query(
        `INSERT INTO documents (title) VALUES ($1) RETURNING doc_id, title, created_at`,
        [title || 'Untitled Document']
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to create document' });
    }
  });

  // ── REST API: Get a document's info ──
  fastify.get('/api/documents/:docId', async (request, reply) => {
    const { docId } = request.params;
    try {
      const result = await pg.query(
        'SELECT doc_id, title, created_at, last_modified FROM documents WHERE doc_id = $1',
        [docId]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Document not found' });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to fetch document' });
    }
  });

  // ── REST API: Update document title ──
  fastify.patch('/api/documents/:docId', async (request, reply) => {
    const { docId } = request.params;
    const { title } = request.body || {};
    if (!title) {
      return reply.status(400).send({ error: 'Title is required' });
    }
    try {
      const result = await pg.query(
        'UPDATE documents SET title = $1, last_modified = NOW() WHERE doc_id = $2 RETURNING doc_id, title',
        [title, docId]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Document not found' });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to update document' });
    }
  });

  // ── WebSocket Route ──
  // Clients connect to /ws/:docId to join a collaboration room
  fastify.get('/ws/:docId', { websocket: true }, async (socket, request) => {
    const { docId } = request.params;

    // Validate docId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(docId)) {
      socket.close(4000, 'Invalid document ID format');
      return;
    }

    await handleConnection(socket, docId, pg, pubsub);
  });

  // ── WebSocket Heartbeat ──
  // 30-second ping/pong to prevent load balancer drops
  const heartbeat = setInterval(() => {
    for (const [docId, room] of rooms) {
      for (const conn of room.conns) {
        if (conn.isAlive === false) {
          console.log(`[Heartbeat] Terminating dead connection in ${docId}`);
          conn.terminate();
          room.conns.delete(conn);
          continue;
        }
        conn.isAlive = false;
        conn.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  // ── Graceful Shutdown ──
  const shutdown = async (signal) => {
    console.log(`\n[Collaboration] Received ${signal}. Shutting down gracefully...`);

    clearInterval(heartbeat);

    // Close all WebSocket connections
    for (const [, room] of rooms) {
      for (const conn of room.conns) {
        conn.close(1001, 'Server shutting down');
      }
    }

    // Flush all rooms to PostgreSQL
    await flushAllRooms(rooms, pg);

    // Disconnect Redis
    await pubsub.disconnect();

    // Close Fastify and PostgreSQL
    await fastify.close();
    await pg.end();

    console.log('[Collaboration] Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Start Server ──
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[Collaboration] Listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
