import { useState } from 'react';
import { CheckCircle2, ExternalLink, Mail, MapPin, Navigation, Search, UserCheck, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { voteLinksFor, directionsUrl } from '@/lib/vote-links';
import { getCachedVoterInfo, getVoterInfo, type VoterInfo, type VotingSite } from '@/services/voter-info';
import { parseDateOnly } from '@/lib/date-utils';
import { t, dateLocale } from '@/i18n';

interface VoteReadyCardProps {
  /** Two-letter state code, e.g. "FL". */
  statePostal?: string;
  className?: string;
}

/** "Get ready to vote": register / check registration / vote by mail links for
 * the voter's state, plus a where-to-vote lookup for their home address. */
export function VoteReadyCard({ statePostal, className }: VoteReadyCardProps) {
  const cached = getCachedVoterInfo();
  const [address, setAddress] = useState(cached?.address ?? '');
  const [info, setInfo] = useState<VoterInfo | null>(cached?.info ?? null);
  const [loading, setLoading] = useState(false);
  const links = voteLinksFor(statePostal, info?.links);

  async function lookup() {
    const a = address.trim();
    if (a.length < 5) return;
    setLoading(true);
    setInfo(await getVoterInfo(a));
    setLoading(false);
  }

  return (
    <Card className={`rounded-2xl p-5 sm:p-6 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">{t("Get ready to vote")}</h2>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3 [&>*]:min-w-0">
        <ActionLink href={links.checkRegistration} icon={UserCheck} label={t("Am I registered?")} />
        <ActionLink href={links.register} icon={CheckCircle2} label={t("Register & deadlines")} />
        <ActionLink href={links.voteByMail} icon={Mail} label={t("Vote by mail")} />
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-primary" />{t("Where do I vote?")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("Enter your home street address to find your polling place, early voting sites and ballot drop boxes.")}</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); lookup(); }}
        >
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
        <p className="mt-2 text-[11px] text-muted-foreground">{t("Your address is only used for this lookup and is not saved to your account.")}</p>

        {info && !loading && <VoterInfoResults info={info} fallbackUrl={links.pollingPlace} />}
      </div>
    </Card>
  );
}

function ActionLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 touch-target"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
      <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

function VoterInfoResults({ info, fallbackUrl }: { info: VoterInfo; fallbackUrl: string }) {
  if (info.status !== 'ok') {
    const message = {
      no_sites: t("Your election office hasn't published voting locations for this address yet."),
      no_data: t("We couldn't find voting locations for this address. Check the address, or try again closer to Election Day."),
      not_configured: t("Polling place lookup isn't available right now."),
      invalid_address: t("Please enter your full street address."),
      unavailable: t("Polling place lookup isn't available right now."),
    }[info.status as Exclude<VoterInfo['status'], 'ok'>] ?? t("Polling place lookup isn't available right now.");
    return (
      <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-3 text-sm">
        <p className="text-muted-foreground">{message}</p>
        <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline">
          {t("Use the official polling place finder")}<ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {info.mailOnly && (
        <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{t("This address votes by mail. Watch for your ballot in the mail and return it by the deadline.")}</p>
      )}
      <SiteList title={t("Your polling place on Election Day")} sites={info.pollingLocations ?? []} />
      <SiteList title={t("Early voting sites")} sites={info.earlyVoteSites ?? []} />
      <SiteList title={t("Ballot drop boxes")} sites={info.dropOffLocations ?? []} />
      <p className="text-[11px] text-muted-foreground">{t("Locations come from your election office via the Voting Information Project. Always confirm with your local election office before you go.")}</p>
    </div>
  );
}

function fmtDay(d: string | null): string | null {
  if (!d) return null;
  const parsed = parseDateOnly(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });
}

function SiteList({ title, sites }: { title: string; sites: VotingSite[] }) {
  if (sites.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <ul className="mt-2 space-y-2">
        {sites.slice(0, 5).map((s, i) => {
          const from = fmtDay(s.startDate);
          const to = fmtDay(s.endDate);
          return (
            <li key={`${s.address}-${i}`} className="rounded-xl border border-border p-3 text-sm">
              {s.name && <p className="font-semibold text-foreground">{s.name}</p>}
              <p className="text-muted-foreground">{s.address}</p>
              {(from || s.hours) && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{[from && (to && to !== from ? `${from} – ${to}` : from), s.hours].filter(Boolean).join(' · ')}</span>
                </p>
              )}
              {s.notes && <p className="mt-1 text-xs text-muted-foreground">{s.notes}</p>}
              <a href={directionsUrl(s.address)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Navigation className="h-3.5 w-3.5" />{t("Directions")}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
