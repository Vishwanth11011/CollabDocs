// ============================================================
// CollabDocs — Redis Pub/Sub for Cross-Instance Sync
// ============================================================
// Enables horizontal scaling by relaying Yjs diffs between
// multiple collaboration server instances via Redis channels.
// Uses two Redis connections: one for subscribe (blocking mode),
// one for publish.
// ============================================================

const Redis = require('ioredis');

const CHANNEL_PREFIX = 'doc:';

class RedisPubSub {
  constructor(redisUrl) {
    this.redisUrl = redisUrl;
    this.subscriber = null;
    this.publisher = null;
    this.rooms = null;
    this.serverId = `server-${process.pid}-${Date.now()}`;
  }

  /**
   * Initialize the pub/sub connections.
   * @param {Map} rooms - Reference to the rooms map from wsHandler
   */
  async connect(rooms) {
    this.rooms = rooms;

    this.subscriber = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null, // Required for subscribe mode
      lazyConnect: true,
    });

    this.publisher = new Redis(this.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await Promise.all([
      this.subscriber.connect(),
      this.publisher.connect(),
    ]);

    // Handle incoming messages on subscribed channels
    this.subscriber.on('messageBuffer', (channelBuf, messageBuf) => {
      const channel = channelBuf.toString();
      const docId = channel.replace(CHANNEL_PREFIX, '');
      const room = this.rooms.get(docId);
      if (!room) return;

      // Parse the envelope to check if this message originated from us
      try {
        // First byte is a flag: 0 = sync message, 1 = awareness message
        const data = new Uint8Array(messageBuf);
        const senderIdLen = data[0];
        const senderId = Buffer.from(data.slice(1, 1 + senderIdLen)).toString();

        // Skip messages we published ourselves
        if (senderId === this.serverId) return;

        const payload = data.slice(1 + senderIdLen);

        // Relay to all local connections in this room
        for (const conn of room.conns) {
          if (conn.readyState === 1) { // WebSocket.OPEN
            conn.send(payload);
          }
        }
      } catch (err) {
        console.error('[PubSub] Error processing message:', err.message);
      }
    });

    console.log(`[PubSub] Connected (serverId: ${this.serverId})`);
  }

  /**
   * Subscribe to a document channel.
   * @param {string} docId
   */
  async subscribe(docId) {
    const channel = `${CHANNEL_PREFIX}${docId}`;
    await this.subscriber.subscribe(channel);
    console.log(`[PubSub] Subscribed to ${channel}`);
  }

  /**
   * Unsubscribe from a document channel.
   * @param {string} docId
   */
  async unsubscribe(docId) {
    const channel = `${CHANNEL_PREFIX}${docId}`;
    await this.subscriber.unsubscribe(channel);
    console.log(`[PubSub] Unsubscribed from ${channel}`);
  }

  /**
   * Publish a Yjs diff to a document channel.
   * The message is enveloped with the server ID to prevent echo.
   * @param {string} docId
   * @param {Uint8Array} data - Raw Yjs update/sync/awareness bytes
   */
  async publish(docId, data) {
    const channel = `${CHANNEL_PREFIX}${docId}`;
    const serverIdBuf = Buffer.from(this.serverId);

    // Envelope: [senderIdLen (1 byte)] [senderId] [payload]
    const envelope = Buffer.alloc(1 + serverIdBuf.length + data.length);
    envelope[0] = serverIdBuf.length;
    serverIdBuf.copy(envelope, 1);
    Buffer.from(data).copy(envelope, 1 + serverIdBuf.length);

    await this.publisher.publish(channel, envelope);
  }

  /**
   * Gracefully disconnect both Redis connections.
   */
  async disconnect() {
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    console.log('[PubSub] Disconnected');
  }
}

module.exports = RedisPubSub;
