import { supabase } from '@/lib/supabase';

export interface ElectionCandidateResult {
  id: string;
  race_id: string;
  ap_candidate_id: string;
  candidate_name: string;
  party: string | null;
  vote_count: number;
  vote_percent: number | null;
  is_winner: boolean;
  is_runoff: boolean;
  incumbent: boolean;
}

export interface ElectionRace {
  id: string;
  ap_race_id: string;
  ap_election_date: string;
  race_type_id: string;
  office_name: string;
  state_postal: string;
  race_title: string | null;
  winner_candidate_id: string | null;
  winner_name: string | null;
  winner_party: string | null;
  race_call_status: string | null;
  tabulation_status: string | null;
  winner_datetime: string | null;
  is_certified: boolean;
  certified_timestamp: string | null;
  results_type: string;
  last_updated: string | null;
  election_candidate_results: ElectionCandidateResult[];
}

export interface ElectionNotification {
  id: string;
  user_id: string;
  race_id: string;
  notification_type: 'race_called' | 'results_certified';
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  race?: ElectionRace;
}

export async function getElectionResults(state?: string, certifiedOnly = false): Promise<ElectionRace[]> {
  let query = supabase
    .from('election_races')
    .select(`
      *,
      election_candidate_results(*)
    `)
    .order('updated_at', { ascending: false });

  if (state) {
    query = query.eq('state_postal', state.toUpperCase());
  }
  if (certifiedOnly) {
    query = query.eq('is_certified', true);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ElectionRace[];
}

export async function getCalledRaces(state?: string): Promise<ElectionRace[]> {
  let query = supabase
    .from('election_races')
    .select(`
      *,
      election_candidate_results(*)
    `)
    .not('winner_candidate_id', 'is', null)
    .order('winner_datetime', { ascending: false, nullsFirst: false });

  if (state) {
    query = query.eq('state_postal', state.toUpperCase());
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ElectionRace[];
}

export async function getCertifiedResults(state?: string): Promise<ElectionRace[]> {
  return getElectionResults(state, true);
}

export async function getElectionNotifications(unreadOnly = false): Promise<ElectionNotification[]> {
  let query = supabase
    .from('user_election_notifications')
    .select(`
      *,
      race:race_id (
        *,
        election_candidate_results(*)
      )
    `)
    .order('created_at', { ascending: false });

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ElectionNotification[];
}

export async function markElectionNotificationRead(id: string): Promise<void> {
  await supabase
    .from('user_election_notifications')
    .update({ is_read: true })
    .eq('id', id);
}

export async function markAllElectionNotificationsRead(): Promise<void> {
  await supabase
    .from('user_election_notifications')
    .update({ is_read: true })
    .eq('is_read', false);
}

export async function triggerNewsFetch(): Promise<{ success: boolean; articlesAdded: number; error?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const url = `${supabaseUrl}/functions/v1/civic-news?action=fetch`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, articlesAdded: 0, error: err.error ?? `HTTP ${response.status}` };
  }

  const data = await response.json();
  return {
    success: true,
    articlesAdded: data.articlesAdded ?? 0,
    error: data.error,
  };
}

export async function triggerElectionFetch(date?: string, state?: string): Promise<{ success: boolean; racesProcessed: number; newWinnersCalled: number; error?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const params = new URLSearchParams({ action: 'fetch' });
  if (date) params.set('date', date);
  if (state) params.set('state', state);

  const url = `${supabaseUrl}/functions/v1/ap-elections?${params}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, racesProcessed: 0, newWinnersCalled: 0, error: err.error ?? `HTTP ${response.status}` };
  }

  const data = await response.json();
  return {
    success: true,
    racesProcessed: data.racesProcessed ?? 0,
    newWinnersCalled: data.newWinnersCalled ?? 0,
    error: data.error,
  };
}
