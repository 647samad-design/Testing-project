/**
 * Does every platform feature actually save, update and trigger correctly?
 *
 * Same approach as candidate-data.integration.test.ts: real service functions,
 * real PostgREST, the migrated database, signed in as real roles (admin, the
 * verified owner of a candidate profile, and a regular voter), then the rows
 * are read back. Also checks the database triggers that create notifications
 * (new follower, new post, new message) actually fire.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import crypto from 'node:crypto';

const PGRST_URL = process.env.PGRST_URL;
const SECRET = 'a-string-secret-at-least-32-characters-long';
const ADMIN = { id: 'ad300000-0000-0000-0000-00000000000a', email: 'admin@testland.example' };
const OWNER = { id: 'c1a10000-0000-0000-0000-00000000000c', email: 'tess@testland.example' };
const VOTER = { id: 'b0e70000-0000-0000-0000-00000000000b', email: 'vera@testland.example' };
const TESS = 'ca7e0000-0000-0000-0000-000000000001';
const CONTEST = 'c7e50000-0000-0000-0000-000000000001';

const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));

vi.mock('@/lib/supabase', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js');
  const nodeCrypto = await import('node:crypto');
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (sub: string, email: string) => {
    const h = b64({ alg: 'HS256', typ: 'JWT' });
    const p = b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: 2000000000 });
    return `${h}.${p}.${nodeCrypto.createHmac('sha256', 'a-string-secret-at-least-32-characters-long').update(`${h}.${p}`).digest('base64url')}`;
  };
  const client = () => new PostgrestClient(process.env.PGRST_URL ?? 'http://invalid', {
    headers: state.user ? { Authorization: `Bearer ${jwt(state.user.id, state.user.email)}` } : {},
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

const as = (u: { id: string; email: string } | null) => { state.user = u; };

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
const notificationsFor = (userId: string, type: string) =>
  readBack<{ id: string; type: string; is_read: boolean; title: string }>('notifications', `user_id=eq.${userId}&type=eq.${type}&select=id,type,is_read,title&order=created_at.desc`);

describe.skipIf(!PGRST_URL)('platform features save, update and notify (real PostgREST, real roles)', () => {
  let issueId = '';
  let questionIds: string[] = [];
  beforeAll(async () => {
    issueId = (await readBack<{ id: string }>('issues', 'select=id&limit=1'))[0].id;
    questionIds = (await readBack<{ id: string }>('civic_quiz_questions', 'select=id&limit=3&order=id')).map((q) => q.id);
  });

  // ─── Voter basics ────────────────────────────────────────────────────────
  it('voter follows a candidate -> saved, and the candidate owner is notified; unfollow removes it', async () => {
    as(VOTER);
    const { follow, unfollow } = await import('@/services/social');
    await follow('candidate', TESS);
    expect(await readBack('follows', `user_id=eq.${VOTER.id}&followable_id=eq.${TESS}&select=followable_type`)).toEqual([{ followable_type: 'candidate' }]);
    expect((await notificationsFor(OWNER.id, 'new_follower')).length).toBeGreaterThan(0);
    await unfollow('candidate', TESS);
    expect(await readBack('follows', `user_id=eq.${VOTER.id}&followable_id=eq.${TESS}&select=id`)).toEqual([]);
    await follow('candidate', TESS); // keep following for the feed test below
  });

  it('voter saves a candidate and a race', async () => {
    as(VOTER);
    const { saveCandidate, saveRace } = await import('@/services/districts');
    await saveCandidate(TESS);
    await saveRace(CONTEST);
    expect(await readBack('saved_candidates', `user_id=eq.${VOTER.id}&select=candidate_id`)).toEqual([{ candidate_id: TESS }]);
    expect(await readBack('saved_races', `user_id=eq.${VOTER.id}&select=contest_id`)).toEqual([{ contest_id: CONTEST }]);
  });

  it('voter location saves, and a second save updates the same row', async () => {
    as(VOTER);
    const { saveLocation } = await import('@/services/districts');
    await saveLocation('99901', 'Testville', 'Testland', 'Test County');
    await saveLocation('99902', 'Otherville', 'Testland', 'Test County');
    expect(await readBack('locations', `user_id=eq.${VOTER.id}&select=zip_code,city`)).toEqual([{ zip_code: '99902', city: 'Otherville' }]);
  });

  it('notification preferences save and update', async () => {
    as(VOTER);
    const { updateNotificationPreferences } = await import('@/services/notification-preferences');
    await updateNotificationPreferences({ digest_frequency: 'daily' } as never);
    await updateNotificationPreferences({ digest_frequency: 'weekly', instant_election_reminders: false } as never);
    expect(await readBack('notification_preferences', `user_id=eq.${VOTER.id}&select=digest_frequency,instant_election_reminders`))
      .toEqual([{ digest_frequency: 'weekly', instant_election_reminders: false }]);
  });

  it('voter quiz answers save', async () => {
    as(VOTER);
    const { saveUserQuizAnswers } = await import('@/services/quiz');
    const r = await saveUserQuizAnswers(VOTER.id, questionIds.map((id) => ({ question_id: id, answer: 'a' as const })));
    expect(r.success, r.error).toBe(true);
    expect((await readBack('user_quiz_answers', `user_id=eq.${VOTER.id}&select=question_id`)).length).toBe(questionIds.length);
  });

  it('election journey step saves and can be unticked', async () => {
    as(VOTER);
    const { toggleJourneyStep } = await import('@/services/voter-profile');
    expect((await toggleJourneyStep(1, true)).success).toBe(true);
    expect((await readBack('election_journey_steps', `user_id=eq.${VOTER.id}&step_number=eq.1&select=completed`))[0]?.completed).toBe(true);
    expect((await toggleJourneyStep(1, false)).success).toBe(true);
    expect((await readBack('election_journey_steps', `user_id=eq.${VOTER.id}&step_number=eq.1&select=completed`))[0]?.completed).toBe(false);
  });

  // ─── Q&A ─────────────────────────────────────────────────────────────────
  it('voter asks a question; only the candidate owner can answer it; voter rates it', async () => {
    as(VOTER);
    const { askQuestion, answerQuestion, rateQuestion } = await import('@/services/social');
    await askQuestion(TESS, 'Will you fund the library?', issueId);
    const [q] = await readBack<{ id: string }>('voter_questions', `candidate_id=eq.${TESS}&user_id=eq.${VOTER.id}&select=id`);
    expect(q).toBeTruthy();

    await expect(answerQuestion(q.id, 'Yes, says the voter pretending to be Tess')).rejects.toThrow();
    as(OWNER);
    await answerQuestion(q.id, 'Yes - fully, in my first budget.');
    expect((await readBack('voter_questions', `id=eq.${q.id}&select=answer_text`))[0].answer_text).toBe('Yes - fully, in my first budget.');

    as(VOTER);
    await rateQuestion(q.id, 'helpful', true);
    expect((await readBack('question_ratings', `question_id=eq.${q.id}&user_id=eq.${VOTER.id}&select=rating_type`))).toEqual([{ rating_type: 'helpful' }]);
  });

  // ─── Messaging ───────────────────────────────────────────────────────────
  it('voter messages the candidate: message saved, owner notified; reply notifies the voter; read receipts save', async () => {
    as(VOTER);
    const { getOrCreateConversation, sendMessage, markConversationRead } = await import('@/services/messaging');
    const conv = await getOrCreateConversation(TESS);
    expect(conv?.id).toBeTruthy();
    expect(await sendMessage(conv!.id, 'Hi Tess, what about bus lanes?', 'voter')).toBeTruthy();
    expect((await readBack('messages', `conversation_id=eq.${conv!.id}&select=body`)).map((m) => m.body)).toContain('Hi Tess, what about bus lanes?');
    expect((await notificationsFor(OWNER.id, 'new_message')).length).toBeGreaterThan(0);

    as(OWNER);
    expect(await sendMessage(conv!.id, 'Yes - on Main St first.', 'candidate')).toBeTruthy();
    expect((await notificationsFor(VOTER.id, 'new_message')).length).toBeGreaterThan(0);
    await markConversationRead(conv!.id, false);
    expect((await readBack('conversations', `id=eq.${conv!.id}&select=candidate_read_at`))[0].candidate_read_at).not.toBeNull();
  });

  // ─── Feed ────────────────────────────────────────────────────────────────
  it('owner posts an update: saved, followers notified; voter likes and unlikes; owner deletes', async () => {
    as(OWNER);
    const { createFeedPost, togglePostLike, deleteFeedPost } = await import('@/services/social');
    await createFeedPost(TESS, 'Canvassing Saturday at 10.');
    const [post] = await readBack<{ id: string }>('feed_posts', `candidate_id=eq.${TESS}&body=eq.Canvassing Saturday at 10.&select=id`);
    expect(post).toBeTruthy();
    expect((await notificationsFor(VOTER.id, 'new_post')).length).toBeGreaterThan(0);

    as(VOTER);
    await togglePostLike(post.id, true);
    expect(await readBack('post_likes', `post_id=eq.${post.id}&user_id=eq.${VOTER.id}&select=post_id`)).toHaveLength(1);
    await togglePostLike(post.id, false);
    expect(await readBack('post_likes', `post_id=eq.${post.id}&user_id=eq.${VOTER.id}&select=post_id`)).toHaveLength(0);

    as(OWNER);
    await deleteFeedPost(post.id);
    expect(await readBack('feed_posts', `id=eq.${post.id}&select=id`)).toEqual([]);
  });

  it('notifications can be marked read, one and all', async () => {
    as(VOTER);
    const { markNotificationRead, markAllNotificationsRead } = await import('@/services/social');
    const [n] = await notificationsFor(VOTER.id, 'new_message');
    await markNotificationRead(n.id);
    expect((await readBack('notifications', `id=eq.${n.id}&select=is_read`))[0].is_read).toBe(true);
    await markAllNotificationsRead();
    expect(await readBack('notifications', `user_id=eq.${VOTER.id}&is_read=eq.false&select=id`)).toEqual([]);
  });

  // ─── Team ────────────────────────────────────────────────────────────────
  it('owner invites an existing user to the team: linked and active immediately', async () => {
    as(OWNER);
    const { inviteTeamMember } = await import('@/services/social');
    const r = await inviteTeamMember(TESS, VOTER.email, 'volunteer');
    expect(r.linkedImmediately).toBe(true);
    expect(await readBack('campaign_team', `candidate_id=eq.${TESS}&user_id=eq.${VOTER.id}&select=status,role`)).toEqual([{ status: 'active', role: 'volunteer' }]);
  });

  // ─── Fact-checks, reports, claims, tags ──────────────────────────────────
  it('voter submits a fact-check (pending) and a content report; admin dismisses the report', async () => {
    as(VOTER);
    const { submitFactCheck } = await import('@/services/civic');
    const { submitContentReport, markReportReviewed } = await import('@/services/content-reports');
    await submitFactCheck('Testland has the lowest taxes in the nation.', 'https://news.example/x', 'news');
    expect((await readBack('fact_checks', `claim_text=eq.Testland has the lowest taxes in the nation.&select=status`))[0].status).toBe('pending');

    await submitContentReport('candidate', TESS, 'Inaccurate information', 'Party looks wrong');
    const [rep] = await readBack<{ id: string; status: string }>('content_reports', `user_id=eq.${VOTER.id}&select=id,status`);
    expect(rep.status).toBe('pending');
    as(ADMIN);
    await markReportReviewed(rep.id, 'dismissed');
    expect((await readBack('content_reports', `id=eq.${rep.id}&select=status`))[0].status).toBe('dismissed');
  });

  it('community tag can be added and removed', async () => {
    as(VOTER);
    const { addTag, removeTag } = await import('@/services/tags');
    const a = await addTag(TESS, 'transit');
    expect(a.success, a.error).toBe(true);
    expect((await readBack('candidate_tags', `candidate_id=eq.${TESS}&tag=eq.transit&select=tag`))).toHaveLength(1);
    const r = await removeTag(TESS, 'transit');
    expect(r.success, r.error).toBe(true);
    expect((await readBack('candidate_tags', `candidate_id=eq.${TESS}&tag=eq.transit&select=tag`))).toHaveLength(0);
  });

  // ─── Promises (proposal -> admin) and claim analysis ─────────────────────
  it('owner adds a promise; a status change is a proposal until an admin applies it', async () => {
    as(OWNER);
    const { addCandidatePromise, proposePromiseStatus, updatePromiseStatus } = await import('@/services/civic');
    await addCandidatePromise(TESS, 'Ten-minute buses on Main St', '2026-01-10', 'https://tess.example/plan', issueId);
    const [pr] = await readBack<{ id: string; status: string }>('candidate_promises', `candidate_id=eq.${TESS}&select=id,status`);
    expect(pr).toBeTruthy();
    const before = pr.status;
    // Candidates can't set the status themselves (the database refuses)...
    await expect(updatePromiseStatus(pr.id, 'completed' as never)).rejects.toThrow(/reviewers/);
    // ...they propose it, which is what the Promises tab calls.
    await proposePromiseStatus(pr.id, 'completed' as never, 'Buses running every 10 min', 'https://city.example/buses');
    expect((await readBack('candidate_promises', `id=eq.${pr.id}&select=status,proposed_status`))[0]).toEqual({ status: before, proposed_status: 'completed' });

    as(ADMIN);
    const { getPromiseProposals, applyPromiseProposal } = await import('@/services/admin');
    const proposal = (await getPromiseProposals()).find((p) => p.id === pr.id || (p as unknown as { promise_id?: string }).promise_id === pr.id);
    expect(proposal, 'the proposal should be visible to admins').toBeTruthy();
    await applyPromiseProposal(proposal!);
    expect((await readBack('candidate_promises', `id=eq.${pr.id}&select=status`))[0].status).toBe('completed');
  });

  it('owner claim analysis saves as pending review', async () => {
    as(OWNER);
    const { addClaimAnalysis } = await import('@/services/civic');
    await addClaimAnalysis(TESS, 'We will cut commute times', true, { plan_details: 'Bus lanes' } as never);
    const rows = await readBack<{ review_status: string }>('candidate_claim_analysis', `candidate_id=eq.${TESS}&select=review_status`);
    expect(rows.map((r) => r.review_status)).toContain('pending');
  });

  // ─── Advertising ─────────────────────────────────────────────────────────
  it('advertiser profile and ad save; submitted ad becomes pending; admin approves it', async () => {
    as(VOTER);
    const { createAdvertiserProfile, createAd, submitAdForReview } = await import('@/services/advertising');
    // Exactly what AdvertiserDashboardPage sends (user_id comes from the column default auth.uid()).
    const adv = await createAdvertiserProfile({ organization_name: 'Testland Bakery', contact_email: VOTER.email, website_url: null } as never);
    expect(adv?.id, 'advertiser profile should save').toBeTruthy();
    const ad = await createAd({ advertiser_id: adv!.id, campaign_name: 'Fall', ad_title: 'Fresh bread', ad_description: null, destination_url: 'https://bakery.example', placement: 'homepage', ad_type: 'banner', status: 'draft' } as never);
    expect(ad?.id, 'ad should save').toBeTruthy();
    await submitAdForReview(ad!.id);
    expect((await readBack('advertisements', `id=eq.${ad!.id}&select=status`))[0].status).toBe('pending');

    as(ADMIN);
    const { approveAd } = await import('@/services/admin');
    await approveAd(ad!.id);
    expect((await readBack('advertisements', `id=eq.${ad!.id}&select=status`))[0].status).not.toBe('pending');
  });

  // ─── Ask AI answers from real data ───────────────────────────────────────
  it('Ask AI answers "who is running" from real races, and matches candidates by whole name', async () => {
    as(null);
    const { askBallotLensAI } = await import('@/services/ai');
    const running = await askBallotLensAI('Who is running for Testland House 1?');
    expect(running.answer).toMatch(/Tess Landry/);
    expect(running.answer).not.toMatch(/Taylor Brooks/); // leftover sample candidate never listed

    const byName = await askBallotLensAI('What has Tess Landry said?');
    expect(byName.answer).toMatch(/Tess Landry/);
    const nobody = await askBallotLensAI('What will happen to taxes?');
    expect(nobody.answer).toMatch(/specify a candidate/);
  });
});
