// ============================================================
// CollabDocs — POST /api/links — Create Short Link
// ============================================================

const { encode } = require('../base62');
const { warmCache } = require('../cache');

/**
 * Register the create short link route.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ pg: import('pg').Pool, redis: import('ioredis').Redis }} opts
 */
async function createRoute(fastify, { pg, redis }) {
  fastify.post('/api/links', {
    schema: {
      body: {
        type: 'object',
        required: ['doc_id'],
        properties: {
          doc_id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            short_code: { type: 'string' },
            short_url: { type: 'string' },
            doc_id: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { doc_id } = request.body;

    // 1. Verify document exists
    const docResult = await pg.query(
      'SELECT doc_id FROM documents WHERE doc_id = $1',
      [doc_id]
    );

    if (docResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Document not found',
        message: `No document with id ${doc_id}`,
      });
    }

    // 2. Check if a short link already exists for this document
    const existingResult = await pg.query(
      'SELECT short_code FROM url_mappings WHERE doc_id = $1',
      [doc_id]
    );

    if (existingResult.rows.length > 0) {
      const shortCode = existingResult.rows[0].short_code.trim();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return reply.status(200).send({
        short_code: shortCode,
        short_url: `${frontendUrl}/s/${shortCode}`,
        doc_id,
      });
    }

    // 3. Insert a placeholder row to get the auto-generated BIGSERIAL id
    const insertResult = await pg.query(
      `INSERT INTO url_mappings (short_code, doc_id)
       VALUES ('_temp__', $1)
       RETURNING id`,
      [doc_id]
    );

    const numericId = insertResult.rows[0].id;

    // 4. Base62-encode the numeric ID → short_code
    const shortCode = encode(numericId);

    // 5. Update the row with the actual short_code
    await pg.query(
      'UPDATE url_mappings SET short_code = $1 WHERE id = $2',
      [shortCode, numericId]
    );

    // 6. Warm the Redis cache
    await warmCache(redis, shortCode, doc_id);

    // 7. Return the result
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return reply.status(201).send({
      short_code: shortCode,
      short_url: `${frontendUrl}/s/${shortCode}`,
      doc_id,
    });
  });
}

module.exports = createRoute;
