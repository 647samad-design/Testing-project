import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

import { getNotificationPreferences, updateNotificationPreferences } from '@/services/notification-preferences';

describe('getNotificationPreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns client-confirmed defaults (weekly digest, all categories on) without a signed-in user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const prefs = await getNotificationPreferences();
    expect(prefs.digest_frequency).toBe('weekly');
    expect(prefs.instant_election_reminders).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('filters by the current user explicitly', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { digest_frequency: 'daily' }, error: null });
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });

    const prefs = await getNotificationPreferences();

    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(prefs.digest_frequency).toBe('daily');
  });

  it('falls back to defaults on a query error rather than throwing', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: new Error('boom') }) }) }) });

    const prefs = await getNotificationPreferences();
    expect(prefs.digest_frequency).toBe('weekly');
  });
});

describe('updateNotificationPreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts scoped to the current user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert: upsertMock });

    await updateNotificationPreferences({ digest_frequency: 'off' });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', digest_frequency: 'off' }),
      { onConflict: 'user_id' }
    );
  });

  it('throws if nobody is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(updateNotificationPreferences({ digest_frequency: 'off' })).rejects.toThrow('Not signed in.');
  });
});
