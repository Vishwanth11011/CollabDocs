// ============================================================
// CollabDocs — GET /s/:code — Resolve Short Link
// ============================================================
// Returns HTTP 302 redirect to the collaborative editor.
// Click counting is pushed to a Redis queue for async processing.
// ============================================================

const { getMapping } = require('../cache');
const { pushClick } = require('../clickWorker');

/**
 * Register the resolve short link route.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ pg: import('pg').Pool, redis: import('ioredis').Redis }} opts
 */
async function resolveRoute(fastify, { pg, redis }) {
  fastify.get('/s/:code', {
    schema: {
      params: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const { code } = request.params;

    // 1. Look up the mapping (cache-aside: Redis → PostgreSQL)
    const mapping = await getMapping(redis, pg, code);

    if (!mapping) {
      return reply.status(404).send({
        error: 'Short link not found',
        message: `No mapping found for code: ${code}`,
      });
    }

    // 2. Push async click event (non-blocking)
    pushClick(redis, code);

    // 3. HTTP 302 redirect to the editor
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return reply.redirect(`${frontendUrl}/editor/${mapping.doc_id}`);
  });

  // Also expose a JSON API for fetching link info without redirect
  fastify.get('/api/links/:code', {
    schema: {
      params: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const { code } = request.params;

    const result = await pg.query(
      'SELECT short_code, doc_id, click_count, created_at FROM url_mappings WHERE short_code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Link not found' });
    }

    const row = result.rows[0];
    return reply.send({
      short_code: row.short_code.trim(),
      doc_id: row.doc_id,
      click_count: parseInt(row.click_count, 10),
      created_at: row.created_at,
    });
  });
}

module.exports = resolveRoute;
