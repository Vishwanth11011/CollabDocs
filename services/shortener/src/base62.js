// ============================================================
// CollabDocs — Base62 Encoding/Decoding
// ============================================================
// Converts numeric IDs to 7-character alphanumeric short codes.
// Using BIGSERIAL as input guarantees zero collisions.
// 62^7 = 3,521,614,606,208 (~3.5 trillion) unique codes.
// ============================================================

const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BASE = BigInt(CHARSET.length); // 62n
const CODE_LENGTH = 7;

/**
 * Encode a numeric ID into a Base62 string, padded to 7 characters.
 * @param {number|bigint} num - The numeric ID to encode.
 * @returns {string} A 7-character Base62 string.
 */
function encode(num) {
  let n = BigInt(num);
  if (n === 0n) return CHARSET[0].padStart(CODE_LENGTH, CHARSET[0]);

  let encoded = '';
  while (n > 0n) {
    encoded = CHARSET[Number(n % BASE)] + encoded;
    n = n / BASE;
  }

  return encoded.padStart(CODE_LENGTH, CHARSET[0]);
}

/**
 * Decode a Base62 string back to a numeric value.
 * @param {string} str - The Base62 string to decode.
 * @returns {bigint} The decoded numeric value.
 */
function decode(str) {
  let num = 0n;
  for (const char of str) {
    const idx = CHARSET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid Base62 character: ${char}`);
    num = num * BASE + BigInt(idx);
  }
  return num;
}

module.exports = { encode, decode };
