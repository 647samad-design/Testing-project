import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock, rpcMock, invokeMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock }, rpc: rpcMock, functions: { invoke: invokeMock } },
}));

import { isFollowing, getFollowingIds, getFollowedCandidates, getFollowedIssues, getFollowerCount, getNotifications, markAllNotificationsRead, follow, createFeedPost, inviteTeamMember, answerQuestion, rateQuestion } from '@/services/social';

describe('createFeedPost — author attribution (was always NULL, breaking own-post delete)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets author_user_id to the current user so they can edit/delete their own post later', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const insertMock = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'post-1' }, error: null }) }) }));
    fromMock.mockReturnValue({ insert: insertMock });

    await createFeedPost('cand-1', 'Big rally this weekend!');

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ author_user_id: 'user-1', candidate_id: 'cand-1' }));
  });
});

describe('follow — free-tier candidate watchlist limit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces a friendly upgrade message when the 5-candidate cap RLS check fails', async () => {
    fromMock.mockReturnValue({ insert: () => Promise.resolve({ error: { code: '42501', message: 'new row violates row-level security policy' } }) });

    await expect(follow('candidate', 'cand-6')).rejects.toThrow(/Upgrade to Candidate or Pro/);
  });

  it('does not apply the friendly message to issue follows (no cap on issues)', async () => {
    fromMock.mockReturnValue({ insert: () => Promise.resolve({ error: { code: '42501', message: 'new row violates row-level security policy' } }) });

    await expect(follow('issue', 'issue-1')).rejects.toThrow('new row violates row-level security policy');
  });

  it('passes through unrelated errors unchanged', async () => {
    fromMock.mockReturnValue({ insert: () => Promise.resolve({ error: { code: '23505', message: 'duplicate key' } }) });

    await expect(follow('candidate', 'cand-1')).rejects.toThrow('duplicate key');
  });
});

