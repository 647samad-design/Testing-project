import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

import { getMyAdvertiserProfile } from '@/services/advertising';

describe('getMyAdvertiserProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by the current user id, not just RLS', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { id: 'adv-1' }, error: null });
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });

    const result = await getMyAdvertiserProfile();

    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual({ id: 'adv-1' });
  });

  it('returns null without querying if nobody is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await getMyAdvertiserProfile();
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
