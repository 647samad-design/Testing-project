/**
 * Runs the real getVoterBallot() against a real PostgREST (same 1,000-row cap
 * as Supabase) and a database with every migration applied plus
 * db-tests/api_fixture.sql. Skipped unless PGRST_URL is set; run it with
 *   PSQL_AS=postgres ./db-tests/run-api-tests.sh
 */
import { describe, it, expect, vi } from 'vitest';

const PGRST_URL = process.env.PGRST_URL;

vi.mock('@/lib/supabase', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js');
  return { supabase: new PostgrestClient(process.env.PGRST_URL ?? 'http://invalid') };
});
vi.mock('@/services/regions', () => ({ buildRegionBallot: () => ({ election: null, contests: [], measures: [] }) }));

describe.skipIf(!PGRST_URL)('getVoterBallot against real PostgREST', () => {
  it('ZIP linked to a district: only that district + statewide races; never other states', async () => {
    sessionStorage.clear();
    const { getVoterBallot } = await import('@/services/elections');
    const r = await getVoterBallot('99901');
    expect(r.scope).toBe('district');
    const names = r.contests.map((c) => c.office_name);
    expect(names).toContain('Testland House 1');
    expect(names).not.toContain('Testland House 2');
    expect(names).not.toContain('Otherstate House 9');
    expect(names.some((n) => n.startsWith('Testland Council'))).toBe(false);
    const mine = r.contests.find((c) => c.office_name === 'Testland House 1');
    expect(mine?.candidates?.map((c) => c.last_name)).toEqual(['Landry']);
    expect(r.measures.map((m) => m.title)).toContain('Testland House 1 bond');
    expect(r.measures.map((m) => m.title)).not.toContain('Otherstate bond');
  });

  it('ZIP without district links: EVERY race in the state (past the 1,000-row cap), none from other states', async () => {
    sessionStorage.clear();
    const { getVoterBallot } = await import('@/services/elections');
    const r = await getVoterBallot('99902');
    expect(r.scope).toBe('state');
    const names = r.contests.map((c) => c.office_name);
    expect(names.filter((n) => n.startsWith('Testland Council')).length).toBe(1200);
    expect(names).toContain('Testland House 1');
    expect(names).toContain('Testland House 2');
    expect(names).not.toContain('Otherstate House 9');
    expect(r.measures.map((m) => m.title)).not.toContain('Otherstate bond');
  }, 30000);

  it('getAllContestsWithCandidates returns real races with their real candidates (Candidates page)', async () => {
    const { getAllContestsWithCandidates } = await import('@/services/candidates');
    const contests = await getAllContestsWithCandidates();
    const house1 = contests.find((c) => c.office_name === 'Testland House 1');
    expect(house1?.candidates?.map((c) => c.last_name)).toEqual(['Landry']);
    // only races that actually have candidates
    expect(contests.find((c) => c.office_name === 'Testland House 2')).toBeUndefined();
    expect(contests.every((c) => (c.candidates ?? []).length > 0)).toBe(true);
  });
});
