import { supabase } from '@/lib/supabase';
import type { Advertisement, Advertiser, AdPlan, Sponsor, Sponsorship, CandidateServicePlan, AdPlacement, SponsorPlacement } from '@/types';

export async function getAdPlans(): Promise<AdPlan[]> {
  try {
    const { data, error } = await supabase.from('ad_plans').select('*').eq('is_active', true).order('display_order');
    if (error) throw error;
    if (data && data.length > 0) return data as AdPlan[];
  } catch { /* fall through */ }
  return [
    { id: 'p1', plan_name: 'Local Business', description: 'Perfect for small local businesses', monthly_price: 250, features: ['Geographic targeting', 'Homepage placement', 'Election-page placement', 'Basic analytics'], is_active: true, display_order: 1 },
    { id: 'p2', plan_name: 'Premium Local', description: 'More placements, more reach', monthly_price: 500, features: ['Multiple placements', 'Geographic targeting', 'Higher impression allocation', 'Analytics'], is_active: true, display_order: 2 },
    { id: 'p3', plan_name: 'Regional', description: 'Cover multiple cities', monthly_price: 1000, features: ['Multiple cities', 'Multiple placements', 'Advanced targeting', 'Analytics'], is_active: true, display_order: 3 },
    { id: 'p4', plan_name: 'National', description: 'Custom pricing for national reach', monthly_price: 0, features: ['Custom placements', 'Nationwide targeting', 'Premium analytics', 'Dedicated support'], is_active: true, display_order: 4 },
  ];
}

export async function getCandidateServicePlans(): Promise<CandidateServicePlan[]> {
  try {
    const { data, error } = await supabase.from('candidate_service_plans').select('*').eq('is_active', true).order('display_order');
    if (error) throw error;
    if (data && data.length > 0) return data as CandidateServicePlan[];
  } catch { /* fall through */ }
  return [
    { id: 'cp1', plan_name: 'Profile Claim', description: 'Claim and verify your candidate profile', annual_price: 99, features: ['Verified profile badge', 'Candidate-submitted biography', 'Campaign website', 'Social media links', 'Campaign contact information', 'Candidate questionnaire'], is_active: true, is_available: true, display_order: 1 },
    { id: 'cp2', plan_name: 'Premium Profile Management', description: 'Full profile management with assistance', annual_price: 299, features: ['Everything in Profile Claim', 'Questionnaire management', 'Event updates', 'Profile update assistance', 'Priority support'], is_active: true, is_available: true, display_order: 2 },
  ];
}

export async function getActiveAds(placement: AdPlacement, viewerState?: string): Promise<Advertisement[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('advertisements')
      .select('*')
      .eq('status', 'active')
      .eq('placement', placement)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`);
    if (viewerState) {
      query = query.or(`target_state.is.null,target_state.eq.${viewerState}`);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    return (data as Advertisement[]) ?? [];
  } catch {
    return [];
  }
}

export async function trackAdEvent(adId: string, eventType: 'impression' | 'click', viewerState?: string): Promise<void> {
  try {
    await supabase.from('ad_events').insert({ advertisement_id: adId, event_type: eventType, viewer_state: viewerState ?? null });
  } catch { /* best-effort */ }
}

export async function getActiveSponsorships(placement: SponsorPlacement): Promise<(Sponsorship & { sponsor?: Sponsor })[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('sponsorships')
      .select('*, sponsor:sponsors(*)')
      .eq('status', 'active')
      .eq('placement', placement)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) throw error;
    return (data as (Sponsorship & { sponsor?: Sponsor })[]) ?? [];
  } catch {
    return [];
  }
}

export async function trackSponsorEvent(sponsorshipId: string, eventType: 'impression' | 'click'): Promise<void> {
  try {
    await supabase.from('sponsor_events').insert({ sponsorship_id: sponsorshipId, event_type: eventType });
  } catch { /* best-effort */ }
}

export async function getMyAdvertiserProfile(): Promise<Advertiser | null> {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return null;

    const { data, error } = await supabase
      .from('advertisers')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (error) throw error;
    return data as Advertiser | null;
  } catch {
    return null;
  }
}

export async function createAdvertiserProfile(input: Partial<Advertiser>): Promise<Advertiser | null> {
  try {
    const { data, error } = await supabase.from('advertisers').insert(input).select().single();
    if (error) throw error;
    return data as Advertiser;
  } catch {
    return null;
  }
}

export async function getMyAds(): Promise<Advertisement[]> {
  try {
    const { data, error } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data as Advertisement[]) ?? [];
  } catch {
    return [];
  }
}

export async function createAd(input: Partial<Advertisement>): Promise<Advertisement | null> {
  try {
    const { data, error } = await supabase.from('advertisements').insert(input).select().single();
    if (error) throw error;
    return data as Advertisement;
  } catch {
    return null;
  }
}
