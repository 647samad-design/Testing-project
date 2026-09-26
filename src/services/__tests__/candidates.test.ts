import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));
vi.mock('@/services/demo-data', () => ({ demoCandidates: [] }));
vi.mock('@/services/elections', () => ({ getStoredRegion: () => null }));

import { getCandidateContestIds } from '@/services/candidates';

describe('getCandidateContestIds — powers the Compare tool\'s same-race filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups contest ids by candidate', async () => {
    fromMock.mockReturnValue({ select: () => ({ in: () => Promise.resolve({
      data: [
        { candidate_id: 'cand-1', contest_id: 'contest-a' },
        { candidate_id: 'cand-2', contest_id: 'contest-a' },
        { candidate_id: 'cand-3', contest_id: 'contest-b' },
      ],
      error: null,
    }) }) });

    const result = await getCandidateContestIds(['cand-1', 'cand-2', 'cand-3']);

    expect(result['cand-1']).toEqual(['contest-a']);
    expect(result['cand-2']).toEqual(['contest-a']);
    expect(result['cand-3']).toEqual(['contest-b']);
  });

  it('returns an empty object without querying for an empty candidate list', async () => {
    const result = await getCandidateContestIds([]);
    expect(result).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns an empty object on a query error rather than throwing', async () => {
    fromMock.mockReturnValue({ select: () => ({ in: () => Promise.resolve({ data: null, error: new Error('boom') }) }) });
    const result = await getCandidateContestIds(['cand-1']);
    expect(result).toEqual({});
  });
});
