import { supabase } from '@/lib/supabase';
import type { CandidateTag } from '@/types';

export async function getTagsForCandidate(candidateId: string): Promise<CandidateTag[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_tags')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as CandidateTag[]) ?? [];
  } catch {
    return [];
  }
}

export async function getMyTagsForCandidate(candidateId: string): Promise<CandidateTag[]> {
  try {
    const { data, error } = await supabase
      .from('candidate_tags')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '');
    if (error) throw error;
    return (data as CandidateTag[]) ?? [];
  } catch {
    return [];
  }
}

export async function getTagsForCandidates(candidateIds: string[]): Promise<Record<string, CandidateTag[]>> {
  if (candidateIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('candidate_tags')
      .select('*')
      .in('candidate_id', candidateIds)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const result: Record<string, CandidateTag[]> = {};
    (data as CandidateTag[] ?? []).forEach((t) => {
      if (!result[t.candidate_id]) result[t.candidate_id] = [];
      result[t.candidate_id].push(t);
    });
    return result;
  } catch {
    return {};
  }
}

export async function addTag(candidateId: string, tag: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('candidate_tags').insert({
      candidate_id: candidateId,
      tag,
    });
    if (error) {
      if (error.code === '23505') return { success: true };
      throw error;
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to add tag' };
  }
}

export async function removeTag(candidateId: string, tag: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('candidate_tags')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('tag', tag)
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '');
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to remove tag' };
  }
}

export function tagLabel(value: string): string {
  return value.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function tagColor(tag: string): string {
  const colors: Record<string, string> = {
    'pro-black': 'bg-amber-100 text-amber-800 border-amber-200',
    'pro-aipac': 'bg-blue-100 text-blue-800 border-blue-200',
    'pro-life': 'bg-rose-100 text-rose-800 border-rose-200',
    'pro-choice': 'bg-teal-100 text-teal-800 border-teal-200',
    'pro-gun': 'bg-orange-100 text-orange-800 border-orange-200',
    'gun-control': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'pro-labor': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'pro-business': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'pro-environment': 'bg-green-100 text-green-800 border-green-200',
    'pro-lgbtq': 'bg-pink-100 text-pink-800 border-pink-200',
    'pro-immigration': 'bg-violet-100 text-violet-800 border-violet-200',
    'anti-establishment': 'bg-red-100 text-red-800 border-red-200',
    'bipartisan': 'bg-purple-100 text-purple-800 border-purple-200',
    'progressive': 'bg-sky-100 text-sky-800 border-sky-200',
    'conservative': 'bg-red-100 text-red-800 border-red-200',
    'moderate': 'bg-gray-100 text-gray-800 border-gray-200',
    'pro-police': 'bg-blue-100 text-blue-800 border-blue-200',
    'police-reform': 'bg-amber-100 text-amber-800 border-amber-200',
    'pro-education': 'bg-teal-100 text-teal-800 border-teal-200',
    'pro-healthcare': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  };
  return colors[tag] ?? 'bg-secondary text-foreground border-border';
}
