import { supabase } from '@/lib/supabase';

export interface PublicPartner {
  slug: string;
  name: string;
  website: string | null;
  brand_color: string;
  logo_url: string | null;
}

export interface Partner extends PublicPartner {
  id: string;
  owner_user_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PartnerDayStats { day: string; views: number; lookups: number; clicks: number }

export type PartnerEvent = 'view' | 'lookup' | 'click';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/** Branding for the public widget (active partners only). */
export async function getPublicPartner(slug: string): Promise<PublicPartner | null> {
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await supabase.from('public_partners').select('slug, name, website, brand_color, logo_url').eq('slug', slug).maybeSingle();
  return (data as PublicPartner | null) ?? null;
}

/** Counts a widget view / ZIP lookup / click-through for the partner (fire and forget). */
export function trackPartnerEvent(slug: string, event: PartnerEvent): void {
  if (!SLUG_RE.test(slug)) return;
  void supabase.rpc('track_partner_event', { p_slug: slug, p_event: event }).then(() => undefined, () => undefined);
}

/** Partners the signed-in user owns (admins see all through listPartners). */
export async function getMyPartners(): Promise<Partner[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase.from('partners').select('*').eq('owner_user_id', u.user.id).order('name');
  if (error) throw error;
  return (data ?? []) as Partner[];
}

export async function updatePartnerBranding(id: string, updates: Partial<Pick<Partner, 'name' | 'website' | 'brand_color' | 'logo_url'>>): Promise<void> {
  const { error } = await supabase.from('partners').update(updates).eq('id', id);
  if (error) throw error;
}

export async function getPartnerStats(partnerId: string, days = 30): Promise<PartnerDayStats[]> {
  const { data, error } = await supabase.rpc('partner_stats', { p_partner_id: partnerId, p_days: days });
  if (error) throw error;
  return (data ?? []) as PartnerDayStats[];
}

// ─── Admin ───

export async function listPartners(): Promise<(Partner & { owner_email?: string | null })[]> {
  const { data, error } = await supabase.from('partners').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Partner[];
  const ownerIds = [...new Set(rows.map((r) => r.owner_user_id).filter(Boolean))] as string[];
  const emails = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, email').in('id', ownerIds);
    for (const p of (profs ?? []) as { id: string; email: string | null }[]) if (p.email) emails.set(p.id, p.email);
  }
  return rows.map((r) => ({ ...r, owner_email: r.owner_user_id ? emails.get(r.owner_user_id) ?? null : null }));
}

export async function createPartner(input: { name: string; slug: string; website?: string; brand_color?: string; logo_url?: string; ownerEmail?: string }): Promise<void> {
  let owner: string | null = null;
  if (input.ownerEmail?.trim()) {
    const { data } = await supabase.from('profiles').select('id').ilike('email', input.ownerEmail.trim()).maybeSingle();
    if (!data) throw new Error('No account with that email. Ask the partner to sign up first.');
    owner = (data as { id: string }).id;
  }
  const { error } = await supabase.from('partners').insert({
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    website: input.website?.trim() || null,
    brand_color: input.brand_color || '#15776c',
    logo_url: input.logo_url?.trim() || null,
    owner_user_id: owner,
  });
  if (error) throw error;
}

export async function setPartnerActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('partners').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}

/** The iframe code a partner pastes into their website. */
export function embedCode(origin: string, slug: string, lang: string): string {
  const prefix = lang && lang !== 'en' ? `/${lang}` : '';
  return `<iframe src="${origin}${prefix}/embed?partner=${encodeURIComponent(slug)}" title="Find your ballot" loading="lazy" style="width:100%;max-width:520px;height:600px;border:0;border-radius:16px"></iframe>`;
}
