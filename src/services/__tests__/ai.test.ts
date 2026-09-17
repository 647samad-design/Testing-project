import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

vi.mock('@/services/demo-data', () => ({
  getDemoCandidates: () => [],
}));

import { assessClaim } from '@/services/ai';

describe('assessClaim', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses limit(1) instead of maybeSingle(), so it never throws when an ILIKE search matches more than one claim', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
        { id: 'claim-1', claim_text: 'Taxes will go up', assessment: 'misleading', explanation: 'x', candidate: null },
        { id: 'claim-2', claim_text: 'Taxes will go up next year', assessment: 'true', explanation: 'y', candidate: null },
      ],
      error: null,
    });
    const ilikeMock = vi.fn(() => ({ limit: limitMock }));
    fromMock.mockImplementation((table: string) => {
      if (table === 'claims') return { select: () => ({ ilike: ilikeMock }) };
      if (table === 'claim_evidence') return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    });

    const result = await assessClaim('Taxes will go up');

    expect(limitMock).toHaveBeenCalledWith(1);
    // Should not throw, and should use the FIRST match.
    expect(result.claim).toBe('Taxes will go up');
    expect(result.assessment).toBe('misleading');
  });
});