describe('isFollowing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always filters by the current user, never relying on RLS alone', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const eqTypeMock = vi.fn().mockReturnThis();
    const eqIdMock = vi.fn();
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { id: 'f1' }, error: null });

    fromMock.mockReturnValue({
      select: () => ({
        eq: (col: string, val: string) => {
          if (col === 'user_id') { expect(val).toBe('user-1'); return { eq: eqTypeMock }; }
          return { eq: eqIdMock };
        },
      }),
    });
    eqTypeMock.mockReturnValue({ eq: () => ({ maybeSingle: maybeSingleMock }) });

    const result = await isFollowing('candidate', 'cand-1');
    expect(result).toBe(true);
  });

  it('returns false without querying anything if nobody is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await isFollowing('candidate', 'cand-1');
    expect(result).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getFollowingIds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by the current user id', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const eqTypeMock = vi.fn().mockResolvedValue({ data: [{ followable_id: 'cand-1' }], error: null });
    const eqUserMock = vi.fn(() => ({ eq: eqTypeMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqUserMock }) });

    const result = await getFollowingIds('candidate');

    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual(['cand-1']);
  });

  it('returns an empty list if nobody is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await getFollowingIds('candidate');
    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getFollowedCandidates / getFollowedIssues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getFollowedCandidates scopes to the current user and merges candidate data without an embedded join', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const followsEqUser = vi.fn();
    const followsEqType = vi.fn();
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ id: 'f1', user_id: 'user-1', followable_type: 'candidate', followable_id: 'cand-1' }],
      error: null,
    });
    const inMock = vi.fn().mockResolvedValue({ data: [{ id: 'cand-1', first_name: 'Jane', last_name: 'Doe' }], error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'follows') {
        return { select: () => ({ eq: (col: string, val: string) => {
          if (col === 'user_id') { followsEqUser(val); return { eq: (c2: string, v2: string) => { followsEqType(v2); return { order: orderMock }; } }; }
          throw new Error('unexpected column');
        } }) };
      }
      if (table === 'candidates') {
        return { select: () => ({ in: inMock }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getFollowedCandidates();

    expect(followsEqUser).toHaveBeenCalledWith('user-1');
    expect(followsEqType).toHaveBeenCalledWith('candidate');
    expect(inMock).toHaveBeenCalledWith('id', ['cand-1']);
    expect(result[0].candidate?.first_name).toBe('Jane');
  });

  it('getFollowedIssues returns an empty list without a signed-in user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await getFollowedIssues();
    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getFollowerCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('goes through the count-only RPC rather than a direct table count (rows are private, counts are public)', async () => {
    rpcMock.mockResolvedValue({ data: 42, error: null });

    const result = await getFollowerCount('candidate', 'cand-1');

    expect(rpcMock).toHaveBeenCalledWith('get_follow_count', { p_followable_type: 'candidate', p_followable_id: 'cand-1' });
    expect(result).toBe(42);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 0 instead of throwing on an RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    const result = await getFollowerCount('candidate', 'cand-1');
    expect(result).toBe(0);
  });
});

describe('getNotifications / markAllNotificationsRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getNotifications filters by the current user id explicitly', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderMock = vi.fn(() => ({ limit: limitMock }));
    const eqUserMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqUserMock }) });

    await getNotifications();

    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('getNotifications returns [] without querying if nobody is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await getNotifications();
    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('markAllNotificationsRead scopes the update to the current user, not every user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const neqMock = vi.fn().mockResolvedValue({ error: null });
    const eqUserMock = vi.fn(() => ({ neq: neqMock }));
    const updateMock = vi.fn(() => ({ eq: eqUserMock }));
    fromMock.mockReturnValue({ update: updateMock });

    await markAllNotificationsRead();

    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('inviteTeamMember — the actual point of the $299 Management team feature', () => {
  beforeEach(() => vi.clearAllMocks());

  it('goes through the invite_team_member RPC rather than a direct table insert, and notifies the invitee immediately when they already have an account', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'row-1', linked_immediately: true, user_id: 'existing-user-1' }, error: null });
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });

    const result = await inviteTeamMember('cand-1', 'staffer@example.com', 'campaign_manager');

    expect(rpcMock).toHaveBeenCalledWith('invite_team_member', {
      p_candidate_id: 'cand-1', p_email: 'staffer@example.com', p_role: 'campaign_manager',
    });
    expect(invokeMock).toHaveBeenCalledWith('send-team-invite-notification', expect.objectContaining({
      body: { candidateId: 'cand-1', userId: 'existing-user-1', role: 'campaign_manager' },
    }));
    expect(result).toEqual({ linkedImmediately: true });
  });

  it('reports linkedImmediately: false and does not try to notify anyone when the invitee has no account yet', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'row-2', linked_immediately: false, user_id: null }, error: null });

    const result = await inviteTeamMember('cand-1', 'newcomer@example.com', 'volunteer');

    expect(result).toEqual({ linkedImmediately: false });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('throws if the RPC rejects (e.g. caller is not authorized for this candidate)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('Not authorized to invite team members for this candidate') });
    await expect(inviteTeamMember('cand-1', 'x@example.com', 'volunteer')).rejects.toThrow('Not authorized');
  });
});

describe('answerQuestion — goes through the authority-checked RPC, not a direct UPDATE', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls answer_voter_question and never updates voter_questions directly', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await answerQuestion('q-1', 'Here is my plan');
    expect(rpcMock).toHaveBeenCalledWith('answer_voter_question', { p_question_id: 'q-1', p_answer: 'Here is my plan' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('surfaces the database error when the caller is not allowed to answer', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('Not authorized to answer questions for this candidate') });
    await expect(answerQuestion('q-1', 'fake')).rejects.toThrow('Not authorized');
  });
});

describe('rateQuestion — insert-only (ON CONFLICT DO NOTHING); there is no UPDATE policy on ratings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts with ignoreDuplicates so a second click does not need UPDATE permission', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert: upsertMock });
    await rateQuestion('q-1', 'helpful', true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ question_id: 'q-1', rating_type: 'helpful' }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it('throws instead of silently swallowing a failed rating', async () => {
    fromMock.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: new Error('boom') }) });
    await expect(rateQuestion('q-1', 'helpful', true)).rejects.toThrow('boom');
  });
});
