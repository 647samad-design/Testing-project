import { supabase } from '@/lib/supabase';

export interface Campaign {
  id: string;
  candidate_id: string;
  headline: string | null;
  message: string | null;
  goals: string[];
  is_active: boolean;
}

export interface CampaignEvent {
  id: string;
  candidate_id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string;
  is_public: boolean;
}

/** Public: fetch a candidate's active campaign page content, if any. */
export async function getCampaign(candidateId: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, candidate_id, headline, message, goals, is_active')
    .eq('candidate_id', candidateId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return null;
  return data as Campaign | null;
}

/** Public: upcoming events for a candidate's campaign, soonest first. */
export async function getCampaignEvents(candidateId: string): Promise<CampaignEvent[]> {
  const { data, error } = await supabase
    .from('campaign_events')
    .select('id, candidate_id, title, description, location, event_date, is_public')
    .eq('candidate_id', candidateId)
    .eq('is_public', true)
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true });
  if (error || !data) return [];
  return data as CampaignEvent[];
}

/** Public: attendee count for an event, without exposing who's attending. */
export async function getEventRsvpCount(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_event_rsvp_count', { p_event_id: eventId });
  if (error) return 0;
  return (data as number) ?? 0;
}

/** Which of these events has the signed-in voter RSVP'd to. Returns [] if signed out. */
export async function getMyRsvpEventIds(eventIds: string[]): Promise<string[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_my_rsvp_event_ids', { p_event_ids: eventIds });
  if (error) return [];
  return (data as string[]) ?? [];
}

export async function rsvpToEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('campaign_event_rsvps').insert({ event_id: eventId });
  if (error) throw error;
}

export async function cancelRsvp(eventId: string): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('campaign_event_rsvps')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userData.user.id);
  if (error) throw error;
}

// ─── Candidate Management (write) ───

/** Creates or updates the candidate's campaign page. RLS enforces that the
 * caller has an active Management subscription and is an active team member. */
export async function upsertCampaign(
  candidateId: string,
  fields: { headline?: string; message?: string; goals?: string[]; is_active?: boolean }
): Promise<void> {
  const { error } = await supabase
    .from('campaigns')
    .upsert({ candidate_id: candidateId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'candidate_id' });
  if (error) throw error;
}

export async function addCampaignEvent(
  candidateId: string,
  event: { title: string; description?: string; location?: string; event_date: string; is_public?: boolean }
): Promise<void> {
  const { error } = await supabase.from('campaign_events').insert({ candidate_id: candidateId, ...event });
  if (error) throw error;
}

export async function updateCampaignEvent(
  eventId: string,
  fields: Partial<{ title: string; description: string; location: string; event_date: string; is_public: boolean }>
): Promise<void> {
  const { error } = await supabase
    .from('campaign_events')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', eventId);
  if (error) throw error;
}

export async function deleteCampaignEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('campaign_events').delete().eq('id', eventId);
  if (error) throw error;
}

/** For the Candidate Portal management UI: all of a candidate's events
 * (including past/hidden ones), not just the public upcoming ones. */
export async function getAllCampaignEventsForManagement(candidateId: string): Promise<CampaignEvent[]> {
  const { data, error } = await supabase
    .from('campaign_events')
    .select('id, candidate_id, title, description, location, event_date, is_public')
    .eq('candidate_id', candidateId)
    .order('event_date', { ascending: false });
  if (error || !data) return [];
  return data as CampaignEvent[];
}
