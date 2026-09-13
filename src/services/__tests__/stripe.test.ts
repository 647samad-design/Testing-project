import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock, invokeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    functions: { invoke: invokeMock },
  },
}));

import { startCheckout } from '@/services/stripe';

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
