// ============================================================
// CollabDocs — Async Click Counter Worker
// ============================================================
// Drains the Redis click queue every 2 seconds and batch-updates
// click_count in PostgreSQL. This keeps redirect latency minimal
// by decoupling analytics from the hot redirect path.
// ============================================================

const QUEUE_KEY = 'queue:clicks';
const DRAIN_INTERVAL_MS = 2000;

/**
 * Start the background click counter worker.
 * @param {import('ioredis').Redis} redis
 * @param {import('pg').Pool} pg
 */
function startClickWorker(redis, pg) {
  console.log('[ClickWorker] Started — draining every 2s');

  const timer = setInterval(async () => {
    try {
      // Drain all pending click events from the queue
      const batch = [];
      let item;
      // Use a pipeline for efficiency
      while ((item = await redis.lpop(QUEUE_KEY)) !== null) {
        batch.push(item);
        // Safety valve: max 1000 items per drain cycle
        if (batch.length >= 1000) break;
      }

      if (batch.length === 0) return;

      // Aggregate clicks per short_code
      const counts = {};
      for (const code of batch) {
        counts[code] = (counts[code] || 0) + 1;
      }

      // Batch update PostgreSQL
      const client = await pg.connect();
      try {
        await client.query('BEGIN');
        for (const [code, count] of Object.entries(counts)) {
          await client.query(
            'UPDATE url_mappings SET click_count = click_count + $1 WHERE short_code = $2',
            [count, code]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[ClickWorker] Batch update failed:', err.message);
      } finally {
        client.release();
      }

      console.log(`[ClickWorker] Processed ${batch.length} clicks for ${Object.keys(counts).length} links`);
    } catch (err) {
      console.error('[ClickWorker] Drain cycle error:', err.message);
    }
  }, DRAIN_INTERVAL_MS);

  // Return cleanup function for graceful shutdown
  return () => clearInterval(timer);
}

/**
 * Push a click event to the Redis queue (non-blocking).
 * @param {import('ioredis').Redis} redis
 * @param {string} shortCode
 */
async function pushClick(redis, shortCode) {
  try {
    await redis.rpush(QUEUE_KEY, shortCode);
  } catch (err) {
    console.warn('[ClickWorker] Failed to queue click:', err.message);
  }
}

module.exports = { startClickWorker, pushClick };
