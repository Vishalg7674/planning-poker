import { describe, expect, it } from 'vitest';
import { DEFAULT_MLT_SELECTION, MAX_MLT_PROMPTS, MLT_PROMPTS } from '@/lib/mltPrompts';

describe('MLT prompt bank', () => {
  it('provides a healthy bank of unique, non-empty prompts', () => {
    expect(MLT_PROMPTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(MLT_PROMPTS).size).toBe(MLT_PROMPTS.length);
    for (const p of MLT_PROMPTS) {
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it('caps a session at 12 prompts', () => {
    expect(MAX_MLT_PROMPTS).toBe(12);
  });

  it('defaults to a curated 8-prompt selection from the bank', () => {
    expect(DEFAULT_MLT_SELECTION).toHaveLength(8);
    for (const p of DEFAULT_MLT_SELECTION) {
      expect(MLT_PROMPTS).toContain(p);
    }
  });
});
