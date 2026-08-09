import type { Identity } from './types';

const KEY = 'reveal:identity';

export function loadIdentity(): Identity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Identity;
    if (!parsed.participantId || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: Identity) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, JSON.stringify(identity));
}

export function clearIdentity() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KEY);
}
