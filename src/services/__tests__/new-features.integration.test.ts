/**
 * New features against a real PostgREST + migrated DB:
 *  - CSV import puts candidates on the right race (admin)
 *  - My Picks are saved to the voter's account and stay private
 * Run with db-tests/run-api-tests.sh (needs PGRST_URL).
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

const PGRST_URL = process.env.PGRST_URL;
const SECRET = 'a-string-secret-at-least-32-characters-long';
const ADMIN = { id: 'ad300000-0000-0000-0000-00000000000a', email: 'admin@testland.example' };

const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));

vi.mock('@/lib/supabase', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js');
  const nodeCrypto = await import('node:crypto');
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (sub: string) => {
    const h = b64({ alg: 'HS256', typ: 'JWT' });
    const p = b64({ sub, role: 'authenticated', aud: 'authenticated', exp: 2000000000 });
    return `${h}.${p}.${nodeCrypto.createHmac('sha256', 'a-string-secret-at-least-32-characters-long').update(`${h}.${p}`).digest('base64url')}`;
  };
  const client = () => new PostgrestClient(process.env.PGRST_URL ?? 'http://invalid', {
    headers: state.user ? { Authorization: `Bearer ${jwt(state.user.id)}` } : {},
  });
  return {
    supabase: {
      from: (t: string) => client().from(t),
      rpc: (fn: string, args?: object) => client().rpc(fn, args),
      auth: {
        getUser: async () => ({ data: { user: state.user }, error: null }),
        getSession: async () => ({ data: { session: state.user ? { user: state.user, access_token: 'x' } : null }, error: null }),
      },
      functions: { invoke: async () => ({ data: null, error: null }) },
      storage: { from: () => ({}) },
    },
  };
});

const as = (u: typeof ADMIN | null) => { state.user = u; };

/** Read rows back as service_role (bypasses RLS), independent of app code. */
async function readBack<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  // service_role bypasses RLS (like Supabase's service key), so private rows
  // (a voter's saved items, messages, notifications) can be verified too.
  const p = b64({ role: 'service_role', exp: 2000000000 });
  const token = `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
  const r = await fetch(`${PGRST_URL}/${table}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`readBack ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

const VOTER = { id: 'b0e70000-0000-0000-0000-00000000000b', email: 'vera@testland.example' };

describe.skipIf(!PGRST_URL)('new features (real PostgREST, real roles)', () => {
  it('admin: CSV import links a new candidate to the race named in the row', async () => {
    as(ADMIN);
    const { bulkImportCandidates, linkImportedCandidatesToRaces } = await import('@/services/admin');
    const rows = [
      { first_name: 'Ivy', last_name: 'Importer', party: 'Independent', office: 'Testland Council 7', district: 'testland council 7', state: 'Testland', incumbent: true },
      { first_name: 'Nora', last_name: 'Nowhere', office: 'Moon Council' },
      { first_name: 'Pat', last_name: 'Profileonly' },
    ];
    await bulkImportCandidates(rows);
    const r = await linkImportedCandidatesToRaces(rows);
    expect(r.linked).toBe(1);
    expect(r.notFound).toEqual(['Nora Nowhere — Moon Council']);
    const ivy = (await readBack<{ id: string }>('candidates', 'last_name=eq.Importer&select=id'))[0];
    const links = await readBack<{ incumbent: boolean; contest: { office_name: string } }>('candidate_offices', `candidate_id=eq.${ivy.id}&select=incumbent,contest:ballot_contests(office_name)`);
    expect(links).toEqual([{ incumbent: true, contest: { office_name: 'Testland Council 7' } }]);
    // Importing the same file again doesn't duplicate the ballot entry.
    const again = await linkImportedCandidatesToRaces(rows);
    expect(again).toMatchObject({ linked: 0, alreadyLinked: 1 });
  });

  it('a non-admin cannot use the import to put people on races', async () => {
    as(VOTER);
    const { linkImportedCandidatesToRaces } = await import('@/services/admin');
    await expect(linkImportedCandidatesToRaces([{ first_name: 'Tess', last_name: 'Landry', office: 'Testland Council 8', district: 'Testland Council 8' }])).rejects.toBeTruthy();
  });

  it('voter: My Picks save to the account and only the voter can see them', async () => {
    as(VOTER);
    const picks = await import('@/services/picks');
    picks._resetPicksForTests();
    await picks.loadPicks(VOTER.id);
    const contest = (await readBack<{ id: string }>('ballot_contests', 'office_name=eq.Testland House 1&select=id'))[0];
    await picks.setContestPick(contest.id, 'ca7e0000-0000-0000-0000-000000000001');
    const saved = await readBack<{ user_id: string; candidate_id: string }>('ballot_picks', `contest_id=eq.${contest.id}&select=user_id,candidate_id`);
    expect(saved).toEqual([{ user_id: VOTER.id, candidate_id: 'ca7e0000-0000-0000-0000-000000000001' }]);
    // Another signed-in user (the admin) sees none of it.
    as(ADMIN);
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.from('ballot_picks').select('id');
    expect(data).toEqual([]);
  });
});
