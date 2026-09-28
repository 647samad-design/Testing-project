import { describe, it, expect, vi, beforeEach } from 'vitest';

// Table-driven fake: every query on a table resolves to that table's rows.
// Filters are ignored, which is fine here -- the behaviour under test is the
// district filtering done in JavaScript after the rows come back.
const { tables } = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));
vi.mock('@/lib/supabase', () => {
  const chain = (name: string): unknown => {
    const result = () => Promise.resolve({ data: tables[name] ?? [], error: null });
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'ilike']) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: (tables[name] ?? [])[0] ?? null, error: null });
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
    return q;
  };
  return { supabase: { from: (name: string) => chain(name) } };
});
vi.mock('@/services/demo-data', () => ({ demoElection: { id: 'demo' }, demoContests: [], demoMeasures: [] }));
vi.mock('@/services/regions', () => ({ buildRegionBallot: () => ({ election: null, contests: [], measures: [] }) }));

import { getVoterBallot } from '@/services/elections';

const districts = [
  { id: 'd-mine', name: 'State House District 1', district_type: 'state_house', state: 'Florida' },
  { id: 'd-other', name: 'State House District 99', district_type: 'state_house', state: 'Florida' },
  { id: 'd-texas', name: 'TX House 5', district_type: 'state_house', state: 'Texas' },
];
const contests = [
  { id: 'c-mine', election_id: 'e1', district_id: 'd-mine', office_name: 'State House 1', contest_level: 'state' },
  { id: 'c-other', election_id: 'e1', district_id: 'd-other', office_name: 'State House 99', contest_level: 'state' },
  { id: 'c-statewide', election_id: 'e1', district_id: null, office_name: 'Governor', contest_level: 'state' },
  { id: 'c-texas', election_id: 'e1', district_id: 'd-texas', office_name: 'TX House 5', contest_level: 'state' },
];
const measures = [
  { id: 'm-mine', election_id: 'e1', district_id: 'd-mine', title: 'Local bond' },
  { id: 'm-other', election_id: 'e1', district_id: 'd-other', title: 'Other county bond' },
  { id: 'm-statewide', election_id: 'e1', district_id: null, title: 'Amendment 1' },
];

beforeEach(() => {
  sessionStorage.clear();
  Object.assign(tables, {
    elections: [{ id: 'e1', name: 'General', election_date: '2026-11-03' }],
    ballot_contests: contests,
    ballot_measures: measures,
    districts,
    candidate_offices: [],
    candidates: [],
  });
});

describe('getVoterBallot district scoping', () => {
  it('shows only the voter\'s own districts plus statewide when the ZIP is linked', async () => {
    tables.zip_districts = [{ zip_code: '33101', state: 'Florida', county: 'Miami-Dade', state_house_district_id: 'd-mine' }];
    const r = await getVoterBallot('33101');
    expect(r.scope).toBe('district');
    expect(r.contests.map((c) => c.id).sort()).toEqual(['c-mine', 'c-statewide']);
    expect(r.measures.map((m) => m.id).sort()).toEqual(['m-mine', 'm-statewide']);
  });

  it('falls back to the whole state (never other states) when the ZIP has no district links', async () => {
    tables.zip_districts = [{ zip_code: '33101', state: 'Florida', county: 'Miami-Dade' }];
    const r = await getVoterBallot('33101');
    expect(r.scope).toBe('state');
    expect(r.contests.map((c) => c.id).sort()).toEqual(['c-mine', 'c-other', 'c-statewide']);
    expect(r.contests.map((c) => c.id)).not.toContain('c-texas');
  });
});
