import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

import { submitFactCheck } from '@/services/civic';

describe('submitFactCheck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets submitted_by_user_id explicitly (previously always NULL, which made every submission fail RLS)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { id: 'fc-1' }, error: null });
    const insertMock = vi.fn(() => ({ select: () => ({ maybeSingle: maybeSingleMock }) }));
    fromMock.mockReturnValue({ insert: insertMock });

    await submitFactCheck('some claim', 'https://example.com', 'x');

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ submitted_by_user_id: 'user-1' }));
  });

  it('throws a clear error instead of silently failing RLS when nobody is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(submitFactCheck('some claim')).rejects.toThrow('Please sign in');
    expect(fromMock).not.toHaveBeenCalled();
  });
});
