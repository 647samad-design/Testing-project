import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock, invokeMock, getUserMock, fromMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  invokeMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock, getUser: getUserMock },
    functions: { invoke: invokeMock },
    from: fromMock,
  },
}));

import { startCheckout, getMySubscription, getMyManagedCandidates } from '@/services/stripe';

describe('startCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement navigation; stub it so we can assert on it.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  it('throws a friendly error when the user has no active session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    await expect(startCheckout('pro_monthly')).rejects.toThrow('Please sign in before subscribing.');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('throws when the edge function returns an error', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Stripe not configured' } });

    await expect(startCheckout('pro_monthly')).rejects.toThrow('Stripe not configured');
  });

  it('throws when no checkout URL comes back', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    invokeMock.mockResolvedValue({ data: {}, error: null });

    await expect(startCheckout('pro_monthly')).rejects.toThrow(/did not return a redirect URL/);
  });

  it('redirects the browser on success', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    invokeMock.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/session123' }, error: null });

    await startCheckout('candidate_management', 'candidate-42');

    expect(invokeMock).toHaveBeenCalledWith('create-checkout-session', {
      body: { plan: 'candidate_management', candidateId: 'candidate-42' },
    });
    expect(window.location.href).toBe('https://checkout.stripe.com/session123');
  });
});

describe('getMySubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always filters by the current user id, never relying on RLS alone', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const eqMock = vi.fn().mockReturnThis();
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { plan: 'pro_monthly', status: 'active', current_period_end: null, cancel_at_period_end: false }, error: null });
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock, maybeSingle: maybeSingleMock }) });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });

    const result = await getMySubscription();

    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result?.plan).toBe('pro_monthly');
  });

  it('throws if nobody is signed in, instead of silently querying everyone', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getMySubscription()).rejects.toThrow('Not signed in.');
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getMyManagedCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes to the current user\'s own verified claims before querying management subs', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const claimsEq2 = vi.fn().mockResolvedValue({ data: [{ candidate_id: 'cand-1' }], error: null });
    const claimsEq1 = vi.fn(() => ({ eq: claimsEq2 }));
    const inMock = vi.fn().mockResolvedValue({ data: [{ candidate_id: 'cand-1', status: 'active', is_comped: false, current_period_end: null, candidates: { first_name: 'A', last_name: 'B' } }], error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'candidate_claims') return { select: () => ({ eq: claimsEq1 }) };
      if (table === 'candidate_management_subscriptions') return { select: () => ({ in: inMock }) };
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getMyManagedCandidates();

    expect(claimsEq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(claimsEq2).toHaveBeenCalledWith('status', 'verified');
    expect(inMock).toHaveBeenCalledWith('candidate_id', ['cand-1']);
    expect(result).toHaveLength(1);
  });

  it('returns an empty list without querying management subs if the user has no verified claims', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const claimsEq2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const claimsEq1 = vi.fn(() => ({ eq: claimsEq2 }));
    fromMock.mockImplementation((table: string) => {
      if (table === 'candidate_claims') return { select: () => ({ eq: claimsEq1 }) };
      throw new Error(`should not query ${table}`);
    });

    const result = await getMyManagedCandidates();
    expect(result).toEqual([]);
  });
});
