import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: vi.fn() } },
}));

import { getOrCreateConversation, sendMessage, markConversationRead } from '@/services/messaging';

describe('getOrCreateConversation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the existing conversation without creating a new one', async () => {
    const existingConvo = { id: 'convo-1', candidate_id: 'cand-1' };
    fromMock.mockImplementation((table: string) => {
      if (table === 'conversations') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingConvo, error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getOrCreateConversation('cand-1');

    expect(result).toEqual(existingConvo);
    // Should only have queried `conversations`, never touched `candidate_claims` or inserted anything.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('creates a new conversation (linking the verified claimant) when none exists', async () => {
    let selectCallCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'conversations') {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: check for existing -> none found
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
        }
        // Second call: the insert
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'new-convo', ...row }, error: null }),
            }),
          }),
        };
      }
      if (table === 'candidate_claims') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { user_id: 'candidate-user-1' }, error: null }) }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getOrCreateConversation('cand-1');

    expect(result?.id).toBe('new-convo');
    expect(result?.candidate_user_id).toBe('candidate-user-1');
  });

  it('returns null if the insert fails, instead of throwing', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'conversations') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('db error') }) }) }),
        };
      }
      if (table === 'candidate_claims') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getOrCreateConversation('cand-1');
    expect(result).toBeNull();
  });
});

describe('sendMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts the message and bumps the conversation timestamp', async () => {
    const updateMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    fromMock.mockImplementation((table: string) => {
      if (table === 'messages') {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'msg-1', body: 'hi' }, error: null }) }) }) };
      }
      if (table === 'conversations') {
        return { update: updateMock };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await sendMessage('convo-1', 'hi', 'voter');

    expect(result?.id).toBe('msg-1');
    expect(updateMock).toHaveBeenCalled();
  });

  it('returns null and does not touch the conversation if the insert fails', async () => {
    const updateMock = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === 'messages') {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('failed') }) }) }) };
      }
      if (table === 'conversations') {
        return { update: updateMock };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await sendMessage('convo-1', 'hi', 'voter');

    expect(result).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('markConversationRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates voter_read_at when marking read as the voter', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });

    await markConversationRead('convo-1', true);

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ voter_read_at: expect.any(String) }));
  });

  it('updates candidate_read_at when marking read as the candidate', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });

    await markConversationRead('convo-1', false);

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ candidate_read_at: expect.any(String) }));
  });
});
