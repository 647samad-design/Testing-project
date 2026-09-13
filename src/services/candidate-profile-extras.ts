import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type {
  CandidateProfileExtras, CandidateGetToKnow, CandidateFundingSource,
  CandidateEndorsement, CandidateElectionReminder,
} from '@/types';

export async function getProfileExtras(candidateId: string): Promise<CandidateProfileExtras | null> {
  try {
    const { data, error } = await supabase
      .from('candidate_profile_extras')
      .select('*')
      .eq('candidate_id', candidateId)
      .maybeSingle();
    if (error) throw error;
    return data as CandidateProfileExtras | null;
  } catch {
    return null;
  }
}

export async function upsertProfileExtras(
  candidateId: string,
  extras: Partial<CandidateProfileExtras>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('candidate_profile_extras')
      .upsert({ candidate_id: candidateId, ...extras, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to save' };
  }
}

export async function getGetToKnow(candidateId: string): Promise<CandidateGetToKnow[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_get_to_know')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'approved')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (data as CandidateGetToKnow[]) ?? [];
  } catch {
    return [];
  }
}

export async function submitGetToKnow(
  candidateId: string,
  question: string,
  answer: string,
  displayOrder: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_get_to_know').insert({
      candidate_id: candidateId,
      question,
      answer,
      display_order: displayOrder,
      status: 'pending',
    });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit' };
  }
}

export async function getFundingSources(candidateId: string): Promise<CandidateFundingSource[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_funding_sources')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'approved')
      .order('percentage', { ascending: false });
    if (error) throw error;
    return (data as CandidateFundingSource[]) ?? [];
  } catch {
    return [];
  }
}

export async function submitFundingSource(
  candidateId: string,
  source: Omit<CandidateFundingSource, 'id' | 'candidate_id' | 'status' | 'created_at'>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_funding_sources').insert({
      candidate_id: candidateId,
      ...source,
      status: 'pending',
    });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit' };
  }
}

export async function getEndorsements(candidateId: string): Promise<CandidateEndorsement[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_endorsements')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('status', 'approved')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (data as CandidateEndorsement[]) ?? [];
  } catch {
    return [];
  }
}

export async function submitEndorsement(
  candidateId: string,
  endorsement: Omit<CandidateEndorsement, 'id' | 'candidate_id' | 'status' | 'created_at'>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_endorsements').insert({
      candidate_id: candidateId,
      ...endorsement,
      status: 'pending',
    });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit' };
  }
}

export async function getElectionReminder(candidateId: string, userId: string): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('candidate_election_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .eq('user_id', userId);
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function toggleElectionReminder(
  candidateId: string,
  userId: string,
): Promise<{ enabled: boolean; error?: string }> {
  const existing = await getElectionReminder(candidateId, userId);
  try {
    if (existing) {
      const { error } = await supabase
        .from('candidate_election_reminders')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('user_id', userId);
      if (error) throw error;
      return { enabled: false };
    } else {
      const { error } = await supabase
        .from('candidate_election_reminders')
        .insert({ candidate_id: candidateId, user_id: userId });
      if (error) throw error;
      return { enabled: true };
    }
  } catch (e) {
    return { enabled: existing, error: e instanceof Error ? e.message : 'Failed to toggle' };
  }
}
