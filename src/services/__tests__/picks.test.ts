import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));

import { loadPicks, setContestPick, setMeasurePick, countPicks, _resetPicksForTests } from '@/services/picks';

/** Reads the current store snapshot through a fresh load (signed-out reads localStorage). */
function stored() {
  return JSON.parse(localStorage.getItem('govsearch_picks') ?? '{"contests":{},"measures":{}}');
}

describe('picks (signed out: kept on this device)', () => {
  beforeEach(() => { localStorage.clear(); _resetPicksForTests(); vi.clearAllMocks(); });

  it('saves a candidate pick and a measure pick to the device without touching the database', async () => {
    await loadPicks(null);
    await setContestPick('race-1', 'cand-1');
    await setMeasurePick('m-1', 'yes');
    expect(stored()).toEqual({ contests: { 'race-1': 'cand-1' }, measures: { 'm-1': 'yes' } });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('switching or clearing a pick replaces it', async () => {
    await loadPicks(null);
    await setContestPick('race-1', 'cand-1');
    await setContestPick('race-1', 'cand-2');
    expect(stored().contests).toEqual({ 'race-1': 'cand-2' });
    await setContestPick('race-1', null);
    expect(stored().contests).toEqual({});
  });

  it('counts picks', () => {
    expect(countPicks({ contests: { a: '1', b: '2' }, measures: { m: 'no' } })).toBe(3);
  });
});

describe('picks (signed in: saved to the account)', () => {
  beforeEach(() => { localStorage.clear(); _resetPicksForTests(); vi.clearAllMocks(); });

  it('moves device picks into the account on sign-in, then clears the device copy', async () => {
    localStorage.setItem('govsearch_picks', JSON.stringify({ contests: { 'race-9': 'cand-9' }, measures: {} }));
    const inserts: unknown[] = [];
    fromMock.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: (row: unknown) => { inserts.push(row); return Promise.resolve({ error: null }); },
    }));
    await loadPicks('user-1');
    expect(inserts).toEqual([{ user_id: 'user-1', contest_id: 'race-9', candidate_id: 'cand-9' }]);
    expect(localStorage.getItem('govsearch_picks')).toBeNull();
  });

  it('rolls back the pick if the database rejects it', async () => {
    fromMock.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: () => Promise.resolve({ error: new Error('nope') }),
    }));
    await loadPicks('user-1');
    await expect(setContestPick('race-1', 'cand-1')).rejects.toThrow('nope');
  });
});
