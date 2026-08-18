'use client';

import { io, type Socket } from 'socket.io-client';

/**
 * Singleton socket. The RealtimeBridge is the only long-lived consumer; UI
 * code uses `emitAck` (a promise wrapper) when it needs an acknowledgement
 * back.
 *
 * The socket is a module-level singleton on purpose: navigating between rooms
 * reuses the same connection, so there is never more than one socket
 * (no duplicate connections, no stale channels). It is only torn down by
 * `closeSocket()` (currently unused by the app) or a page unload.
 */
let socket: Socket | null = null;

function socketUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  // Dev default: Next on :3000, realtime server on :3001. Override via env.
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  return 'http://localhost:3001';
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(socketUrl(), {
      // Polling first: a dead server fails a websocket handshake with a loud
      // browser console error on every attempt; polling fails quietly and the
      // client upgrades to websocket automatically after the first successful
      // connection. Same latency once live, far less noise when offline.
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.5,
      timeout: 6000,
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/**
 * Rejoin dedupe: both the room page (cold load) and the RealtimeBridge
 * (socket reconnect) want to rejoin the room. The flag makes sure only one
 * `room:rejoin` is in flight at a time.
 */
let rejoinPending = false;
export function isRejoinPending(): boolean {
  return rejoinPending;
}
export function setRejoinPending(pending: boolean): void {
  rejoinPending = pending;
}

/** Resolves once the socket is actually connected (or rejects after timeout). */
export function ensureConnected(timeoutMs = 7000): Promise<Socket> {
  const s = getSocket();
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off('connect', onConnect);
      s.off('connect_error', onError);
      reject(new Error('Can’t reach the realtime server. Is it running? (npm run dev starts it)'));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      s.off('connect_error', onError);
      resolve(s);
    };
    const onError = () => {
      // Keep waiting — connect_error fires per failed attempt; only give up on timeout.
    };
    s.once('connect', onConnect);
    s.on('connect_error', onError);
  });
}

/** Shape every expected socket failure resolves to. */
export interface SocketFailure {
  ok: false;
  error: 'unreachable' | 'timeout';
}

/**
 * Emit an event with an acknowledgement callback, wrapped in a promise with a
 * timeout so a dead server can't hang the UI.
 *
 * SAFETY: this promise **never rejects**. A server that is unreachable, a
 * socket that drops mid-request, or an ack that never arrives all resolve to
 * an `{ ok: false, error }` failure object instead — so callers handle
 * expected network failures with the same `if (!res?.ok)` branch they already
 * use for server-side rejections, and no `Uncaught (in promise)` can ever
 * escape. Callers should type `T` as an ack shape that carries `ok: boolean`.
 */
export function emitAck<T>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return ensureConnected(timeoutMs)
    .then(
      (s) =>
        new Promise<T>((resolve) => {
          const timer = setTimeout(() => {
            resolve({ ok: false, error: 'timeout' } as T);
          }, timeoutMs);
          try {
            s.emit(event, payload, (res: T) => {
              clearTimeout(timer);
              resolve(res);
            });
          } catch {
            clearTimeout(timer);
            resolve({ ok: false, error: 'unreachable' } as T);
          }
        }),
    )
    .catch(() => ({ ok: false, error: 'unreachable' }) as T);
}
