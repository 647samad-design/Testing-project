import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, rpcMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, rpc: rpcMock, auth: { getUser: getUserMock } },
}));

import { getCampaign, getCampaignEvents, getEventRsvpCount, getMyRsvpEventIds, rsvpToEvent, cancelRsvp, upsertCampaign } from '@/services/campaign';

describe('getCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only returns an active campaign (not a hidden/inactive one)', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { id: 'c1', is_active: true }, error: null });
    const eqActiveMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    const eqCandidateMock = vi.fn(() => ({ eq: eqActiveMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqCandidateMock }) });

    await getCampaign('cand-1');

    expect(eqCandidateMock).toHaveBeenCalledWith('candidate_id', 'cand-1');
    expect(eqActiveMock).toHaveBeenCalledWith('is_active', true);
  });

  it('returns null on a query error instead of throwing', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }) });
    const result = await getCampaign('cand-1');
    expect(result).toBeNull();
  });
});

describe('getCampaignEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only fetches public, future-dated events sorted soonest-first', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const gteMock = vi.fn(() => ({ order: orderMock }));
    const eqPublicMock = vi.fn(() => ({ gte: gteMock }));
    const eqCandidateMock = vi.fn(() => ({ eq: eqPublicMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqCandidateMock }) });

    await getCampaignEvents('cand-1');

    expect(eqCandidateMock).toHaveBeenCalledWith('candidate_id', 'cand-1');
    expect(eqPublicMock).toHaveBeenCalledWith('is_public', true);
    expect(orderMock).toHaveBeenCalledWith('event_date', { ascending: true });
  });
});

describe('RSVP privacy — count vs identity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getEventRsvpCount goes through the count-only RPC, never a raw table select', async () => {
    rpcMock.mockResolvedValue({ data: 5, error: null });
    const result = await getEventRsvpCount('event-1');
    expect(rpcMock).toHaveBeenCalledWith('get_event_rsvp_count', { p_event_id: 'event-1' });
    expect(result).toBe(5);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('getMyRsvpEventIds goes through the caller-scoped RPC', async () => {
    rpcMock.mockResolvedValue({ data: ['event-1'], error: null });
    const result = await getMyRsvpEventIds(['event-1', 'event-2']);
    expect(rpcMock).toHaveBeenCalledWith('get_my_rsvp_event_ids', { p_event_ids: ['event-1', 'event-2'] });
    expect(result).toEqual(['event-1']);
  });

  it('getMyRsvpEventIds short-circuits with no RPC call for an empty list', async () => {
    const result = await getMyRsvpEventIds([]);
    expect(result).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('rsvpToEvent / cancelRsvp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rsvpToEvent inserts without needing to pass user_id (DB default handles it)', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });

    await rsvpToEvent('event-1');
    expect(insertMock).toHaveBeenCalledWith({ event_id: 'event-1' });
  });

  it('cancelRsvp scopes the delete to the current user explicitly', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const eqUserMock = vi.fn().mockResolvedValue({ error: null });
    const eqEventMock = vi.fn(() => ({ eq: eqUserMock }));
    const deleteMock = vi.fn(() => ({ eq: eqEventMock }));
    fromMock.mockReturnValue({ delete: deleteMock });

    await cancelRsvp('event-1');

    expect(eqEventMock).toHaveBeenCalledWith('event_id', 'event-1');
    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('cancelRsvp throws if nobody is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(cancelRsvp('event-1')).rejects.toThrow('Not signed in.');
  });
});

describe('upsertCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts on candidate_id so re-saving updates rather than duplicates', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert: upsertMock });

    await upsertCampaign('cand-1', { headline: 'Hi', goals: ['a', 'b'] });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ candidate_id: 'cand-1', headline: 'Hi', goals: ['a', 'b'] }),
      { onConflict: 'candidate_id' }
    );
  });
});
