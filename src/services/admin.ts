import { supabase } from '@/lib/supabase';

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
  verifiedClaims: number;
  unverifiedClaims: number;
  users: number;
} | null> {
  const [
    { count: candidates },
    { count: elections },
    { count: ballotContests },
    { count: sources },
    { count: verifiedClaims },
    { count: unverifiedClaims },
    { count: users },
  ] = await Promise.all([
    supabase.from('candidates').select('*', { count: 'exact', head: true }),
    supabase.from('elections').select('*', { count: 'exact', head: true }),
    supabase.from('ballot_contests').select('*', { count: 'exact', head: true }),
    supabase.from('sources').select('*', { count: 'exact', head: true }),
    supabase.from('candidate_positions').select('*', { count: 'exact', head: true }).eq('verification_status', 'verified'),
    supabase.from('candidate_positions').select('*', { count: 'exact', head: true }).neq('verification_status', 'verified'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ]);

  return {
    candidates: candidates ?? 0,
    elections: elections ?? 0,
    ballotContests: ballotContests ?? 0,
    sources: sources ?? 0,
    verifiedClaims: verifiedClaims ?? 0,
    unverifiedClaims: unverifiedClaims ?? 0,
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
 * a single audit log entry summarizing the import, rather than one per row. */
export async function bulkImportCandidates(rows: Array<{
  first_name: string;
  last_name: string;
  party?: string;
  bio?: string;
  photo_url?: string | null;
}>): Promise<{ inserted: number }> {
  const payload = rows.map((r) => ({
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
    names: rows.map((r) => `${r.first_name} ${r.last_name}`),
  });
  return { inserted: data?.length ?? 0 };
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
