import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import {
  fetchQuizQuestions, saveUserQuizAnswers, hasUserCompletedQuiz, getPublicCandidateQuizAnswers, getQuizMatches,
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

describe('getQuizMatches — the actual point of the quiz, previously never computed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes a match percentage from agreement between voter and candidate answers', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_quiz_answers') {
        return { select: () => ({ eq: () => Promise.resolve({
          data: [
            { question_id: 'q1', answer: 'a' },
            { question_id: 'q2', answer: 'b' },
            { question_id: 'q3', answer: 'a' },
          ],
          error: null,
        }) }) };
      }
      if (table === 'candidate_quiz_answers') {
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({
          data: [
            { candidate_id: 'cand-1', question_id: 'q1', answer: 'a', candidates: { first_name: 'Jane', last_name: 'Doe', party: 'Independent', photo_url: null } },
            { candidate_id: 'cand-1', question_id: 'q2', answer: 'a', candidates: { first_name: 'Jane', last_name: 'Doe', party: 'Independent', photo_url: null } },
            { candidate_id: 'cand-1', question_id: 'q3', answer: 'a', candidates: { first_name: 'Jane', last_name: 'Doe', party: 'Independent', photo_url: null } },
          ],
          error: null,
        }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getQuizMatches('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].candidate_id).toBe('cand-1');
    expect(result[0].match_percent).toBe(67); // agreed on q1 and q3, disagreed on q2 -> 2/3
    expect(result[0].questions_compared).toBe(3);
  });

  it('excludes a candidate with fewer overlapping questions than minOverlap', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_quiz_answers') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ question_id: 'q1', answer: 'a' }], error: null }) }) };
      }
      if (table === 'candidate_quiz_answers') {
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({
          data: [{ candidate_id: 'cand-1', question_id: 'q1', answer: 'a', candidates: { first_name: 'Jane', last_name: 'Doe', party: null, photo_url: null } }],
          error: null,
        }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    // Only 1 question in common, default minOverlap is 3 -> should be excluded.
    const result = await getQuizMatches('user-1');
    expect(result).toEqual([]);
  });

  it('returns an empty list without querying candidates if the voter has no answers yet', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_quiz_answers') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(`should not query ${table}`);
    });

    const result = await getQuizMatches('user-1');
    expect(result).toEqual([]);
  });

  it('sorts results by match percentage, highest first', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_quiz_answers') {
        return { select: () => ({ eq: () => Promise.resolve({
          data: [{ question_id: 'q1', answer: 'a' }, { question_id: 'q2', answer: 'a' }, { question_id: 'q3', answer: 'a' }],
          error: null,
        }) }) };
      }
      if (table === 'candidate_quiz_answers') {
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({
          data: [
            // cand-low: agrees on 1 of 3
            { candidate_id: 'cand-low', question_id: 'q1', answer: 'a', candidates: { first_name: 'Low', last_name: 'Match', party: null, photo_url: null } },
            { candidate_id: 'cand-low', question_id: 'q2', answer: 'b', candidates: { first_name: 'Low', last_name: 'Match', party: null, photo_url: null } },
            { candidate_id: 'cand-low', question_id: 'q3', answer: 'b', candidates: { first_name: 'Low', last_name: 'Match', party: null, photo_url: null } },
            // cand-high: agrees on 3 of 3
            { candidate_id: 'cand-high', question_id: 'q1', answer: 'a', candidates: { first_name: 'High', last_name: 'Match', party: null, photo_url: null } },
            { candidate_id: 'cand-high', question_id: 'q2', answer: 'a', candidates: { first_name: 'High', last_name: 'Match', party: null, photo_url: null } },
            { candidate_id: 'cand-high', question_id: 'q3', answer: 'a', candidates: { first_name: 'High', last_name: 'Match', party: null, photo_url: null } },
          ],
          error: null,
        }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getQuizMatches('user-1');
    expect(result[0].candidate_id).toBe('cand-high');
    expect(result[0].match_percent).toBe(100);
    expect(result[1].candidate_id).toBe('cand-low');
  });
});
