import { describe, expect, it } from 'vitest';
import { friendlyError } from '@/lib/errors';

describe('friendlyError', () => {
  it('translates known server codes into human messages', () => {
    expect(friendlyError('not_host', 'x')).toBe('Only the host can do that.');
    expect(friendlyError('already_voted', 'x')).toBe('Your vote is already locked in.');
    expect(friendlyError('not_all_voted', 'x')).toContain('everyone has voted');
    expect(friendlyError('bad_value', 'x')).toBe('That card isn’t on the table.');
    expect(friendlyError('room_locked', 'x')).toBe('This room is locked by the host.');
    expect(friendlyError('not_found', 'x')).toBe('The room could not be found.');
  });

  it('falls back gracefully for unknown or missing codes', () => {
    expect(friendlyError('weird_code', 'fallback')).toBe('fallback');
    expect(friendlyError(undefined, 'fallback')).toBe('fallback');
  });
});
