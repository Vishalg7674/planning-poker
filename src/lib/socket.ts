'use client';

import { io, type Socket } from 'socket.io-client';

/**
 * Singleton socket. The RealtimeBridge is the only consumer; UI code uses
 * `emitAck` (a promise wrapper) when it needs an acknowledgement back.
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
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
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
      reject(new Error('Can’t reach the realtime server. Is it running? (npm run rt)'));
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

/**
 * Emit an event with an acknowledgement callback, wrapped in a promise with a
 * timeout so a dead server can't hang the UI.
 */
export function emitAck<T>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return ensureConnected(timeoutMs).then(
    (s) =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server did not respond — try again.')), timeoutMs);
        s.emit(event, payload, (res: T) => {
          clearTimeout(timer);
          resolve(res);
        });
      }),
  );
}
