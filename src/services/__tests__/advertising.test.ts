import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

import { getMyAdvertiserProfile, getMyAds } from '@/services/advertising';

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

describe('getMyAds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by the caller\'s own advertiser_id, not just RLS (previously fetched unfiltered)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const profileMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'adv-1', user_id: 'user-1' }, error: null });
    const orderMock = vi.fn().mockResolvedValue({ data: [{ id: 'ad-1', advertiser_id: 'adv-1' }], error: null });
    const eqAdvertiserMock = vi.fn(() => ({ order: orderMock }));

    fromMock.mockImplementation((table: string) => {
      if (table === 'advertisers') return { select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) }) };
      if (table === 'advertisements') return { select: () => ({ eq: eqAdvertiserMock }) };
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getMyAds();

    expect(eqAdvertiserMock).toHaveBeenCalledWith('advertiser_id', 'adv-1');
    expect(result).toHaveLength(1);
  });

  it('returns an empty list without querying ads if the caller has no advertiser profile yet', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await getMyAds();
    expect(result).toEqual([]);
  });
});
