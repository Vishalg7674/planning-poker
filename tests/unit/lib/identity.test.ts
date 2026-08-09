import { beforeEach, describe, expect, it } from 'vitest';
import { clearIdentity, loadIdentity, saveIdentity } from '@/lib/identity';

describe('identity (sessionStorage-backed)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(loadIdentity()).toBeNull();
  });

  it('round-trips a saved identity', () => {
    saveIdentity({ participantId: 'abc', name: 'Ada', role: 'facilitator' });
    expect(loadIdentity()).toEqual({ participantId: 'abc', name: 'Ada', role: 'facilitator' });
  });

  it('returns null for corrupt JSON', () => {
    window.sessionStorage.setItem('reveal:identity', '{not json');
    expect(loadIdentity()).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    window.sessionStorage.setItem('reveal:identity', JSON.stringify({ name: 'no id' }));
    expect(loadIdentity()).toBeNull();
  });

  it('clearIdentity removes the stored identity', () => {
    saveIdentity({ participantId: 'abc', name: 'Ada', role: 'facilitator' });
    clearIdentity();
    expect(loadIdentity()).toBeNull();
  });
});
