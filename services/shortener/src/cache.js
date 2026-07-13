// ============================================================
// CollabDocs — Redis Cache-Aside Logic
// ============================================================
// Pattern: Check Redis first → on miss, query PostgreSQL →
// write result to Redis with 24h TTL → return.
// This ensures sub-millisecond reads for cached entries and
// high availability even during PostgreSQL outages.
// ============================================================

const CACHE_TTL = 86400; // 24 hours in seconds
const CACHE_PREFIX = 'url:';

/**
 * Get a URL mapping, checking Redis cache first.
 * @param {import('ioredis').Redis} redis
 * @param {import('pg').Pool} pg
 * @param {string} shortCode
 * @returns {Promise<{doc_id: string}|null>}
 */
async function getMapping(redis, pg, shortCode) {
  const cacheKey = `${CACHE_PREFIX}${shortCode}`;

  // 1. Check Redis first (sub-ms latency)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // Redis down — fall through to PostgreSQL
    console.warn('[Cache] Redis read failed, falling back to DB:', err.message);
  }

  // 2. Cache miss → query PostgreSQL
  const result = await pg.query(
    'SELECT doc_id FROM url_mappings WHERE short_code = $1',
    [shortCode]
  );

  if (result.rows.length === 0) return null;

  const mapping = result.rows[0];

  // 3. Write to Redis with TTL (best effort — don't block on failure)
  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(mapping));
  } catch (err) {
    console.warn('[Cache] Redis write failed:', err.message);
  }

  return mapping;
}

/**
 * Warm the cache after creating a new mapping.
 * @param {import('ioredis').Redis} redis
 * @param {string} shortCode
 * @param {string} docId
 */
async function warmCache(redis, shortCode, docId) {
  const cacheKey = `${CACHE_PREFIX}${shortCode}`;
  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify({ doc_id: docId }));
  } catch (err) {
    console.warn('[Cache] Cache warm failed:', err.message);
  }
}

module.exports = { getMapping, warmCache };
