import { supabase } from '@/lib/supabase';
import type { AdPlacement, Advertisement, Advertiser, AdPlan, Sponsor, Sponsorship, SponsorPlacement } from '@/types';

// ---- Public: fetch active ads for a placement ----

export async function getAdsForPlacement(
  placement: AdPlacement,
  viewerState?: string | null,
  viewerZip?: string | null,
): Promise<Advertisement[]> {
  try {
    let query = supabase
      .from('advertisements')
      .select('*')
      .eq('placement', placement)
      .eq('status', 'active')
      .lte('start_date', new Date().toISOString().slice(0, 10));

    const { data, error } = await query;
    if (error) throw error;
    if (!data) return [];

    let ads = data as Advertisement[];

    // Filter out expired
    const today = new Date().toISOString().slice(0, 10);
    ads = ads.filter(
      (a) => !a.end_date || a.end_date >= today,
    );

    // Geo-target: prefer ads targeting viewer's state/zip, but also show
    // untargeted (null) ads. Only filter if the ad has a target set and it
    // doesn't match.
    if (viewerState) {
      ads = ads.filter(
        (a) =>
          !a.target_state ||
          a.target_state.toLowerCase() === viewerState.toLowerCase() ||
          (viewerZip && a.target_zip === viewerZip),
      );
    }

    // Shuffle so no advertiser gets preferential placement
    for (let i = ads.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ads[i], ads[j]] = [ads[j], ads[i]];
    }

    return ads.slice(0, 3);
  } catch {
    return [];
  }
}

// ---- Public: log impression/click ----

export async function logAdEvent(
  adId: string,
  eventType: 'impression' | 'click',
  viewerState?: string | null,
  viewerZip?: string | null,
): Promise<void> {
  try {
    await supabase.from('ad_events').insert({
      advertisement_id: adId,
      event_type: eventType,
      viewer_state: viewerState ?? null,
      viewer_zip: viewerZip ?? null,
    });
    // Increment counter on the ad row
    const column = eventType === 'impression' ? 'impressions' : 'clicks';
    await supabase.rpc('increment_ad_counter', {
      ad_id: adId,
      column_name: column,
    });
  } catch {
    // Silently fail — analytics should never break the page
  }
}

// ---- Public: fetch active sponsorships for a placement ----

export async function getSponsorshipsForPlacement(
  placement: SponsorPlacement,
  viewerState?: string | null,
): Promise<(Sponsorship & { sponsor?: Sponsor })[]> {
  try {
    const { data, error } = await supabase
      .from('sponsorships')
      .select('*, sponsor:sponsors(*)')
      .eq('placement', placement)
      .eq('status', 'active')
      .lte('start_date', new Date().toISOString().slice(0, 10));

    if (error) throw error;
    if (!data) return [];

    let sponsorships = data as (Sponsorship & { sponsor?: Sponsor })[];

    const today = new Date().toISOString().slice(0, 10);
    sponsorships = sponsorships.filter(
      (s) => !s.end_date || s.end_date >= today,
    );

    if (viewerState) {
      sponsorships = sponsorships.filter(
        (s) =>
          !s.target_state ||
          s.target_state.toLowerCase() === viewerState.toLowerCase(),
      );
    }

    return sponsorships;
  } catch {
    return [];
  }
}

export async function logSponsorEvent(
  sponsorshipId: string,
  eventType: 'impression' | 'click',
): Promise<void> {
  try {
    await supabase.from('sponsor_events').insert({
      sponsorship_id: sponsorshipId,
      event_type: eventType,
    });
  } catch {
    // Silently fail
  }
}

// ---- Public: fetch pricing plans ----

export async function getAdPlans(): Promise<AdPlan[]> {
  try {
    const { data, error } = await supabase
      .from('ad_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (data as AdPlan[]) ?? [];
  } catch {
    return [];
  }
}

// ---- Advertiser portal: CRUD ----

export async function getMyAdvertiser(): Promise<Advertiser | null> {
  const { data, error } = await supabase
    .from('advertisers')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as Advertiser | null;
}

export async function createAdvertiser(input: {
  organization_name: string;
  contact_email: string;
  contact_phone?: string;
  website_url?: string;
}): Promise<Advertiser> {
  const { data, error } = await supabase
    .from('advertisers')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Advertiser;
}

export async function getMyAds(): Promise<Advertisement[]> {
  const { data, error } = await supabase
    .from('advertisements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Advertisement[]) ?? [];
}

export async function createAd(input: {
  advertiser_id: string;
  campaign_name: string;
  ad_title: string;
  ad_description?: string;
  image_url?: string;
  destination_url: string;
  ad_type?: string;
  placement: string;
  target_state?: string;
  target_city?: string;
  target_zip?: string;
  start_date: string;
  end_date?: string;
  budget?: number;
}): Promise<Advertisement> {
  const { data, error } = await supabase
    .from('advertisements')
    .insert({ ...input, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data as Advertisement;
}

export async function updateAdStatus(
  adId: string,
  status: Advertisement['status'],
): Promise<void> {
  const { error } = await supabase
    .from('advertisements')
    .update({ status })
    .eq('id', adId);
  if (error) throw error;
}
