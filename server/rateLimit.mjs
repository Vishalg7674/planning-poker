/**
 * In-memory rate limiting for the socket layer — pure functions over plain
 * data, exactly like server/room.mjs, so unit tests drive them directly
 * (see tests/unit/server/rateLimit.test.ts).
 *
 * Everything here is fixed-window counting, deliberately dependency-free:
 *   - createWindowLimiter  — per-key fixed-window bucket (IP-scoped events)
 *   - makeSocketLimiter    — per-socket fixed-window bucket (vote spam)
 *   - clientIp             — the client's address, honoring TRUST_PROXY
 *
 * A fixed window is good enough for abuse shaping (not billing-grade
 * precision): it bounds requests per minute/second with O(1) bookkeeping and
 * lazy pruning, so it can never become a memory leak or a bottleneck.
 */

/**
 * Create a fixed-window limiter: `limit` uses per `windowMs`, keyed by
 * arbitrary string keys (IPs, socket ids, …).
 * @param {number} limit
 * @param {number} windowMs
 * @returns {{ allow: (key: string, now?: number) => boolean, prune: (now?: number) => void, size: () => number }}
 */
export function createWindowLimiter(limit, windowMs) {
  const buckets = new Map(); // key -> { start, count }
  return {
    /** Consume one use for `key`; true while within the limit, false when over. */
    allow(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b || now - b.start >= windowMs) {
        b = { start: now, count: 0 };
        buckets.set(key, b);
      }
      b.count += 1;
      return b.count <= limit;
    },
    /** Drop entries whose window has fully passed — prevents unbounded growth. */
    prune(now = Date.now()) {
      for (const [key, b] of buckets) {
        if (now - b.start >= windowMs) buckets.delete(key);
      }
    },
    size: () => buckets.size,
  };
}

/**
 * Create a limiter whose bucket lives on the socket itself (`socket.data`),
 * so no global map exists for it to leak into. Call `allow(socket)` per event.
 * @param {number} limit
 * @param {number} windowMs
 * @returns {(socket: { data: Record<string, unknown> }, now?: number) => boolean}
 */
export function makeSocketLimiter(limit, windowMs) {
  return (socket, now = Date.now()) => {
    /** @type {{ start: number, count: number } | undefined} */
    let b = socket.data._rate;
    if (!b || now - b.start >= windowMs) {
      b = { start: now, count: 0 };
      socket.data._rate = b;
    }
    b.count += 1;
    return b.count <= limit;
  };
}

/**
 * The client's address for rate limiting and connection caps. Behind a proxy
 * or load balancer the socket's own address is the LB's — set TRUST_PROXY=1
 * to read the first `X-Forwarded-For` hop instead.
 * @param {{ handshake?: { address?: string, headers?: Record<string, unknown> } }} socket
 * @returns {string}
 */
export function clientIp(socket) {
  const headers = socket.handshake?.headers || {};
  if (process.env.TRUST_PROXY === '1') {
    const fwd = headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  }
  return socket.handshake?.address || 'unknown';
}
