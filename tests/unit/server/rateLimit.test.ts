import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWindowLimiter, makeSocketLimiter, clientIp } from '../../../server/rateLimit.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createWindowLimiter', () => {
  it('allows up to the limit within a window', () => {
    const lim = createWindowLimiter(3, 1000);
    expect(lim.allow('a', 0)).toBe(true);
    expect(lim.allow('a', 100)).toBe(true);
    expect(lim.allow('a', 200)).toBe(true);
    expect(lim.allow('a', 300)).toBe(false); // over limit inside the window
  });

  it('keys are independent', () => {
    const lim = createWindowLimiter(1, 1000);
    expect(lim.allow('a', 0)).toBe(true);
    expect(lim.allow('b', 0)).toBe(true);
    expect(lim.allow('a', 0)).toBe(false);
  });

  it('resets after the window passes', () => {
    const lim = createWindowLimiter(1, 1000);
    expect(lim.allow('a', 0)).toBe(true);
    expect(lim.allow('a', 500)).toBe(false);
    expect(lim.allow('a', 1001)).toBe(true); // fresh window
  });

  it('prune removes only stale keys', () => {
    const lim = createWindowLimiter(2, 1000);
    lim.allow('a', 0);
    lim.allow('b', 0);
    expect(lim.size()).toBe(2);
    lim.prune(2000);
    expect(lim.size()).toBe(0);
    // a key used again after pruning starts a fresh window
    expect(lim.allow('a', 2500)).toBe(true);
  });
});

describe('makeSocketLimiter', () => {
  it('tracks a fixed window per socket without a global map', () => {
    const lim = makeSocketLimiter(2, 1000);
    const s: { data: Record<string, unknown> } = { data: {} };
    expect(lim(s, 0)).toBe(true);
    expect(lim(s, 100)).toBe(true);
    expect(lim(s, 200)).toBe(false);
    expect(lim(s, 1001)).toBe(true); // window rolled over
  });

  it('buckets are isolated per socket', () => {
    const lim = makeSocketLimiter(1, 1000);
    const a = { data: {} };
    const b = { data: {} };
    expect(lim(a, 0)).toBe(true);
    expect(lim(a, 0)).toBe(false);
    expect(lim(b, 0)).toBe(true);
  });
});

describe('clientIp', () => {
  const socket = (headers: Record<string, unknown> = {}) => ({
    handshake: { address: '1.2.3.4', headers },
  });

  it('falls back to the socket address', () => {
    expect(clientIp(socket())).toBe('1.2.3.4');
  });

  it('reads the first X-Forwarded-For hop when TRUST_PROXY is set', () => {
    vi.stubEnv('TRUST_PROXY', '1');
    expect(clientIp(socket({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }))).toBe('9.9.9.9');
  });

  it('ignores x-forwarded-for unless TRUST_PROXY is set', () => {
    expect(clientIp(socket({ 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
  });

  it('defaults to unknown when there is no address', () => {
    expect(clientIp({ handshake: { headers: {} } })).toBe('unknown');
  });
});
