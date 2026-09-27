import { supabase } from '@/lib/supabase';
import type { CandidateClaim } from '@/types';

/** Writes one row to `audit_log` via the SECURITY DEFINER `log_admin_action` RPC.
 * Never throws — a logging failure should not block the admin's actual action. */
async function logAdminAction(action: string, targetTable?: string, targetId?: string, details?: Record<string, unknown>) {
  try {
    await supabase.rpc('log_admin_action', {
      p_action: action,
      p_target_table: targetTable ?? null,
      p_target_id: targetId ?? null,
      p_details: details ?? null,
    });
  } catch {
    // Swallow — audit logging is best-effort and must not break the admin flow.
  }
}

export async function getAdminMetrics(): Promise<{
  candidates: number;
  elections: number;
  ballotContests: number;
  sources: number;
  verifiedPositions: number;
  unverifiedPositions: number;
  pendingProfileClaims: number;
  users: number;
} | null> {
  const [
    { count: candidates },
    { count: elections },
    { count: ballotContests },
    { count: sources },
    { count: verifiedPositions },
    { count: unverifiedPositions },
    { count: pendingProfileClaims },
    { count: users },
  ] = await Promise.all([
    supabase.from('candidates').select('*', { count: 'exact', head: true }),
    supabase.from('elections').select('*', { count: 'exact', head: true }),
    supabase.from('ballot_contests').select('*', { count: 'exact', head: true }),
    supabase.from('sources').select('*', { count: 'exact', head: true }),
    supabase.from('candidate_positions').select('*', { count: 'exact', head: true }).eq('verification_status', 'verified'),
    supabase.from('candidate_positions').select('*', { count: 'exact', head: true }).neq('verification_status', 'verified'),
    supabase.from('candidate_claims').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ]);

  return {
    candidates: candidates ?? 0,
    elections: elections ?? 0,
    ballotContests: ballotContests ?? 0,
    sources: sources ?? 0,
    verifiedPositions: verifiedPositions ?? 0,
    unverifiedPositions: unverifiedPositions ?? 0,
    pendingProfileClaims: pendingProfileClaims ?? 0,
    users: users ?? 0,
  };
}

