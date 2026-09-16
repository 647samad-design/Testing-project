import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import {
  fetchQuizQuestions, saveUserQuizAnswers, hasUserCompletedQuiz, getPublicCandidateQuizAnswers,
} from '@/services/quiz';

describe('fetchQuizQuestions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns at most `count` questions even if more are active', async () => {
    const thirtyQuestions = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, sort_order: i }));
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: thirtyQuestions, error: null }) }) }),
    });

    const result = await fetchQuizQuestions(8);
    expect(result).toHaveLength(8);
  });

  it('returns an empty array on a query error instead of throwing', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: new Error('boom') }) }) }),
    });
    const result = await fetchQuizQuestions();
    expect(result).toEqual([]);
  });
});

describe('saveUserQuizAnswers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts on (user_id, question_id) so retaking the quiz updates, not duplicates', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert: upsertMock });

    const result = await saveUserQuizAnswers('user-1', [{ question_id: 'q1', answer: 'a' }]);

    expect(result.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      [{ user_id: 'user-1', question_id: 'q1', answer: 'a', quiz_session: 'default' }],
      { onConflict: 'user_id,question_id' }
    );
  });

  it('surfaces the error message on failure', async () => {
    fromMock.mockReturnValue({ upsert: () => Promise.resolve({ error: new Error('db down') }) });
    const result = await saveUserQuizAnswers('user-1', [{ question_id: 'q1', answer: 'a' }]);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});

describe('hasUserCompletedQuiz', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is true at exactly the 6-answer threshold', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => Promise.resolve({ count: 6, error: null }) }) });
    expect(await hasUserCompletedQuiz('user-1')).toBe(true);
  });

  it('is false one below the threshold', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => Promise.resolve({ count: 5, error: null }) }) });
    expect(await hasUserCompletedQuiz('user-1')).toBe(false);
  });

  it('is false (not throwing) on a query error', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => Promise.resolve({ count: null, error: new Error('boom') }) }) });
    expect(await hasUserCompletedQuiz('user-1')).toBe(false);
  });
});

describe('getPublicCandidateQuizAnswers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only returns approved answers, keyed by question_id', async () => {
    const eqStatusMock = vi.fn().mockResolvedValue({
      data: [{ question_id: 'q1', answer: 'b' }],
      error: null,
    });
    const eqCandidateMock = vi.fn(() => ({ eq: eqStatusMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqCandidateMock }) });

    const result = await getPublicCandidateQuizAnswers('cand-1');

    expect(eqCandidateMock).toHaveBeenCalledWith('candidate_id', 'cand-1');
    expect(eqStatusMock).toHaveBeenCalledWith('status', 'approved');
    expect(result).toEqual({ q1: 'b' });
  });
});
