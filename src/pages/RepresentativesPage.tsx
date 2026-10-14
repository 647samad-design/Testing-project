import { useState } from 'react';
import { Landmark, Mail, Phone, Globe, Search, ChevronDown, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SponsoredBillsList } from '@/components/shared/SponsoredBillsList';
import { getRepresentatives, type Representative, type RepsStatus } from '@/services/representatives';
import { getCachedVoterInfo } from '@/services/voter-info';
import { usePageMeta } from '@/hooks/use-page-meta';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/** "Who represents me": current members of Congress and state legislators. */
export function RepresentativesPage() {
  usePageMeta({ title: t("Who represents me?"), description: t("Find your members of Congress and state legislators, how to contact them, and the bills they sponsor.") });
  const [address, setAddress] = useState(() => getCachedVoterInfo()?.address ?? '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RepsStatus | null>(null);
  const [reps, setReps] = useState<Representative[]>([]);
  const [matched, setMatched] = useState('');

  async function lookup() {
    if (address.trim().length < 5) return;
    setLoading(true);
    const r = await getRepresentatives(address.trim());
    setStatus(r.status);
    setReps(r.representatives ?? []);
    setMatched(r.matchedAddress ?? '');
    setLoading(false);
  }

  const federal = reps.filter((r) => r.level === 'federal');
  const state = reps.filter((r) => r.level === 'state');

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <h1 className="flex items-center gap-3 font-display text-4xl font-semibold tracking-tight">
        <Landmark className="h-8 w-8 text-primary" />{t("Who represents me?")}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t("Find your members of Congress and state legislators, how to contact them, and the bills they sponsor.")}</p>

      <Card className="mt-6 rounded-2xl p-5">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("e.g., 123 Main St, Fernandina Beach, FL 32034")}
            aria-label={t("Home street address")}
            autoComplete="street-address"
            className="flex-1"
          />
          <Button type="submit" disabled={loading || address.trim().length < 5} className="gap-2">
            <Search className="h-4 w-4" />{loading ? t("Searching…") : t("Find")}
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("Use your full street address: districts can split a ZIP code. Your address is not saved.")}</p>
      </Card>

      {status && status !== 'ok' && !loading && (
        <p className="mt-6 rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
          {status === 'no_match'
            ? t("We couldn't match that address. Check the street, city and ZIP code and try again.")
            : status === 'invalid_address'
              ? t("Please enter your full street address.")
              : t("This lookup isn't available right now. Please try again later.")}
        </p>
      )}

      {status === 'ok' && !loading && (
        <div className="mt-8 space-y-10">
          {matched && <p className="text-xs text-muted-foreground">{t("Results for")} <span className="font-medium text-foreground">{matched}</span></p>}
          <RepGroup title={t("U.S. Congress")} reps={federal} />
          <RepGroup title={t("State Legislature")} reps={state} />
          <p className="text-xs text-muted-foreground">{t("Source: Open States, using the U.S. Census geocoder. Governors and local officials aren't included yet.")}</p>
        </div>
      )}
    </div>
  );
}

function RepGroup({ title, reps }: { title: string; reps: Representative[] }) {
  if (reps.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        {reps.map((r) => <RepCard key={r.id} rep={r} />)}
      </div>
    </section>
  );
}

function RepCard({ rep }: { rep: Representative }) {
  const [open, setOpen] = useState(false);
  const initials = rep.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('');
  const where = [rep.level === 'state' ? rep.jurisdiction : null, rep.district && !(rep.level === 'federal' && rep.chamber === 'upper') ? `${t("District")} ${rep.district}` : null].filter(Boolean).join(' · ');
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <Avatar className="h-14 w-14">
          {rep.photo ? <img src={rep.photo} alt={rep.name} className="h-full w-full object-cover" /> : <AvatarFallback>{initials}</AvatarFallback>}
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{rep.name}</p>
          <p className="text-sm text-muted-foreground">{t(rep.title)}{rep.party ? ` · ${t(rep.party)}` : ''}</p>
          {where && <p className="text-xs text-muted-foreground">{where}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {rep.phone && <a href={`tel:${rep.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:border-primary/50 hover:text-primary"><Phone className="h-3.5 w-3.5" />{rep.phone}</a>}
        {rep.email && <a href={`mailto:${rep.email}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:border-primary/50 hover:text-primary"><Mail className="h-3.5 w-3.5" />{t("Email")}</a>}
        {rep.website && <a href={rep.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:border-primary/50 hover:text-primary"><Globe className="h-3.5 w-3.5" />{t("Website")}</a>}
        {rep.profileUrl && <a href={rep.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:border-primary/50 hover:text-primary"><ExternalLink className="h-3.5 w-3.5" />Open States</a>}
      </div>
      {rep.jurisdictionId && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-4 flex w-full items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm font-medium hover:bg-secondary touch-target"
          >
            {t("Recent bills sponsored")}
            <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
          {open && <div className="mt-3"><SponsoredBillsList personId={rep.id} jurisdictionId={rep.jurisdictionId} /></div>}
        </>
      )}
    </Card>
  );
}
