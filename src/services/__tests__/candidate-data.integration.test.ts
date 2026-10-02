/**
 * Does candidate information actually SAVE and UPDATE in the database?
 *
 * Runs the real app service functions (the ones the pages call) against a real
 * PostgREST + the fully migrated database, signed in as the real roles
 * (an admin, and the verified owner of a candidate profile), then reads the rows
 * back to prove the write landed. Catches what unit tests with mocks can't:
 * RLS that silently affects 0 rows, triggers that block or rewrite values,
 * missing columns, and wrong status flows.
 *
 * Run with db-tests/run-api-tests.sh (needs PGRST_URL).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import crypto from 'node:crypto';

const PGRST_URL = process.env.PGRST_URL;
const SECRET = 'a-string-secret-at-least-32-characters-long';
const ADMIN = { id: 'ad300000-0000-0000-0000-00000000000a', email: 'admin@testland.example' };
const OWNER = { id: 'c1a10000-0000-0000-0000-00000000000c', email: 'tess@testland.example' };
const TESS = 'ca7e0000-0000-0000-0000-000000000001';

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

/** Read rows back as the admin (who can see everything), bypassing app code. */
async function readBack<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub: ADMIN.id, role: 'authenticated', exp: 2000000000 });
  const token = `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
  const r = await fetch(`${PGRST_URL}/${table}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`readBack ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

describe.skipIf(!PGRST_URL)('candidate data saves and updates (real PostgREST, real roles)', () => {
  let issueId = '';
  let questionId = '';
  beforeAll(async () => {
    issueId = (await readBack<{ id: string }>('issues', 'select=id&limit=1'))[0].id;
    questionId = (await readBack<{ id: string }>('civic_quiz_questions', 'select=id&limit=1'))[0].id;
  });

  // ─── Admin ───────────────────────────────────────────────────────────────
  it('admin: Add Candidate saves a REAL candidate', async () => {
    as(ADMIN);
    const { addCandidate } = await import('@/services/admin');
    await addCandidate({ first_name: 'Quinn', last_name: 'Addtest', party: 'Independent', bio: 'Added by admin' });
    const rows = await readBack('candidates', 'last_name=eq.Addtest&select=first_name,party,bio,is_demo');
    expect(rows).toEqual([{ first_name: 'Quinn', party: 'Independent', bio: 'Added by admin', is_demo: false }]);
  });

  it('admin: Edit Candidate updates the row', async () => {
    as(ADMIN);
    const { updateCandidate } = await import('@/services/admin');
    const [{ id }] = await readBack<{ id: string }>('candidates', 'last_name=eq.Addtest&select=id');
    await updateCandidate(id, { party: 'Democratic', bio: 'Edited bio' });
    expect(await readBack('candidates', `id=eq.${id}&select=party,bio`)).toEqual([{ party: 'Democratic', bio: 'Edited bio' }]);
  });

  it('admin: position and voting record are saved', async () => {
    as(ADMIN);
    const { addCandidatePosition, addVotingRecord } = await import('@/services/admin');
    await addCandidatePosition({ candidate_id: TESS, issue_id: issueId, summary: 'Supports later school start times.' });
    await addVotingRecord({ candidate_id: TESS, bill_name: 'Testland HB 1', bill_number: 'HB 1', vote: 'yes', vote_date: '2026-03-01' } as never);
    expect((await readBack('candidate_positions', `candidate_id=eq.${TESS}&select=summary`)).map((r) => r.summary)).toContain('Supports later school start times.');
    expect((await readBack('voting_records', `candidate_id=eq.${TESS}&select=bill_name`)).map((r) => r.bill_name)).toContain('Testland HB 1');
  });

  it('admin: bulk import saves real candidates', async () => {
    as(ADMIN);
    const { bulkImportCandidates } = await import('@/services/admin');
    await bulkImportCandidates([{ first_name: 'Bulk', last_name: 'Importone', party: 'Republican' }, { first_name: 'Bulk', last_name: 'Importtwo' }] as never);
    const rows = await readBack('candidates', 'first_name=eq.Bulk&select=last_name,is_demo&order=last_name');
    expect(rows).toEqual([{ last_name: 'Importone', is_demo: false }, { last_name: 'Importtwo', is_demo: false }]);
  });

  // ─── Candidate (verified owner) → admin review ───────────────────────────
  it('candidate submits a bio → pending; admin approves → candidates.bio updated', async () => {
    as(OWNER);
    const { submitCandidateContent } = await import('@/services/candidate-portal');
    await submitCandidateContent(TESS, 'bio', 'Tess grew up in Test County and teaches civics.');
    const [sub] = await readBack<{ id: string; status: string }>('candidate_submissions', `candidate_id=eq.${TESS}&field_name=eq.bio&select=id,status&order=created_at.desc&limit=1`);
    expect(sub.status).toBe('pending');
    // not live yet
    expect((await readBack('candidates', `id=eq.${TESS}&select=bio`))[0].bio).not.toBe('Tess grew up in Test County and teaches civics.');

    as(ADMIN);
    const { approveSubmission } = await import('@/services/admin');
    await approveSubmission(sub.id);
    expect((await readBack('candidates', `id=eq.${TESS}&select=bio`))[0].bio).toBe('Tess grew up in Test County and teaches civics.');
    expect((await readBack('candidate_submissions', `id=eq.${sub.id}&select=status`))[0].status).toBe('approved');
  });

  it('candidate submits a website → admin rejects with a reason → candidate unchanged', async () => {
    as(OWNER);
    const { submitCandidateContent } = await import('@/services/candidate-portal');
    await submitCandidateContent(TESS, 'website_url', 'https://tess-for-house.example');
    const [sub] = await readBack<{ id: string }>('candidate_submissions', `candidate_id=eq.${TESS}&field_name=eq.website_url&select=id&order=created_at.desc&limit=1`);
    as(ADMIN);
    const { rejectSubmission } = await import('@/services/admin');
    await rejectSubmission(sub.id, 'Domain not verified');
    expect(await readBack('candidate_submissions', `id=eq.${sub.id}&select=status,admin_notes`)).toEqual([{ status: 'rejected', admin_notes: 'Domain not verified' }]);
    expect((await readBack('candidates', `id=eq.${TESS}&select=website_url`))[0].website_url).not.toBe('https://tess-for-house.example');
  });

  it('candidate submits an event → admin approves; a second → admin rejects with a reason', async () => {
    as(OWNER);
    const { submitEvent } = await import('@/services/candidate-portal');
    await submitEvent(TESS, { title: 'Town hall', event_date: '2026-10-20' });
    await submitEvent(TESS, { title: 'Wrong-date event', event_date: '2026-10-21' });
    const events = await readBack<{ id: string; title: string; status: string }>('candidate_events', `candidate_id=eq.${TESS}&select=id,title,status`);
    expect(events.every((e) => e.status === 'pending')).toBe(true);

    as(ADMIN);
    const { approveEvent, rejectEvent } = await import('@/services/admin');
    await approveEvent(events.find((e) => e.title === 'Town hall')!.id);
    await rejectEvent(events.find((e) => e.title === 'Wrong-date event')!.id, 'Date conflicts with filing');
    const after = await readBack<{ title: string; status: string; admin_notes: string | null }>('candidate_events', `candidate_id=eq.${TESS}&select=title,status,admin_notes&order=title`);
    expect(after).toEqual([
      { title: 'Town hall', status: 'approved', admin_notes: null },
      { title: 'Wrong-date event', status: 'rejected', admin_notes: 'Date conflicts with filing' },
    ]);
  });

  it('candidate questionnaire answer → admin approves', async () => {
    as(OWNER);
    const { submitQuestionnaireResponse } = await import('@/services/candidate-portal');
    await submitQuestionnaireResponse(TESS, 'Why are you running?', 'To fix local transit.');
    const [q] = await readBack<{ id: string; status: string }>('candidate_questionnaire_responses', `candidate_id=eq.${TESS}&select=id,status`);
    expect(q.status).toBe('pending');
    as(ADMIN);
    const { approveQuestionnaireResponse } = await import('@/services/admin');
    await approveQuestionnaireResponse(q.id);
    expect((await readBack('candidate_questionnaire_responses', `id=eq.${q.id}&select=status`))[0].status).toBe('approved');
  });

  it('candidate quiz answer saves as pending, and an edit is saved (and re-reviewed)', async () => {
    as(OWNER);
    const { saveCandidateQuizAnswer } = await import('@/services/quiz');
    expect((await saveCandidateQuizAnswer(TESS, questionId, 'b')).success).toBe(true);
    expect(await readBack('candidate_quiz_answers', `candidate_id=eq.${TESS}&question_id=eq.${questionId}&select=answer,status`)).toEqual([{ answer: 'b', status: 'pending' }]);
    expect((await saveCandidateQuizAnswer(TESS, questionId, 'c')).success).toBe(true);
    expect(await readBack('candidate_quiz_answers', `candidate_id=eq.${TESS}&question_id=eq.${questionId}&select=answer,status`)).toEqual([{ answer: 'c', status: 'pending' }]);
  });

  it('candidate profile details save, and update on a second save', async () => {
    as(OWNER);
    const { upsertProfileExtras } = await import('@/services/candidate-profile-extras');
    expect((await upsertProfileExtras(TESS, { current_occupation: 'Teacher', hometown_area: 'Test County' })).success).toBe(true);
    expect((await upsertProfileExtras(TESS, { current_occupation: 'Principal', hometown_area: 'Test County' })).success).toBe(true);
    const rows = await readBack('candidate_profile_extras', `candidate_id=eq.${TESS}&select=current_occupation,hometown_area`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ current_occupation: 'Principal', hometown_area: 'Test County' });
  });

  it('candidate endorsement and get-to-know answer save as pending; admin approves', async () => {
    as(OWNER);
    const { submitEndorsement, submitGetToKnow } = await import('@/services/candidate-profile-extras');
    const e = await submitEndorsement(TESS, { endorser_name: 'Testland Teachers Union', endorser_type: 'organization', endorser_title: null, endorser_logo_url: null, endorsement_date: null, display_order: 0 } as never);
    expect(e.success, e.error).toBe(true);
    const g = await submitGetToKnow(TESS, 'Favorite book?', 'Middlemarch', 0);
    expect(g.success, g.error).toBe(true);
    const [end] = await readBack<{ id: string; status: string }>('candidate_endorsements', `candidate_id=eq.${TESS}&select=id,status`);
    expect(end.status).toBe('pending');

    as(ADMIN);
    const { reviewProfileExtra } = await import('@/services/admin');
    await reviewProfileExtra('endorsement', end.id, 'approved');
    expect((await readBack('candidate_endorsements', `id=eq.${end.id}&select=status`))[0].status).toBe('approved');
  });

  it('a candidate WITH the Management plan can save their campaign page and campaign event', async () => {
    as(OWNER);
    const { upsertCampaign, addCampaignEvent } = await import('@/services/campaign');
    await upsertCampaign(TESS, { headline: 'Better buses', message: 'Every 10 minutes.', is_active: true });
    await upsertCampaign(TESS, { headline: 'Better buses, sooner' });
    await addCampaignEvent(TESS, { title: 'Canvass kickoff', event_date: '2026-10-25T10:00:00Z', is_public: true });
    expect((await readBack('campaigns', `candidate_id=eq.${TESS}&select=headline`))).toEqual([{ headline: 'Better buses, sooner' }]);
    expect((await readBack('campaign_events', `candidate_id=eq.${TESS}&select=title`)).map((r) => r.title)).toContain('Canvass kickoff');
  });

  it('a candidate WITHOUT the Management plan cannot write campaign data (paid feature)', async () => {
    as(OWNER);
    const { upsertCampaign } = await import('@/services/campaign');
    const other = 'ca7e0000-0000-0000-0000-00000000de30'; // a candidate this user doesn't own or pay for
    await expect(upsertCampaign(other, { headline: 'not mine' })).rejects.toThrow();
  });

  // ─── Delete ──────────────────────────────────────────────────────────────
  it('admin: Delete Candidate removes the row', async () => {
    as(ADMIN);
    const { deleteCandidate } = await import('@/services/admin');
    const [{ id }] = await readBack<{ id: string }>('candidates', 'last_name=eq.Addtest&select=id');
    await deleteCandidate(id);
    expect(await readBack('candidates', `id=eq.${id}&select=id`)).toEqual([]);
  });

  // ─── Permissions: the wrong people can't write ───────────────────────────
  it('a candidate cannot edit the candidates table directly (must go through review)', async () => {
    as(OWNER);
    const { updateCandidate } = await import('@/services/admin');
    await updateCandidate(TESS, { bio: 'Self-published, no review' }).catch(() => {});
    expect((await readBack('candidates', `id=eq.${TESS}&select=bio`))[0].bio).not.toBe('Self-published, no review');
  });
});
