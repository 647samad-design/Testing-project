import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { consumeAnonAiQuestion, anonAiRemaining, ANON_DAILY_LIMIT } from '@/lib/anon-ai-allowance';

describe('signed-out Ask allowance', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it(`allows ${ANON_DAILY_LIMIT} questions a day, then refuses`, () => {
    for (let i = 0; i < ANON_DAILY_LIMIT; i++) expect(consumeAnonAiQuestion()).toBe(true);
    expect(consumeAnonAiQuestion()).toBe(false);
    expect(anonAiRemaining()).toBe(0);
  });

  it('resets the next day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 10));
    for (let i = 0; i < ANON_DAILY_LIMIT; i++) consumeAnonAiQuestion();
    expect(consumeAnonAiQuestion()).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 2, 9));
    expect(anonAiRemaining()).toBe(ANON_DAILY_LIMIT);
    expect(consumeAnonAiQuestion()).toBe(true);
  });

  it('treats a corrupt stored value as a fresh day', () => {
    localStorage.setItem('ballotlens_anon_ai', '{not json');
    expect(anonAiRemaining()).toBe(ANON_DAILY_LIMIT);
  });
});
