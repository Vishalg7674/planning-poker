import { describe, expect, it } from 'vitest';
import { DEFAULT_WYR_SELECTION, MAX_WYR_QUESTIONS, WYR_QUESTIONS } from '@/lib/wyrQuestions';

describe('WYR question library', () => {
  it('offers a healthy bank of questions, each with both sides', () => {
    expect(WYR_QUESTIONS.length).toBeGreaterThanOrEqual(20);
    for (const q of WYR_QUESTIONS) {
      expect(q.a.trim().length, q.a).toBeGreaterThan(0);
      expect(q.b.trim().length, q.b).toBeGreaterThan(0);
    }
  });

  it('has no duplicate prompts', () => {
    const keys = WYR_QUESTIONS.map((q) => `${q.a}|${q.b}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the default selection fits inside the server cap', () => {
    expect(DEFAULT_WYR_SELECTION.length).toBeGreaterThan(0);
    expect(DEFAULT_WYR_SELECTION.length).toBeLessThanOrEqual(MAX_WYR_QUESTIONS);
    expect(DEFAULT_WYR_SELECTION.every((q) => WYR_QUESTIONS.includes(q))).toBe(true);
  });
});