export async function getUnverifiedPositions() {
  const { data, error } = await supabase
    .from('candidate_positions')
    .select(`
      id, summary, verification_status,
      candidate:candidates(id, first_name, last_name),
      issue:issues(id, name)
    `)
    .neq('verification_status', 'verified')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function verifyPosition(positionId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_positions')
    .update({ verification_status: 'verified' })
    .eq('id', positionId);
  if (error) throw error;
  await logAdminAction('verify_position', 'candidate_positions', positionId);
}

export async function flagPositionOutdated(positionId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_positions')
    .update({ verification_status: 'not_verified' })
    .eq('id', positionId);
  if (error) throw error;
  await logAdminAction('flag_position_outdated', 'candidate_positions', positionId);
}

export async function addCandidate(candidate: {
  first_name: string;
  last_name: string;
  party: string;
  bio: string;
  photo_url?: string | null;
  is_demo?: boolean;
}): Promise<void> {
  const { data, error } = await supabase
    .from('candidates')
    .insert({ ...candidate, is_demo: candidate.is_demo ?? true })
    .select('id')
    .single();
  if (error) throw error;
  await logAdminAction('add_candidate', 'candidates', data?.id, { first_name: candidate.first_name, last_name: candidate.last_name });
}

/** List candidates for the admin "manage" table, most recently added first. */
export async function listCandidatesForAdmin(): Promise<Array<{
  id: string; first_name: string; last_name: string; party: string | null; photo_url: string | null; is_demo: boolean;
}>> {
  const { data, error } = await supabase
    .from('candidates')
    .select('id, first_name, last_name, party, photo_url, is_demo')
    .order('last_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateCandidate(
  id: string,
  updates: Partial<{ first_name: string; last_name: string; party: string; bio: string; photo_url: string | null }>
): Promise<void> {
  const { error } = await supabase.from('candidates').update(updates).eq('id', id);
  if (error) throw error;
  await logAdminAction('update_candidate', 'candidates', id, updates);
}

export async function deleteCandidate(id: string): Promise<void> {
  const { error } = await supabase.from('candidates').delete().eq('id', id);
  if (error) throw error;
  await logAdminAction('delete_candidate', 'candidates', id);
}

/** Bulk-inserts candidates (from a CSV/JSON import) in one request and writes
 * a single audit log entry summarizing the import, rather than one per row.
 * Skips any row that matches an existing candidate's name (case-insensitive)
 * rather than silently creating a duplicate profile — re-importing the same
 * file, or an overlapping file, previously had no protection against this. */
export async function bulkImportCandidates(rows: Array<{
  first_name: string;
  last_name: string;
  party?: string;
  bio?: string;
  photo_url?: string | null;
}>): Promise<{ inserted: number; skippedDuplicates: string[] }> {
  const { data: existing } = await supabase.from('candidates').select('first_name, last_name');
  const existingNames = new Set(
    (existing ?? []).map((c) => `${c.first_name.trim().toLowerCase()}|${c.last_name.trim().toLowerCase()}`)
  );

  const skippedDuplicates: string[] = [];
  const newRows = rows.filter((r) => {
    const key = `${r.first_name.trim().toLowerCase()}|${r.last_name.trim().toLowerCase()}`;
    if (existingNames.has(key)) {
      skippedDuplicates.push(`${r.first_name} ${r.last_name}`);
      return false;
    }
    existingNames.add(key); // also catch duplicates within the same import file
    return true;
  });

  if (newRows.length === 0) {
    return { inserted: 0, skippedDuplicates };
  }

  const payload = newRows.map((r) => ({
    first_name: r.first_name,
    last_name: r.last_name,
    party: r.party || null,
    bio: r.bio || null,
    photo_url: r.photo_url || null,
    is_demo: false,
  }));
  const { data, error } = await supabase.from('candidates').insert(payload).select('id');
  if (error) throw error;
  await logAdminAction('bulk_import_candidates', 'candidates', undefined, {
    count: data?.length ?? 0,
    names: newRows.map((r) => `${r.first_name} ${r.last_name}`),
    skippedDuplicates,
  });
  return { inserted: data?.length ?? 0, skippedDuplicates };
}

export async function addElection(election: {
  name: string;
  election_date: string;
  description: string;
}): Promise<void> {
  const { data, error } = await supabase.from('elections').insert(election).select('id').single();
  if (error) throw error;
  await logAdminAction('add_election', 'elections', data?.id, { name: election.name });
}

export async function addBallotContest(contest: {
  election_id: string;
  office_name: string;
  contest_level: string;
  district_id?: string;
  seat_description?: string;
  term_length?: string;
}): Promise<void> {
  const { error } = await supabase.from('ballot_contests').insert(contest);
  if (error) throw error;
}

export async function addSource(source: {
  title: string;
  url?: string;
  publisher?: string;
  source_type: string;
  publication_date?: string;
  author?: string;
  description?: string;
  credibility_level?: string;
}): Promise<void> {
  const { data, error } = await supabase
    .from('sources')
    .insert({ credibility_level: 'secondary', ...source })
    .select('id')
    .single();
  if (error) throw error;
  await logAdminAction('add_source', 'sources', data?.id, { title: source.title });
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase.from('sources').delete().eq('id', id);
  if (error) throw error;
  await logAdminAction('delete_source', 'sources', id);
}

export async function deleteElection(id: string): Promise<void> {
  const { error } = await supabase.from('elections').delete().eq('id', id);
  if (error) throw error;
  await logAdminAction('delete_election', 'elections', id);
}

export async function deleteBallotMeasure(id: string): Promise<void> {
  const { error } = await supabase.from('ballot_measures').delete().eq('id', id);
  if (error) throw error;
  await logAdminAction('delete_ballot_measure', 'ballot_measures', id);
}

/** Pending candidate self-service submissions (bio, photo, links, etc) for admin review. */
export async function listPendingSubmissions(): Promise<Array<{
  id: string; candidate_id: string; field_name: string; field_value: string | null; submitted_at: string;
}>> {
  const { data, error } = await supabase
    .from('candidate_submissions')
    .select('id, candidate_id, field_name, field_value, submitted_at')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Approves a submission via the SECURITY DEFINER RPC, which also writes the
 * value onto the live candidate row when the field maps to one directly. */
export async function approveSubmission(id: string): Promise<{ applied_to_candidates: boolean; field_name: string }> {
  const { data, error } = await supabase.rpc('apply_candidate_submission', { p_submission_id: id });
  if (error) throw error;
  return data as { applied_to_candidates: boolean; field_name: string };
}

export async function rejectSubmission(id: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('reject_candidate_submission', { p_submission_id: id, p_notes: notes ?? null });
  if (error) throw error;
}

/** Grants a candidate free ("comped") Candidate Management access — for the
 * client's stated beta-year plan (first year free while testing) — without
 * needing a real Stripe charge. Creates or updates the row with is_comped=true
 * and status='active' so has_active_management() (used by the paywall on
 * team invites AND the campaign page) treats it exactly like a paid sub. */
/** Grants free ("comped") Candidate Management access — used for the
 * client's stated first-year-free beta plan. Sets a 1-year period end so
 * the grant has an actual expiration date recorded, rather than staying
 * active forever with no way to track when it's supposed to end (an admin
 * previously had to remember to manually revoke each comp individually,
 * with nothing in the system tracking who was even due). Does not, by
 * itself, revoke access when that date passes — see expireOverdueComps(). */
export async function compCandidateManagement(candidateId: string, reason: string): Promise<void> {
  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const { error } = await supabase
    .from('candidate_management_subscriptions')
    .upsert({
      candidate_id: candidateId,
      status: 'active',
      is_comped: true,
      comped_reason: reason,
      current_period_start: now.toISOString(),
      current_period_end: oneYearFromNow.toISOString(),
    }, { onConflict: 'candidate_id' });
  if (error) throw error;
  await logAdminAction('comp_candidate_management', 'candidate_management_subscriptions', candidateId, { reason, expiresAt: oneYearFromNow.toISOString() });
}

/** Revokes a comped (or any) Management grant, e.g. when the beta period ends. */
export async function revokeCandidateManagement(candidateId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_management_subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('candidate_id', candidateId);
  if (error) throw error;
  await logAdminAction('revoke_candidate_management', 'candidate_management_subscriptions', candidateId);
}

/** Finds comped grants whose 1-year period has passed and flips them to
 * 'expired' — nothing does this automatically (no cron job exists in this
 * project yet), so this is an admin-triggered check, matching the same
 * manual-trigger pattern already used for digest emails and election
 * reminders. Only touches comped rows, never real paying subscriptions
 * (those are entirely Stripe-driven). */
export async function expireOverdueComps(): Promise<{ expiredCount: number; expiredCandidateNames: string[] }> {
  const { data: overdue, error: fetchError } = await supabase
    .from('candidate_management_subscriptions')
    .select('candidate_id, candidates(first_name, last_name)')
    .eq('is_comped', true)
    .eq('status', 'active')
    .lt('current_period_end', new Date().toISOString());
  if (fetchError) throw fetchError;
  if (!overdue || overdue.length === 0) return { expiredCount: 0, expiredCandidateNames: [] };

  const ids = overdue.map((r) => r.candidate_id);
  const { error: updateError } = await supabase
    .from('candidate_management_subscriptions')
    .update({ status: 'expired' })
    .in('candidate_id', ids);
  if (updateError) throw updateError;

  const names = (overdue as unknown as Array<{ candidates: { first_name: string; last_name: string } | null }>)
    .map((r) => r.candidates ? `${r.candidates.first_name} ${r.candidates.last_name}` : 'Unknown candidate');
  await logAdminAction('expire_overdue_comps', 'candidate_management_subscriptions', undefined, { count: ids.length, names });
  return { expiredCount: ids.length, expiredCandidateNames: names };
}

/** For the admin "Manage Candidates" list: which candidates currently have
 * active (paid or comped) Candidate Management. */
export async function listActiveManagementCandidateIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('candidate_management_subscriptions')
    .select('candidate_id')
    .eq('status', 'active');
  if (error) return [];
  return (data ?? []).map((r) => r.candidate_id);
}

export interface BillingOverview {
  totalUsers: number;
  freeUsers: number;
  paidUsers: number;
  byPlan: Record<string, number>;
  managementActive: number;
  managementComped: number;
  recentSubscriptions: Array<{
    id: string; plan: string; status: string; created_at: string;
    current_period_end: string | null; full_name: string | null;
  }>;
}

/** Admin-only billing snapshot for the "Billing Overview" tab: how many
 * users are on each paid tier vs free, and a recent-activity list. Relies
 * on the admin-widened SELECT policy on `subscriptions` (own row OR is_admin). */
export async function getBillingOverview(): Promise<BillingOverview> {
  const [{ count: totalUsers }, { data: subs }, { data: mgmt }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('id, plan, status, created_at, current_period_end, user_id'),
    supabase.from('candidate_management_subscriptions').select('status, is_comped'),
  ]);

  const rows = subs ?? [];
  const byPlan: Record<string, number> = {};
  let paidUsers = 0;
  for (const row of rows) {
    if (row.status === 'active' && row.plan !== 'free') {
      byPlan[row.plan] = (byPlan[row.plan] ?? 0) + 1;
      paidUsers++;
    }
  }

  const managementRows = mgmt ?? [];
  const managementActive = managementRows.filter((m) => m.status === 'active' && !m.is_comped).length;
  const managementComped = managementRows.filter((m) => m.status === 'active' && m.is_comped).length;

  // Attach names for the recent list — fetch profiles for the subscribers involved.
  const recentUserIds = rows
    .filter((r) => r.plan !== 'free')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20)
    .map((r) => r.user_id);

  const { data: profiles } = recentUserIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', recentUserIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const recentSubscriptions = rows
    .filter((r) => r.plan !== 'free')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20)
    .map((r) => ({
      id: r.id, plan: r.plan, status: r.status, created_at: r.created_at,
      current_period_end: r.current_period_end, full_name: nameById.get(r.user_id) ?? null,
    }));

  return {
    totalUsers: totalUsers ?? 0,
    freeUsers: (totalUsers ?? 0) - paidUsers,
    paidUsers,
    byPlan,
    managementActive,
    managementComped,
    recentSubscriptions,
  };
}

