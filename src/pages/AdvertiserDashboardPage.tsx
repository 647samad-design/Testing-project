import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Megaphone, Plus, Eye, MousePointerClick, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { usePageMeta } from '@/hooks/use-page-meta';
import { LoadingState } from '@/components/shared/StateComponents';
import {
  getMyAdvertiserProfile, createAdvertiserProfile, getMyAds, createAd,
  submitAdForReview, pauseAd, getAdPlans,
} from '@/services/advertising';
import type { Advertiser, Advertisement, AdPlan, AdPlacement, AdType } from '@/types';

const PLACEMENTS: { value: AdPlacement; label: string }[] = [
  { value: 'homepage', label: 'Homepage' },
  { value: 'candidates_page', label: 'Candidates Page' },
  { value: 'candidate_profile', label: 'Candidate Profile Pages' },
  { value: 'issues_page', label: 'Issues Page' },
  { value: 'election_page', label: 'Election Page' },
  { value: 'news_page', label: 'Civic Wire (News)' },
  { value: 'search', label: 'Search Results' },
  { value: 'footer', label: 'Footer' },
  { value: 'sidebar', label: 'Sidebar' },
];

const AD_TYPES: { value: AdType; label: string }[] = [
  { value: 'banner', label: 'Banner' },
  { value: 'square', label: 'Square' },
  { value: 'sidebar', label: 'Sidebar' },
  { value: 'sponsored_content', label: 'Sponsored Content' },
];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-secondary text-muted-foreground',
  pending: 'bg-warning/15 text-warning',
  active: 'bg-emerald-500/15 text-emerald-600',
  paused: 'bg-secondary text-muted-foreground',
  rejected: 'bg-destructive/15 text-destructive',
  expired: 'bg-secondary text-muted-foreground',
};

