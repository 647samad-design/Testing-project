import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getMySubscriptionMock } = vi.hoisted(() => ({ getMySubscriptionMock: vi.fn() }));

vi.mock('@/services/stripe', () => ({
  getMySubscription: getMySubscriptionMock,
}));

import { getMySubscription, invalidateSubscriptionCache } from '@/services/subscription-cache';

describe('subscription-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSubscriptionCache();
  });

  it('shares one underlying fetch across concurrent callers for the same user', async () => {
    getMySubscriptionMock.mockResolvedValue({ plan: 'pro_monthly', status: 'active', current_period_end: null, cancel_at_period_end: false });

    const [a, b, c] = await Promise.all([
      getMySubscription('user-1'),
      getMySubscription('user-1'),
      getMySubscription('user-1'),
    ]);

    expect(getMySubscriptionMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('fetches again for a different user rather than returning the previous user\'s cached result', async () => {
    getMySubscriptionMock.mockResolvedValueOnce({ plan: 'pro_monthly', status: 'active', current_period_end: null, cancel_at_period_end: false });
    await getMySubscription('user-1');

    getMySubscriptionMock.mockResolvedValueOnce({ plan: 'free', status: 'active', current_period_end: null, cancel_at_period_end: false });
    const result = await getMySubscription('user-2');

    expect(getMySubscriptionMock).toHaveBeenCalledTimes(2);
    expect(result?.plan).toBe('free');
  });

  it('invalidateSubscriptionCache forces the next call to re-fetch', async () => {
    getMySubscriptionMock.mockResolvedValue({ plan: 'free', status: 'active', current_period_end: null, cancel_at_period_end: false });
    await getMySubscription('user-1');
    invalidateSubscriptionCache();
    await getMySubscription('user-1');

    expect(getMySubscriptionMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected fetch, so a later retry can succeed', async () => {
    getMySubscriptionMock.mockRejectedValueOnce(new Error('network error'));
    const first = await getMySubscription('user-1');
    expect(first).toBeNull();

    getMySubscriptionMock.mockResolvedValueOnce({ plan: 'pro_monthly', status: 'active', current_period_end: null, cancel_at_period_end: false });
    invalidateSubscriptionCache();
    const second = await getMySubscription('user-1');
    expect(second?.plan).toBe('pro_monthly');
  });
});
