import { supabase } from '@/lib/supabase';
import type { CandidateClaim, CandidateSubmission, CandidateQuestionnaireResponse, CandidateEvent } from '@/types';

export async function getVerifiedClaim(candidateId: string): Promise<CandidateClaim | null> {
  try {
    const { data, error } = await supabase
      .from('candidate_claims')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'verified')
      .maybeSingle();
    if (error) throw error;
    return data as CandidateClaim | null;
  } catch {
    return null;
  }
}

export async function getMyClaims(): Promise<CandidateClaim[]> {
  try {
    const { data, error } = await supabase.from('candidate_claims').select('*').order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data as CandidateClaim[]) ?? [];
  } catch {
    return [];
  }
}

export async function submitCandidateClaim(
  candidateId: string,
  data: { full_name: string; campaign_name?: string; office?: string; email: string; campaign_website?: string; verification_notes?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_claims').insert({
      candidate_id: candidateId,
      full_name: data.full_name,
      campaign_name: data.campaign_name ?? null,
      office: data.office ?? null,
      email: data.email,
      campaign_website: data.campaign_website ?? null,
      verification_notes: data.verification_notes ?? null,
      status: 'pending',
    });
    if (error) throw error;

    // Previously nothing told an admin a claim was waiting — they had to
    // remember to periodically check the Review Claims tab. A delayed
    // review can block a candidate from managing their own profile during
    // a critical campaign window, so this is worth an immediate alert.
    try {
      await supabase.rpc('notify_admins_of_pending_review', {
        p_title: 'New candidate claim to review',
        p_body: `${data.full_name} has claimed a candidate profile and is waiting for verification.`,
      });
    } catch {
      // Best-effort — the claim itself already submitted successfully.
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit claim' };
  }
}

export async function getApprovedSubmissions(candidateId: string): Promise<CandidateSubmission[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_submissions')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'approved')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data as CandidateSubmission[]) ?? [];
  } catch {
    return [];
  }
}

export async function getApprovedQuestionnaire(candidateId: string): Promise<CandidateQuestionnaireResponse[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_questionnaire_responses')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'approved')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data as CandidateQuestionnaireResponse[]) ?? [];
  } catch {
    return [];
  }
}

export async function getApprovedEvents(candidateId: string): Promise<CandidateEvent[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_events')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'approved')
      .order('event_date', { ascending: true });
    if (error) throw error;
    return (data as CandidateEvent[]) ?? [];
  } catch {
    return [];
  }
}

export async function submitCandidateContent(
  candidateId: string,
  fieldName: CandidateSubmission['field_name'],
  fieldValue: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_submissions').insert({
      candidate_id: candidateId,
      field_name: fieldName,
      field_value: fieldValue,
      status: 'pending',
    });
    if (error) throw error;

    try {
      await supabase.rpc('notify_admins_of_pending_review', {
        p_title: 'New candidate content submission',
        p_body: `A candidate submitted a "${fieldName}" update for review.`,
      });
    } catch {
      // Best-effort — the submission itself already succeeded.
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit' };
  }
}

export async function submitQuestionnaireResponse(
  candidateId: string,
  question: string,
  answer: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_questionnaire_responses').insert({
      candidate_id: candidateId,
      question,
      answer,
      status: 'pending',
    });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit' };
  }
}

export async function submitEvent(
  candidateId: string,
  data: { title: string; description?: string; event_date: string; start_time?: string; end_time?: string; location_name?: string; address?: string; city?: string; state?: string; virtual_url?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_events').insert({
      candidate_id: candidateId,
      ...data,
      status: 'pending',
    });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit' };
  }
}

export async function getMyClaimedCandidates(): Promise<{ candidate_id: string; status: string; full_name: string }[]> {
  // Errors propagate on purpose: returning [] made the portal say "No claimed
  // profiles yet" during an outage, inviting candidates to file a second claim.
  const { data, error } = await supabase
    .from('candidate_claims')
    .select('candidate_id, status, full_name')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data as { candidate_id: string; status: string; full_name: string }[]) ?? [];
}
