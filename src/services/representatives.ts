import { supabase } from '@/lib/supabase';

export interface Representative {
  id: string;
  name: string;
  party: string | null;
  title: string;
  level: 'federal' | 'state';
  chamber: 'upper' | 'lower' | 'other';
  district: string | null;
  jurisdiction: string | null;
  jurisdictionId: string | null;
  photo: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  profileUrl: string | null;
}

export interface SponsoredBill {
  identifier: string;
  title: string;
  session: string | null;
  latestActionDate: string | null;
  latestAction: string | null;
  url: string | null;
}

export type RepsStatus = 'ok' | 'no_match' | 'not_configured' | 'invalid_address' | 'unavailable';

/** Current members of Congress and state legislators for an address (Open States). */
export async function getRepresentatives(address: string): Promise<{ status: RepsStatus; matchedAddress?: string; representatives?: Representative[] }> {
  const { data, error } = await supabase.functions.invoke('representatives', { body: { address } });
  if (error || !data) return { status: 'unavailable' };
  return data;
}

/** A legislator's most recent sponsored bills (Open States). */
export async function getSponsoredBills(personId: string, jurisdictionId: string): Promise<{ status: string; bills?: SponsoredBill[] }> {
  const { data, error } = await supabase.functions.invoke('representatives', { body: { personId, jurisdictionId } });
  if (error || !data) return { status: 'unavailable' };
  return data;
}
