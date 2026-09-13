import { supabase } from '@/lib/supabase';

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
}

export async function flagPositionOutdated(positionId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_positions')
    .update({ verification_status: 'not_verified' })
    .eq('id', positionId);
  if (error) throw error;
}

export async function addCandidate(candidate: {
  first_name: string;
  last_name: string;
  party: string;
  bio: string;
  is_demo?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('candidates').insert({
    ...candidate,
    is_demo: candidate.is_demo ?? true,
  });
  if (error) throw error;
}

export async function addElection(election: {
  name: string;
  election_date: string;
  description: string;
}): Promise<void> {
  const { error } = await supabase.from('elections').insert(election);
  if (error) throw error;
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
  const { error } = await supabase.from('sources').insert({
    credibility_level: 'secondary',
    ...source,
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
