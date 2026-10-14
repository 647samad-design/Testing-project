import { supabase } from '@/lib/supabase';
import type { OfficialLinks } from '@/lib/vote-links';

export interface VotingSite {
  name: string;
  address: string;
  hours: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  lat: number | null;
  lng: number | null;
}

export type VoterInfoStatus = 'ok' | 'no_sites' | 'no_data' | 'not_configured' | 'invalid_address' | 'unavailable';

export interface VoterInfo {
  status: VoterInfoStatus;
  election?: { name: string | null; day: string | null } | null;
  normalizedAddress?: string;
  mailOnly?: boolean;
  pollingLocations?: VotingSite[];
  earlyVoteSites?: VotingSite[];
  dropOffLocations?: VotingSite[];
  links?: OfficialLinks & { officeName?: string | null; ballotInfo?: string | null };
}

const CACHE_KEY = 'govsearch_voter_info';

/** Where to vote for a home address (polling place, early voting, drop boxes),
 * from election offices via Google's Civic Information API. */
export async function getVoterInfo(address: string): Promise<VoterInfo> {
  const { data, error } = await supabase.functions.invoke<VoterInfo>('voter-info', { body: { address } });
  if (error || !data) return { status: 'unavailable' };
  if (data.status === 'ok') {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ address, info: data })); } catch { /* storage unavailable */ }
  }
  return data;
}

/** The last successful lookup this session (so My Picks can show the polling place). */
export function getCachedVoterInfo(): { address: string; info: VoterInfo } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
