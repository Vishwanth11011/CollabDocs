// ============================================================
// CollabDocs — URL Shortener Service Entry Point
// ============================================================
// Fastify-based REST API optimized for read-heavy traffic.
// Layered Redis caching with PostgreSQL persistence.
// ============================================================

require('dotenv').config();

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const Redis = require('ioredis');
const pg = require('./db');
const createRoute = require('./routes/create');
const resolveRoute = require('./routes/resolve');
const { startClickWorker } = require('./clickWorker');

const PORT = parseInt(process.env.PORT || process.env.SHORTENER_PORT || '3002', 10);
const HOST = process.env.HOST || '0.0.0.0';

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

  // ── Redis Connection ──
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
  });

  await redis.connect();
  console.log('[Redis] Connected');

  // ── Health Check ──
  fastify.get('/health', async () => ({ status: 'ok', service: 'shortener' }));

  // ── Register Routes ──
  await createRoute(fastify, { pg, redis });
  await resolveRoute(fastify, { pg, redis });

  // ── Start Click Worker ──
  const stopClickWorker = startClickWorker(redis, pg);

  // ── Graceful Shutdown ──
  const shutdown = async (signal) => {
    console.log(`\n[Shortener] Received ${signal}. Shutting down gracefully...`);
    stopClickWorker();
    await fastify.close();
    await redis.quit();
    await pg.end();
    console.log('[Shortener] Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Start Server ──
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[Shortener] Listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
