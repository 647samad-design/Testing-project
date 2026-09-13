import { supabase } from '@/lib/supabase';
import { demoIssues } from '@/services/demo-data';
import type { Issue, UserLocation, Profile } from '@/types';

export async function getIssues(): Promise<Issue[]> {
  try {
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .order('name');
    if (error) throw error;
    if (data && data.length > 0) return data as Issue[];
  } catch {
    // Database unreachable — fall through to demo data
  }
  return demoIssues;
}

export async function getUserIssues(): Promise<Issue[]> {
  const { data: userIssues, error } = await supabase
    .from('user_issues')
    .select('issue_id')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

  if (error || !userIssues) return [];

  const issueIds = userIssues.map((ui) => ui.issue_id);
  if (issueIds.length === 0) return [];

  const { data: issues } = await supabase
    .from('issues')
    .select('*')
    .in('id', issueIds)
    .order('name');

  return (issues ?? []) as Issue[];
}

export async function selectIssue(issueId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('user_issues')
    .select('id')
    .eq('issue_id', issueId)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from('user_issues').insert({ issue_id: issueId });
  if (error) throw error;
}

export async function deselectIssue(issueId: string): Promise<void> {
  await supabase
    .from('user_issues')
    .delete()
    .eq('issue_id', issueId);
}

export async function createCustomIssue(name: string): Promise<Issue | null> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { data, error } = await supabase
    .from('issues')
    .insert({ name, slug: `${slug}-${Date.now()}`, is_custom: true })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as Issue | null;
}

export async function saveLocation(
  zip: string,
  city?: string | null,
  state?: string | null,
  county?: string | null
): Promise<UserLocation | null> {
  // Upsert — one location per user
  const { data: existing } = await supabase
    .from('locations')
    .select('id')
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('locations')
      .update({ zip_code: zip, city, state, county })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data as UserLocation | null;
  }

  const { data, error } = await supabase
    .from('locations')
    .insert({ zip_code: zip, city, state, county })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as UserLocation | null;
}

export async function getLocation(): Promise<UserLocation | null> {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .maybeSingle();
  if (error) return null;
  return data as UserLocation | null;
}

export async function getProfile(): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, zip_code, is_admin, language_preference')
    .maybeSingle();
  return data as Profile | null;
}

export async function updateProfile(updates: {
  full_name?: string;
  zip_code?: string;
  bio?: string;
  occupation?: string;
  education?: string;
  photo_url?: string;
}): Promise<void> {
  const { error } = await supabase.from('profiles').update(updates).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '');
  if (error) throw error;
}

export async function saveCandidate(candidateId: string): Promise<void> {
  const { error } = await supabase.from('saved_candidates').insert({ candidate_id: candidateId });
  if (error) throw error;
}

export async function unsaveCandidate(candidateId: string): Promise<void> {
  await supabase.from('saved_candidates').delete().eq('candidate_id', candidateId);
}

export async function getSavedCandidates(): Promise<Issue[] | null> {
  // Returns saved candidate IDs — caller fetches candidate details
  const { data, error } = await supabase
    .from('saved_candidates')
    .select('candidate_id')
    .order('created_at', { ascending: false });
  if (error) return null;
  return data as unknown as Issue[];
}

export async function saveRace(contestId: string): Promise<void> {
  const { error } = await supabase.from('saved_races').insert({ contest_id: contestId });
  if (error) throw error;
}

export async function unsaveRace(contestId: string): Promise<void> {
  await supabase.from('saved_races').delete().eq('contest_id', contestId);
}