export function AdvertiserDashboardPage() {
  usePageMeta({ title: 'Advertiser Dashboard', description: 'Manage your BallotLens ad campaigns.', noindex: true });
  const { user, loading: authLoading } = useAuth();
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [plans, setPlans] = useState<AdPlan[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [profile, planList] = await Promise.all([getMyAdvertiserProfile(), getAdPlans()]);
      setAdvertiser(profile);
      setPlans(planList);
      if (profile) setAds(await getMyAds());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) load(); }, [user]);

  if (authLoading) return <div className="mx-auto max-w-content px-4 py-16"><LoadingState message="Loading…" /></div>;
  if (!user) return <Navigate to="/signin" replace />;
  if (loading) return <div className="mx-auto max-w-content px-4 py-16"><LoadingState message="Loading your dashboard…" /></div>;

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <Megaphone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Advertiser Dashboard</h1>
          <p className="text-sm text-muted-foreground">Reach engaged local voters on BallotLens.</p>
        </div>
      </header>

      {!advertiser ? (
        <CreateAdvertiserProfileCard onCreated={load} />
      ) : (
        <div className="space-y-6">
          <Card className="p-5 rounded-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organization</p>
            <p className="mt-1 font-semibold text-lg">{advertiser.organization_name}</p>
            <p className="text-sm text-muted-foreground">{advertiser.contact_email}</p>
          </Card>

          <NewAdCard advertiserId={advertiser.id} plans={plans} onCreated={load} />

          <div>
            <h2 className="font-semibold text-lg mb-3">Your Ads</h2>
            {ads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ads yet — create one above to get started.</p>
            ) : (
              <div className="space-y-3">
                {ads.map((ad) => (
                  <AdRow key={ad.id} ad={ad} onChanged={load} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateAdvertiserProfileCard({ onCreated }: { onCreated: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!orgName.trim() || !email.trim()) return;
    setSaving(true);
    try {
      const result = await createAdvertiserProfile({
        organization_name: orgName.trim(),
        contact_email: email.trim(),
        website_url: website.trim() || null,
      });
      if (!result) throw new Error('Failed to create advertiser profile.');
      toast.success('Advertiser profile created.');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 rounded-2xl max-w-lg">
      <h2 className="font-semibold text-lg mb-1">Set up your advertiser profile</h2>
      <p className="text-sm text-muted-foreground mb-4">One-time setup before you can create ads.</p>
      <div className="space-y-3">
        <div>
          <Label htmlFor="org-name">Organization Name</Label>
          <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Your business or organization" />
        </div>
        <div>
          <Label htmlFor="contact-email">Contact Email</Label>
          <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="website">Website (optional)</Label>
          <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        </div>
        <Button onClick={handleCreate} disabled={saving || !orgName.trim() || !email.trim()} className="w-full gap-1.5">
          {saving ? 'Creating…' : 'Create Profile'}
        </Button>
      </div>
    </Card>
  );
}

function NewAdCard({ advertiserId, plans, onCreated }: { advertiserId: string; plans: AdPlan[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [adTitle, setAdTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [placement, setPlacement] = useState<AdPlacement>('homepage');
  const [adType, setAdType] = useState<AdType>('banner');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!campaignName.trim() || !adTitle.trim() || !destinationUrl.trim()) return;
    setSaving(true);
    try {
      const result = await createAd({
        advertiser_id: advertiserId,
        campaign_name: campaignName.trim(),
        ad_title: adTitle.trim(),
        ad_description: description.trim() || null,
        destination_url: destinationUrl.trim(),
        placement,
        ad_type: adType,
        status: 'draft',
      });
      if (!result) throw new Error('Failed to create ad.');
      toast.success('Ad created as a draft. Submit it for review when ready.');
      setCampaignName(''); setAdTitle(''); setDescription(''); setDestinationUrl('');
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ad.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div>
        {plans.length > 0 && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <Card key={p.id} className="p-4 rounded-2xl">
                <p className="font-semibold">{p.plan_name}</p>
                <p className="text-2xl font-bold mt-1">${p.monthly_price}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
              </Card>
            ))}
          </div>
        )}
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Create New Ad
        </Button>
      </div>
    );
  }

  return (
    <Card className="p-6 rounded-2xl">
      <h2 className="font-semibold text-lg mb-4">New Ad</h2>
      <div className="space-y-3">
        <div>
          <Label htmlFor="campaign-name">Campaign Name (internal)</Label>
          <Input id="campaign-name" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Fall 2026 push" />
        </div>
        <div>
          <Label htmlFor="ad-title">Ad Title</Label>
          <Input id="ad-title" value={adTitle} onChange={(e) => setAdTitle(e.target.value)} placeholder="What voters will see" />
        </div>
        <div>
          <Label htmlFor="ad-description">Description (optional)</Label>
          <Input id="ad-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="destination-url">Destination URL</Label>
          <Input id="destination-url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="placement">Placement</Label>
            <select id="placement" value={placement} onChange={(e) => setPlacement(e.target.value as AdPlacement)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {PLACEMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="ad-type">Ad Type</Label>
            <select id="ad-type" value={adType} onChange={(e) => setAdType(e.target.value as AdType)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {AD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreate} disabled={saving || !campaignName.trim() || !adTitle.trim() || !destinationUrl.trim()} className="gap-1.5">
            {saving ? 'Creating…' : 'Save as Draft'}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

function AdRow({ ad, onChanged }: { ad: Advertisement; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      await submitAdForReview(ad.id);
      toast.success("Submitted for review. We'll notify you once it's approved.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit for review.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePause() {
    setBusy(true);
    try {
      await pauseAd(ad.id);
      toast.success('Ad paused.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pause ad.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{ad.ad_title}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[ad.status] ?? ''}`}>{ad.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{ad.campaign_name} · {PLACEMENTS.find((p) => p.value === ad.placement)?.label ?? ad.placement}</p>
          {ad.status === 'active' && (
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {ad.impressions} impressions</span>
              <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {ad.clicks} clicks</span>
            </div>
          )}
          {ad.status === 'rejected' && ad.admin_notes && (
            <p className="mt-1 text-xs text-destructive">Rejected: {ad.admin_notes}</p>
          )}
        </div>
        <div className="shrink-0 flex gap-2">
          {ad.status === 'draft' && (
            <Button size="sm" disabled={busy} onClick={handleSubmit} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Submit for Review
            </Button>
          )}
          {ad.status === 'active' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={handlePause}>Pause</Button>
          )}
          {ad.status === 'paused' && (
            <Button size="sm" disabled={busy} onClick={handleSubmit}>Resubmit</Button>
          )}
        </div>
      </div>
    </Card>
  );
}
