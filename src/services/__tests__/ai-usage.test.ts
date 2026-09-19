import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock, getUserMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: rpcMock, auth: { getUser: getUserMock } },
}));

import { getAiUsageStatus, consumeAiUsage } from '@/services/ai';

describe('getAiUsageStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the free-tier limit shape from the RPC', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    rpcMock.mockResolvedValue({ data: { allowed: true, remaining: 3, limit: 5, is_paid: false }, error: null });

    const result = await getAiUsageStatus();

    expect(rpcMock).toHaveBeenCalledWith('get_ai_usage_status', { p_user_id: 'user-1' });
    expect(result).toEqual({ allowed: true, remaining: 3, limit: 5, isPaid: false });
  });

  it('returns null without a signed-in user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await getAiUsageStatus();
    expect(result).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('consumeAiUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports allowed=false with a paid limit of 100 for a paid user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    rpcMock.mockResolvedValue({ data: { allowed: false, remaining: 0, limit: 100, is_paid: true }, error: null });

    const result = await consumeAiUsage();
    expect(result).toEqual({ allowed: false, remaining: 0, limit: 100, isPaid: true });
  });

  it('fails closed (does not grant free usage) on an unexpected RPC error', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    rpcMock.mockResolvedValue({ data: null, error: new Error('db error') });

    const result = await consumeAiUsage();
    expect(result.allowed).toBe(false);
  });

  it('fails closed without a signed-in user, without calling the RPC', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await consumeAiUsage();
    expect(result.allowed).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