export async function getAuditLog(limit = 50): Promise<Array<{
  id: string; admin_id: string | null; action: string; target_table: string | null;
  target_id: string | null; details: Record<string, unknown> | null; created_at: string;
}>> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** All profiles, for the "Manage Admins" screen. Relies on the admin-read-all
 * RLS policy added alongside `set_admin_role`. */
export async function listProfilesForAdmin(): Promise<Array<{ id: string; full_name: string | null; is_admin: boolean }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, is_admin')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Grants or revokes admin status via the SECURITY DEFINER `set_admin_role` RPC.
 * The RPC itself re-checks that the caller is an admin and blocks self-demotion,
 * so this never reopens the privilege-escalation issue that was patched at the DB level. */
export async function setAdminRole(targetUserId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_admin_role', {
    target_user_id: targetUserId,
    new_is_admin: isAdmin,
  });
  if (error) throw error;
}

export async function addBallotMeasure(measure: {
  election_id: string;
  title: string;
  measure_type: string;
  summary?: string;
  arguments_for?: string;
  arguments_against?: string;
}): Promise<void> {
  const { error } = await supabase.from('ballot_measures').insert(measure);
  if (error) throw error;
}

export async function addVotingRecord(record: {
  candidate_id: string;
  bill_name: string;
  bill_number?: string;
  vote: string;
  vote_date?: string;
  chamber?: string;
  description?: string;
  source_id?: string;
}): Promise<void> {
  const { error } = await supabase.from('voting_records').insert(record);
  if (error) throw error;
}

