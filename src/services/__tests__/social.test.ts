import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock }, rpc: rpcMock },
}));

import { isFollowing, getFollowingIds, getFollowedCandidates, getFollowedIssues, getFollowerCount, getNotifications, markAllNotificationsRead } from '@/services/social';

describe('isFollowing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always filters by the current user, never relying on RLS alone', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const eqUserMock = vi.fn().mockReturnThis();
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
