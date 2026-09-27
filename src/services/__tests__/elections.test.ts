import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));
vi.mock('@/services/demo-data', () => ({
  demoElection: { id: 'demo-election' },
  demoContests: [],
  demoMeasures: [],
}));
vi.mock('@/services/regions', () => ({ buildRegionBallot: vi.fn() }));

import { getVoterDistricts } from '@/services/elections';

describe('getVoterDistricts — zip_code has no UNIQUE constraint at the database level', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses limit(1) rather than maybeSingle(), so a ZIP mapped to more than one row never throws', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
        { state: 'FL', county: 'Miami-Dade', congressional_district_id: null, state_senate_district_id: null, state_house_district_id: null, municipal_district_id: null, judicial_district_id: null, school_district_id: null },
        { state: 'FL', county: 'Broward', congressional_district_id: null, state_senate_district_id: null, state_house_district_id: null, municipal_district_id: null, judicial_district_id: null, school_district_id: null },
      ],
      error: null,
    });
    const eqMock = vi.fn(() => ({ limit: limitMock }));
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });

    const result = await getVoterDistricts('123 Main St, 33101');

    expect(limitMock).toHaveBeenCalledWith(1);
    // Takes the FIRST matching row rather than throwing a "multiple rows" error.
    expect(result.county).toBe('Miami-Dade');
  });

  it('falls back gracefully when no ZIP is found in the address', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) });
    const result = await getVoterDistricts('no zip here');
    expect(result).toBeTruthy();
  });
});