export async function addCandidatePosition(position: {
  candidate_id: string;
  issue_id: string;
  summary: string;
  verification_status?: string;
}): Promise<void> {
  const { error } = await supabase.from('candidate_positions').insert({
    verification_status: 'not_verified',
    ...position,
  });
  if (error) throw error;
}

export interface PendingClaim extends CandidateClaim {
  candidate?: { first_name: string; last_name: string; party: string | null };
}

/** Admin-only: every pending candidate profile claim awaiting review. This
 * is the actual "claim a profile" approval queue — separate from the
 * unverified-positions review and the candidate_submissions (bio/photo
 * edit) review, which are different workflows entirely despite the
 * similar-sounding name. */
export async function getPendingClaims(): Promise<PendingClaim[]> {
  const { data, error } = await supabase
    .from('candidate_claims')
    .select('*, candidate:candidates(first_name, last_name, party)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as PendingClaim[];
}

export async function approveClaim(claimId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_claims')
    .update({ status: 'verified', reviewed_at: new Date().toISOString() })
    .eq('id', claimId);
  if (error) throw error;
  await logAdminAction('approve_claim', 'candidate_claims', claimId);
}

export async function rejectClaim(claimId: string, adminNotes?: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_claims')
    .update({ status: 'rejected', admin_notes: adminNotes ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', claimId);
  if (error) throw error;
  await logAdminAction('reject_claim', 'candidate_claims', claimId);
}

export interface PendingEvent {
  id: string; candidate_id: string; title: string; description: string | null;
  event_date: string; start_time: string | null; end_time: string | null;
  location_name: string | null; virtual_url: string | null; submitted_at: string;
  candidate?: { first_name: string; last_name: string };
}

/** Admin-only: candidate-submitted events awaiting review. Previously there
 * was no admin RLS access to this table at all — submitted events could
 * never be approved by anyone, through the app or otherwise. */
export async function getPendingEvents(): Promise<PendingEvent[]> {
  const { data, error } = await supabase
    .from('candidate_events')
    .select('*, candidate:candidates(first_name, last_name)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as PendingEvent[];
}

export async function approveEvent(id: string): Promise<void> {
  const { error } = await supabase.from('candidate_events').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await logAdminAction('approve_event', 'candidate_events', id);
}

export async function rejectEvent(id: string, notes?: string): Promise<void> {
  const { error } = await supabase.from('candidate_events').update({ status: 'rejected', admin_notes: notes ?? null, reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await logAdminAction('reject_event', 'candidate_events', id);
}

export interface PendingQuestionnaireResponse {
  id: string; candidate_id: string; question: string; answer: string | null; submitted_at: string;
  candidate?: { first_name: string; last_name: string };
}

/** Admin-only: candidate Q&A responses awaiting review. Same previously-
 * missing-admin-access gap as events. */
export async function getPendingQuestionnaireResponses(): Promise<PendingQuestionnaireResponse[]> {
  const { data, error } = await supabase
    .from('candidate_questionnaire_responses')
    .select('*, candidate:candidates(first_name, last_name)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as PendingQuestionnaireResponse[];
}

export async function approveQuestionnaireResponse(id: string): Promise<void> {
  const { error } = await supabase.from('candidate_questionnaire_responses').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await logAdminAction('approve_questionnaire_response', 'candidate_questionnaire_responses', id);
}

export async function rejectQuestionnaireResponse(id: string, notes?: string): Promise<void> {
  const { error } = await supabase.from('candidate_questionnaire_responses').update({ status: 'rejected', admin_notes: notes ?? null, reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await logAdminAction('reject_questionnaire_response', 'candidate_questionnaire_responses', id);
}

export interface PendingAd {
  id: string; campaign_name: string; ad_title: string; ad_description: string | null;
  destination_url: string; placement: string; ad_type: string; submitted_at?: string;
  advertiser?: { organization_name: string; contact_email: string };
}

/** Admin-only: advertiser-submitted ads awaiting content review before they
 * can ever go live to real voters. */
export async function getPendingAds(): Promise<PendingAd[]> {
  const { data, error } = await supabase
    .from('advertisements')
    .select('*, advertiser:advertisers(organization_name, contact_email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as PendingAd[];
}

export async function approveAd(id: string): Promise<void> {
  const { error } = await supabase.from('advertisements').update({ status: 'active' }).eq('id', id);
  if (error) throw error;
  await logAdminAction('approve_ad', 'advertisements', id);
}

export async function rejectAd(id: string, notes?: string): Promise<void> {
  const { error } = await supabase.from('advertisements').update({ status: 'rejected', admin_notes: notes ?? null }).eq('id', id);
  if (error) throw error;
  await logAdminAction('reject_ad', 'advertisements', id);
}

export interface UnresearchedClaim {
  id: string; claim_text: string; created_at: string;
  candidate?: { first_name: string; last_name: string } | null;
}

/** Admin-only: claims still awaiting research (the default state a
 * submitted claim starts in). The Claims Library page and its
 * submitClaim() have existed with a fully correct, already-secure RLS
 * setup (public read, admin-only update) for a while, but nothing in the
 * app ever surfaced these for an admin to actually research and assess. */
export async function getUnresearchedClaims(): Promise<UnresearchedClaim[]> {
  const { data, error } = await supabase
    .from('claims')
    .select('id, claim_text, created_at, candidate:candidates(first_name, last_name)')
    .eq('assessment', 'insufficient_information')
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as UnresearchedClaim[];
}

export async function assessClaimInLibrary(
  claimId: string,
  assessment: 'supported' | 'unsupported' | 'requires_context' | 'insufficient_information',
  explanation: string
): Promise<void> {
  const { error } = await supabase.from('claims').update({ assessment, explanation }).eq('id', claimId);
  if (error) throw error;
  await logAdminAction('assess_claim', 'claims', claimId, { assessment });
}

export interface RevenueSummary {
  totalCents: number;
  last30DaysCents: number;
  byType: Record<string, number>;
  recentPayments: Array<{ id: string; amount: number; payment_type: string; description: string | null; created_at: string }>;
}

/** Admin-only: actual revenue totals from Stripe payments. payments.amount
 * (and revenue_transactions.amount_cents) are stored in CENTS, matching
 * Stripe's native format -- previously nothing in the app summed or
 * displayed this at all; the Billing Overview only ever counted active
 * subscriptions by plan, never a dollar figure, even though every payment
 * has been recorded here (14+ rows) since the Stripe integration went live. */
export async function getRevenueSummary(): Promise<RevenueSummary> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: allPayments } = await supabase
    .from('payments')
    .select('id, amount, payment_type, description, created_at')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false });

  const rows = allPayments ?? [];
  const totalCents = rows.reduce((sum, p) => sum + p.amount, 0);
  const last30DaysCents = rows
    .filter((p) => p.created_at >= thirtyDaysAgo)
    .reduce((sum, p) => sum + p.amount, 0);

  const byType: Record<string, number> = {};
  for (const p of rows) {
    byType[p.payment_type] = (byType[p.payment_type] ?? 0) + p.amount;
  }

  return {
    totalCents,
    last30DaysCents,
    byType,
    recentPayments: rows.slice(0, 15),
  };
}

export interface BallotContestOption {
  id: string; office_name: string; contest_level: string; seat_description: string | null;
  election?: { name: string } | null;
}

/** Search existing ballot_contests by office name — used when linking a
 * candidate to the race they're actually running in. Critical step: a
 * candidate with no candidate_offices row never appears on anyone's
 * ballot, no matter how complete their profile is, since "My Ballot"
 * works entirely by matching a voter's district to ballot_contests and
 * from there to candidate_offices. */
export async function searchBallotContests(query: string): Promise<BallotContestOption[]> {
  let q = supabase
    .from('ballot_contests')
    .select('id, office_name, contest_level, seat_description, election:elections(name)')
    .order('office_name', { ascending: true })
    .limit(25);
  if (query.trim()) {
    q = q.ilike('office_name', `%${query.trim()}%`);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data as unknown as BallotContestOption[];
}

/** Links a candidate to the specific race (ballot_contest) they're running
 * in. Without this, a candidate created via the admin "Add Candidate" form
 * has a profile page but never shows up in anyone's ballot lookup. */
export async function linkCandidateToContest(candidateId: string, contestId: string, incumbent = false): Promise<void> {
  const { error } = await supabase.from('candidate_offices').insert({
    candidate_id: candidateId,
    contest_id: contestId,
    incumbent,
  });
  if (error) throw error;
  await logAdminAction('link_candidate_to_contest', 'candidate_offices', candidateId, { contestId });
}

export async function getCandidateContests(candidateId: string): Promise<BallotContestOption[]> {
  const { data, error } = await supabase
    .from('candidate_offices')
    .select('contest:ballot_contests(id, office_name, contest_level, seat_description, election:elections(name))')
    .eq('candidate_id', candidateId);
  if (error || !data) return [];
  return (data as unknown as { contest: BallotContestOption }[]).map((r) => r.contest).filter(Boolean);
}

export async function unlinkCandidateFromContest(candidateId: string, contestId: string): Promise<void> {
  const { error } = await supabase.from('candidate_offices').delete().eq('candidate_id', candidateId).eq('contest_id', contestId);
  if (error) throw error;
  await logAdminAction('unlink_candidate_from_contest', 'candidate_offices', candidateId, { contestId });
}
