import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Code2, Copy, Eye, MousePointerClick, Search, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { useAuth } from '@/hooks/use-auth';
import { usePageMeta } from '@/hooks/use-page-meta';
import { embedCode, getMyPartners, getPartnerStats, updatePartnerBranding, type Partner, type PartnerDayStats } from '@/services/partners';
import { SUPPORTED, t } from '@/i18n';
import { LANGUAGE_OPTIONS, type LanguageName } from '@/types';

const LANG_NAMES: Record<string, string> = Object.fromEntries(LANGUAGE_OPTIONS.map((o) => [o.value, o.nativeLabel]));

/** For partner organizations: their embed code, widget stats and branding. */
export function PartnerDashboardPage() {
  usePageMeta({ title: t("Partner dashboard"), description: t("Embed the ballot widget on your website and see how many people use it."), noindex: true });
  const { user, loading: authLoading } = useAuth();
  const [partners, setPartners] = useState<Partner[] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setPartners([]); return; }
    getMyPartners().then(setPartners).catch(() => setPartners([]));
  }, [user, authLoading]);

  if (authLoading || partners === null) return <LoadingState message={t("Loading…")} />;
  if (!user) {
    return <EmptyState title={t("Sign in to your partner account")} description={t("Partner dashboards are for organizations that embed our ballot widget.")} action={<Link to="/signin"><Button>{t("Sign In")}</Button></Link>} />;
  }
  if (partners.length === 0) {
    return <EmptyState title={t("No partner organization yet")} description={t("Want the ballot widget on your website? Contact us and we'll set up your organization.")} action={<Link to="/contact"><Button>{t("Contact us")}</Button></Link>} />;
  }

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <h1 className="flex items-center gap-3 font-display text-4xl font-semibold tracking-tight"><Handshake className="h-8 w-8 text-primary" />{t("Partner dashboard")}</h1>
      <div className="mt-6 space-y-10">
        {partners.map((p) => <PartnerPanel key={p.id} partner={p} onChange={(np) => setPartners((list) => list!.map((x) => (x.id === np.id ? np : x)))} />)}
      </div>
    </div>
  );
}

function PartnerPanel({ partner, onChange }: { partner: Partner; onChange: (p: Partner) => void }) {
  const [stats, setStats] = useState<PartnerDayStats[] | null>(null);
  const [lang, setLang] = useState<LanguageName>('en');
  const [draft, setDraft] = useState({ name: partner.name, website: partner.website ?? '', brand_color: partner.brand_color, logo_url: partner.logo_url ?? '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { getPartnerStats(partner.id, 30).then(setStats).catch(() => setStats([])); }, [partner.id]);

  const totals = useMemo(() => (stats ?? []).reduce((a, d) => ({ views: a.views + d.views, lookups: a.lookups + d.lookups, clicks: a.clicks + d.clicks }), { views: 0, lookups: 0, clicks: 0 }), [stats]);
  const code = embedCode(window.location.origin, partner.slug, lang);

  async function save() {
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.brand_color)) { toast.error(t("Brand color must look like #15776c.")); return; }
    setSaving(true);
    try {
      const updates = { name: draft.name.trim(), website: draft.website.trim() || null, brand_color: draft.brand_color, logo_url: draft.logo_url.trim() || null };
      await updatePartnerBranding(partner.id, updates);
      onChange({ ...partner, ...updates });
      toast.success(t("Saved."));
    } catch {
      toast.error(t("Couldn't save. Check the website and logo links (logo must start with https://)."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-semibold">{partner.name}{!partner.is_active && <span className="ml-2 text-sm font-normal text-destructive">({t("inactive")})</span>}</h2>

      <div className="mt-4 grid grid-cols-3 gap-3 [&>*]:min-w-0">
        <StatTile icon={Eye} label={t("Widget views")} value={totals.views} />
        <StatTile icon={Search} label={t("Ballot lookups")} value={totals.lookups} />
        <StatTile icon={MousePointerClick} label={t("Visits to full ballot")} value={totals.clicks} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("Last 30 days")}</p>

      {stats && stats.length > 0 && (
        <Card className="mt-4 h-64 rounded-2xl p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.map((d) => ({ ...d, day: d.day.slice(5) }))}>
              <XAxis dataKey="day" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={32} />
              <Tooltip />
              <Legend />
              <Bar dataKey="views" name={t("Widget views")} fill="hsl(var(--primary) / 0.35)" />
              <Bar dataKey="lookups" name={t("Ballot lookups")} fill="hsl(var(--primary))" />
              <Bar dataKey="clicks" name={t("Visits to full ballot")} fill="hsl(var(--accent))" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card className="mt-4 rounded-2xl p-5">
        <h3 className="flex items-center gap-2 font-semibold"><Code2 className="h-4 w-4 text-primary" />{t("Embed code")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("Paste this where you want the widget to appear on your website.")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={`lang-${partner.id}`}>{t("Language")}</label>
          <select id={`lang-${partner.id}`} value={lang} onChange={(e) => setLang(e.target.value as LanguageName)} className="rounded-lg border border-input bg-background px-2 py-1 text-sm">
            {SUPPORTED.map((l) => <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>)}
          </select>
        </div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-secondary p-3 text-xs">{code}</pre>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigator.clipboard.writeText(code).then(() => toast.success(t("Copied to clipboard")))}><Copy className="h-3.5 w-3.5" />{t("Copy code")}</Button>
          <a href={`${lang === 'en' ? '' : `/${lang}`}/embed?partner=${partner.slug}`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline">{t("Preview")}</Button></a>
        </div>
      </Card>

      <Card className="mt-4 rounded-2xl p-5">
        <h3 className="font-semibold">{t("Branding")}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <label className="text-sm">{t("Organization name")}<Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1" /></label>
          <label className="text-sm">{t("Website")}<Input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://" className="mt-1" /></label>
          <label className="text-sm">{t("Logo URL (https)")}<Input value={draft.logo_url} onChange={(e) => setDraft({ ...draft, logo_url: e.target.value })} placeholder="https://" className="mt-1" /></label>
          <label className="text-sm">{t("Brand color")}
            <span className="mt-1 flex items-center gap-2">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.brand_color) ? draft.brand_color : '#15776c'} onChange={(e) => setDraft({ ...draft, brand_color: e.target.value })} className="h-10 w-12 rounded border border-input" aria-label={t("Brand color")} />
              <Input value={draft.brand_color} onChange={(e) => setDraft({ ...draft, brand_color: e.target.value })} />
            </span>
          </label>
        </div>
        <Button className="mt-4" onClick={save} disabled={saving}>{saving ? t("Saving…") : t("Save")}</Button>
      </Card>
    </section>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <Card className="rounded-2xl p-4">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
