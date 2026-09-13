import { supabase } from '@/lib/supabase';
import { demoCandidates } from '@/services/demo-data';
import { getStoredRegion } from '@/services/elections';
import { getAllRegionCandidates, getAllStatesCandidates } from '@/services/regions';
import type {
  Candidate, CandidatePosition, CandidateStatement,
  VotingRecord, Source, Issue, JudicialRecord,
} from '@/types';

export async function getCandidates(): Promise<Candidate[]> {
  try {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('last_name')
      .order('first_name');
    if (error) throw error;
    if (data && data.length > 0) return data as Candidate[];
  } catch {
    // Database unreachable — fall through to demo data
  }
  const region = getStoredRegion();
  if (region) {
    const regionCands = getAllRegionCandidates(region);
    if (regionCands.length > 0) return regionCands;
  }
  return getAllStatesCandidates();
}

export async function getCandidate(candidateId: string): Promise<Candidate | null> {
  try {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Candidate;
  } catch {
    // Database unreachable — fall through to demo data
  }
  const region = getStoredRegion();
  if (region) {
    const regionCand = getAllRegionCandidates(region).find((c) => c.id === candidateId);
    if (regionCand) return regionCand;
  }
  return getAllStatesCandidates().find((c) => c.id === candidateId) ?? null;
}

export async function getCandidatePositions(candidateId: string): Promise<CandidatePosition[]> {
  let positions;
  try {
    const res = await supabase
      .from('candidate_positions')
      .select('id, candidate_id, issue_id, summary, verification_status')
      .eq('candidate_id', candidateId);
    positions = res.data;
    if (res.error) throw res.error;
  } catch {
    return [];
  }
  if (!positions || positions.length === 0) return [];

  // Fetch issues separately
  const issueIds = [...new Set(positions.map((p) => p.issue_id).filter(Boolean))] as string[];
  const issueMap: Record<string, Issue> = {};
  if (issueIds.length > 0) {
    const { data: issues } = await supabase
      .from('issues')
      .select('id, name, slug, category, is_custom')
      .in('id', issueIds);
    (issues ?? []).forEach((i) => {
      issueMap[i.id] = i as Issue;
    });
  }

  // Fetch sources via candidate_sources join
  const positionIds = positions.map((p) => p.id);
  let sourcesByPosition: Record<string, Source[]> = {};

  if (positionIds.length > 0) {
    const { data: cs } = await supabase
      .from('candidate_sources')
      .select('candidate_position_id, source_id')
      .in('candidate_position_id', positionIds);

    const sourceIds = [...new Set((cs ?? []).map((c) => c.source_id).filter(Boolean))] as string[];
    let sourceMap: Record<string, Source> = {};

    if (sourceIds.length > 0) {
      const { data: srcs } = await supabase
        .from('sources')
        .select('*')
        .in('id', sourceIds);
      (srcs ?? []).forEach((s) => {
        sourceMap[s.id] = s as Source;
      });
    }

    (cs ?? []).forEach((c) => {
      const s = sourceMap[c.source_id];
      if (s) {
        if (!sourcesByPosition[c.candidate_position_id]) {
          sourcesByPosition[c.candidate_position_id] = [];
        }
        sourcesByPosition[c.candidate_position_id].push(s);
      }
    });
  }

  return positions.map((p) => ({
    ...p,
    issue: p.issue_id ? issueMap[p.issue_id] ?? null : null,
    sources: sourcesByPosition[p.id] ?? [],
  })) as unknown as CandidatePosition[];
}

export async function getCandidateSources(candidateId: string): Promise<Source[]> {
  // Get all sources linked to this candidate's positions
  const { data: positions } = await supabase
    .from('candidate_positions')
    .select('id')
    .eq('candidate_id', candidateId);

  const positionIds = (positions ?? []).map((p) => p.id);
  if (positionIds.length === 0) return [];

  const { data: cs } = await supabase
    .from('candidate_sources')
    .select('source_id')
    .in('candidate_position_id', positionIds);

  const sourceIds = [...new Set((cs ?? []).map((c) => c.source_id))];
  if (sourceIds.length === 0) return [];

  const { data: srcs } = await supabase
    .from('sources')
    .select('*')
    .in('id', sourceIds);

  return (srcs ?? []) as Source[];
}

