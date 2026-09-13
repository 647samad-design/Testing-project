import { supabase } from '@/lib/supabase';
import type {
  OfficeDescription, FactCheck, CandidatePromise, CandidateClaimAnalysis,
  FactCheckAssessment, FactCheckPlatform, PromiseStatus, AuthorityAssessment,
} from '@/types';

// ─── Office Descriptions ───

export async function getOfficeDescription(officeName: string): Promise<OfficeDescription | null> {
  const { data, error } = await supabase
    .from('office_descriptions')
    .select('*')
    .ilike('office_name', officeName)
    .maybeSingle();
  if (error || !data) return null;
  return data as OfficeDescription;
}

export async function getAllOfficeDescriptions(): Promise<OfficeDescription[]> {
  const { data, error } = await supabase
    .from('office_descriptions')
    .select('*')
    .order('office_name', { ascending: true });
  if (error || !data) return [];
  return data as OfficeDescription[];
}

// ─── Fact Checks ("Lens This") ───

export async function getFactChecks(limit = 20): Promise<FactCheck[]> {
  const { data, error } = await supabase
    .from('fact_checks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as FactCheck[];
}

export async function submitFactCheck(
  claimText: string,
  sourceUrl?: string,
  platform?: FactCheckPlatform,
): Promise<FactCheck | null> {
  const { data, error } = await supabase
    .from('fact_checks')
    .insert({
      claim_text: claimText,
      source_url: sourceUrl ?? null,
      source_platform: platform ?? null,
    })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as FactCheck | null;
}

// ─── Candidate Promises Tracker ───

export async function getCandidatePromises(candidateId: string): Promise<CandidatePromise[]> {
  const { data, error } = await supabase
    .from('candidate_promises')
    .select(`
      *,
      issue:issues(id, name, slug, category)
    `)
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as unknown as CandidatePromise[];
}

export async function addCandidatePromise(
  candidateId: string,
  promiseText: string,
  dateMade?: string,
  sourceUrl?: string,
  issueId?: string,
): Promise<void> {
  const { error } = await supabase
    .from('candidate_promises')
    .insert({
      candidate_id: candidateId,
      promise_text: promiseText,
      date_made: dateMade ?? null,
      source_url: sourceUrl ?? null,
      issue_id: issueId ?? null,
    });
  if (error) throw error;
}

export async function updatePromiseStatus(
  promiseId: string,
  status: PromiseStatus,
  evidence?: string,
  sourceUrl?: string,
): Promise<void> {
  const { error } = await supabase
    .from('candidate_promises')
    .update({
      status,
      status_evidence: evidence ?? null,
      status_source_url: sourceUrl ?? null,
      status_updated_at: new Date().toISOString(),
    })
    .eq('id', promiseId);
  if (error) throw error;
}

// ─── Claims vs Plans ───

export async function getCandidateClaimAnalysis(candidateId: string): Promise<CandidateClaimAnalysis[]> {
  const { data, error } = await supabase
    .from('candidate_claim_analysis')
    .select(`
      *,
      issue:issues(id, name, slug, category)
    `)
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as unknown as CandidateClaimAnalysis[];
}

export async function addClaimAnalysis(
  candidateId: string,
  claimText: string,
  hasSpecificPlan: boolean,
  extra?: {
    plan_details?: string;
    plan_how?: string;
    plan_how_much?: string;
    plan_when?: string;
    plan_cost?: string;
    plan_what_gets_cut?: string;
    authority_assessment?: AuthorityAssessment;
    evidence_text?: string;
    evidence_url?: string;
    analysis_notes?: string;
    issue_id?: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from('candidate_claim_analysis')
    .insert({
      candidate_id: candidateId,
      claim_text: claimText,
      has_specific_plan: hasSpecificPlan,
      ...extra,
    });
  if (error) throw error;
}

// ─── Elections ───

export async function getElections(): Promise<{ id: string; name: string; election_date: string; description: string | null }[]> {
  const { data, error } = await supabase
    .from('elections')
    .select('*')
    .order('election_date', { ascending: true });
  if (error || !data) return [];
  return data;
}
