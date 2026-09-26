import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

import { submitCandidateClaim, submitCandidateContent } from '@/services/candidate-portal';

describe('submitCandidateClaim — admin notification (previously admins had zero alert)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies admins after a successful claim submission', async () => {
    fromMock.mockReturnValue({ insert: () => Promise.resolve({ error: null }) });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await submitCandidateClaim('cand-1', { full_name: 'Jane Doe', email: 'jane@example.com' });

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('notify_admins_of_pending_review', expect.objectContaining({
      p_title: 'New candidate claim to review',
    }));
  });

  it('still reports success even if the admin-notify RPC fails', async () => {
    fromMock.mockReturnValue({ insert: () => Promise.resolve({ error: null }) });
    rpcMock.mockRejectedValue(new Error('rpc down'));

    const result = await submitCandidateClaim('cand-1', { full_name: 'Jane Doe', email: 'jane@example.com' });
    expect(result.success).toBe(true);
  });

  it('does not notify admins if the claim insert itself fails', async () => {
    fromMock.mockReturnValue({ insert: () => Promise.resolve({ error: new Error('duplicate claim') }) });

    const result = await submitCandidateClaim('cand-1', { full_name: 'Jane Doe', email: 'jane@example.com' });
    expect(result.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('submitCandidateContent — admin notification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies admins after a successful content submission', async () => {
    fromMock.mockReturnValue({ insert: () => Promise.resolve({ error: null }) });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await submitCandidateContent('cand-1', 'bio', 'New bio text');

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('notify_admins_of_pending_review', expect.objectContaining({
      p_title: 'New candidate content submission',
    }));
  });
});