export async function getCandidateStatements(candidateId: string): Promise<CandidateStatement[]> {
  let statements;
  try {
    const res = await supabase
      .from('candidate_statements')
      .select('id, candidate_id, issue_id, statement_text, source_id, statement_date')
      .eq('candidate_id', candidateId)
      .order('statement_date', { ascending: false });
    statements = res.data;
    if (res.error) throw res.error;
  } catch {
    return [];
  }
  if (!statements || statements.length === 0) return [];

  const sourceIds = [...new Set(statements.map((s) => s.source_id).filter(Boolean))] as string[];
  const issueIds = [...new Set(statements.map((s) => s.issue_id).filter(Boolean))] as string[];

  const [sourcesRes, issuesRes] = await Promise.all([
    sourceIds.length > 0
      ? supabase.from('sources').select('*').in('id', sourceIds)
      : Promise.resolve({ data: [], error: null }),
    issueIds.length > 0
      ? supabase.from('issues').select('id, name, slug, category, is_custom').in('id', issueIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const sourceMap: Record<string, Source> = {};
  (sourcesRes.data ?? []).forEach((s) => { sourceMap[s.id] = s as Source; });
  const issueMap: Record<string, Issue> = {};
  (issuesRes.data ?? []).forEach((i) => { issueMap[i.id] = i as Issue; });

  return statements.map((s) => ({
    ...s,
    source: s.source_id ? sourceMap[s.source_id] ?? null : null,
    issue: s.issue_id ? issueMap[s.issue_id] ?? null : null,
  })) as unknown as CandidateStatement[];
}

export async function getVotingRecord(candidateId: string): Promise<VotingRecord[]> {
  let records;
  try {
    const res = await supabase
      .from('voting_records')
      .select('id, candidate_id, bill_name, bill_number, vote, vote_date, chamber, description, source_id, plain_english_summary, eli5_explanation')
      .eq('candidate_id', candidateId)
      .order('vote_date', { ascending: false });
    records = res.data;
    if (res.error) throw res.error;
  } catch {
    return [];
  }
  if (!records || records.length === 0) return [];

  const sourceIds = [...new Set(records.map((r) => r.source_id).filter(Boolean))] as string[];
  const sourceMap: Record<string, Source> = {};
  if (sourceIds.length > 0) {
    const { data: srcs } = await supabase
      .from('sources')
      .select('*')
      .in('id', sourceIds);
    (srcs ?? []).forEach((s) => { sourceMap[s.id] = s as Source; });
  }

  return records.map((r) => ({
    ...r,
    source: r.source_id ? sourceMap[r.source_id] ?? null : null,
  })) as unknown as VotingRecord[];
}

export async function getJudicialRecord(candidateId: string): Promise<JudicialRecord | null> {
  try {
    const { data, error } = await supabase
      .from('judicial_records')
      .select('*')
      .eq('candidate_id', candidateId)
      .maybeSingle();
    if (error) throw error;
    return data as JudicialRecord | null;
  } catch {
    return null;
  }
}

export async function compareCandidates(
  candidateIds: string[],
  issueIds?: string[]
): Promise<Record<string, CandidatePosition[]>> {
  let data;
  try {
    let query = supabase
      .from('candidate_positions')
      .select('id, candidate_id, issue_id, summary, verification_status')
      .in('candidate_id', candidateIds);

    if (issueIds && issueIds.length > 0) {
      query = query.in('issue_id', issueIds);
    }

    const res = await query;
    data = res.data;
    if (res.error) throw res.error;
  } catch {
    return {};
  }
  if (!data || data.length === 0) return {};

  // Fetch issues separately
  const issueIdsList = [...new Set(data.map((p) => p.issue_id).filter(Boolean))] as string[];
  const issueMap: Record<string, Issue> = {};
  if (issueIdsList.length > 0) {
    const { data: issues } = await supabase
      .from('issues')
      .select('id, name, slug, category, is_custom')
      .in('id', issueIdsList);
    (issues ?? []).forEach((i) => {
      issueMap[i.id] = i as Issue;
    });
  }

  // Group by candidate
  const result: Record<string, CandidatePosition[]> = {};
  data.forEach((p) => {
    const cid = p.candidate_id as string;
    if (!result[cid]) result[cid] = [];
    result[cid].push({
      ...p,
      issue: p.issue_id ? issueMap[p.issue_id] ?? null : null,
    } as unknown as CandidatePosition);
  });

  // Fetch source counts for each position
  const allPositionIds = data.map((p) => p.id);
  if (allPositionIds.length > 0) {
    const { data: cs } = await supabase
      .from('candidate_sources')
      .select('candidate_position_id')
      .in('candidate_position_id', allPositionIds);

    const counts: Record<string, number> = {};
    (cs ?? []).forEach((c) => {
      counts[c.candidate_position_id] = (counts[c.candidate_position_id] ?? 0) + 1;
    });

    Object.values(result).forEach((positions) => {
      positions.forEach((p) => {
        (p as CandidatePosition & { source_count?: number }).source_count =
          counts[p.id] ?? 0;
      });
    });
  }

  return result;
}
