import { supabase } from '@/lib/supabase';
import type { Source, Claim, ClaimEvidence, AssessmentStatus } from '@/types';

export async function searchSources(query: string): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .or(`title.ilike.%${query}%,publisher.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Source[];
}

export async function getSources(): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Source[];
}

export async function getSourceCountForPosition(positionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('candidate_sources')
    .select('*', { count: 'exact', head: true })
    .eq('candidate_position_id', positionId);
  if (error) return 0;
  return count ?? 0;
}

export async function getClaims(): Promise<Claim[]> {
  const { data, error } = await supabase
    .from('claims')
    .select(`
      id, claim_text, candidate_id, assessment, explanation, created_at,
      candidate:candidates(id, first_name, last_name, party, is_demo)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Claim[];
}

export async function getClaim(claimId: string): Promise<Claim | null> {
  const { data, error } = await supabase
    .from('claims')
    .select(`
      id, claim_text, candidate_id, assessment, explanation, created_at,
      candidate:candidates(id, first_name, last_name, party, is_demo)
    `)
    .eq('id', claimId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Claim | null;
}

export async function getClaimEvidence(claimId: string): Promise<ClaimEvidence[]> {
  const { data, error } = await supabase
    .from('claim_evidence')
    .select(`
      id, claim_id, source_id, note,
      source:sources(id, title, url, publisher, source_type, publication_date, author, description, credibility_level)
    `)
    .eq('claim_id', claimId);
  if (error) throw error;
  return (data ?? []) as unknown as ClaimEvidence[];
}

export async function submitClaim(claimText: string, candidateId?: string): Promise<Claim | null> {
  const { data, error } = await supabase
    .from('claims')
    .insert({
      claim_text: claimText,
      candidate_id: candidateId ?? null,
      assessment: 'insufficient_information' as AssessmentStatus,
      explanation: 'This claim has been submitted and is pending review. No assessment has been completed yet.',
    })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as Claim | null;
}
