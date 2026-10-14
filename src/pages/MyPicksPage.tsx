import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Check, ListChecks, MapPin, Printer, Share2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { useMyPicks } from '@/components/shared/PickControls';
import { getVoterBallot } from '@/services/elections';
import { getCachedVoterInfo } from '@/services/voter-info';
import { countPicks } from '@/services/picks';
import { downloadIcs } from '@/lib/ics';
import { parseDateOnly } from '@/lib/date-utils';
import { usePageMeta } from '@/hooks/use-page-meta';
import type { BallotContest, BallotMeasure, Election } from '@/types';
import { t, dateLocale } from '@/i18n';

/** A printable / shareable cheat sheet of the voter's own picks. */
export function MyPicksPage() {
  usePageMeta({ title: t("My Picks"), description: t("Your choices for every race on your ballot, ready to print or share."), noindex: true });
  const picks = useMyPicks();
  const [loading, setLoading] = useState(true);
  const [address] = useState(() => {
    try { return sessionStorage.getItem('ballotlens_address'); } catch { return null; }
  });
  const [election, setElection] = useState<Election | null>(null);
  const [contests, setContests] = useState<BallotContest[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const polling = getCachedVoterInfo()?.info.pollingLocations?.[0];

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    getVoterBallot(address).then((r) => {
      setElection(r.election);
      setContests(r.contests);
      setMeasures(r.measures);
      setLoading(false);
    });
  }, [address]);

  if (loading) return <LoadingState message={t("Loading your picks…")} />;
  if (!address) {
    return (
      <EmptyState
        title={t("Find your ballot first")}
        description={t("Enter your ZIP code on My Ballot, then pick a candidate in each race.")}
        action={<Link to="/ballot"><Button>{t("Go to My Ballot")}</Button></Link>}
      />
    );
  }

  const dateText = election?.election_date
    ? parseDateOnly(election.election_date).toLocaleDateString(dateLocale(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const lines: string[] = [];
  for (const c of contests) {
    const cand = c.candidates?.find((x) => x.id === picks.contests[c.id]);
    if (cand) lines.push(`${c.office_name}: ${cand.first_name} ${cand.last_name}${cand.party ? ` (${t(cand.party)})` : ''}`);
  }
  for (const m of measures) {
    const ch = picks.measures[m.id];
    if (ch) lines.push(`${m.title}: ${ch === 'yes' ? t("Yes") : t("No")}`);
  }
  const shareText = [t("My Picks"), election ? `${election.name}${dateText ? ` · ${dateText}` : ''}` : null, '', ...lines].filter((x) => x !== null).join('\n');

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: t("My Picks"), text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast.success(t("Copied to clipboard"));
      }
    } catch {
      /* user cancelled the share sheet */
    }
  }

  function addToCalendar() {
    if (!election?.election_date) return;
    downloadIcs({
      title: `${t("Vote")}: ${election.name}`,
      date: election.election_date,
      location: polling?.address,
      description: lines.join('\n'),
      url: window.location.origin,
    });
  }

  const picked = countPicks({
    contests: Object.fromEntries(Object.entries(picks.contests).filter(([id]) => contests.some((c) => c.id === id))),
    measures: Object.fromEntries(Object.entries(picks.measures).filter(([id]) => measures.some((m) => m.id === id))),
  });
  const total = contests.length + measures.length;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 animate-fade-in print:max-w-none print:p-0">
      <Link to="/ballot" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary print:hidden">
        <ArrowLeft className="h-4 w-4" />{t("Back to ballot")}
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-4xl font-semibold tracking-tight">
            <ListChecks className="h-8 w-8 text-primary print:hidden" />{t("My Picks")}
          </h1>
          {election && (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{election.name}</span>{dateText ? ` · ${dateText}` : ''}
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground print:hidden">{t("{n} of {total} choices made", { n: picked, total })}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" />{t("Print")}</Button>
          <Button variant="outline" className="gap-2" onClick={share} disabled={lines.length === 0}><Share2 className="h-4 w-4" />{t("Share")}</Button>
          {election?.election_date && (
            <Button variant="outline" className="gap-2" onClick={addToCalendar}><CalendarPlus className="h-4 w-4" />{t("Add to calendar")}</Button>
          )}
        </div>
      </div>

      {polling && (
        <Card className="mt-6 flex items-start gap-3 rounded-2xl p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("Your polling place on Election Day")}</p>
            {polling.name && <p className="font-semibold">{polling.name}</p>}
            <p className="text-sm text-muted-foreground">{polling.address}</p>
            {polling.hours && <p className="text-xs text-muted-foreground">{polling.hours}</p>}
          </div>
        </Card>
      )}

      <div className="mt-6 space-y-2">
        {contests.map((c) => {
          const cand = c.candidates?.find((x) => x.id === picks.contests[c.id]);
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 break-inside-avoid">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{c.office_name}</p>
                {c.district?.name && <p className="text-xs text-muted-foreground">{c.district.name}</p>}
              </div>
              {cand ? (
                <p className="flex shrink-0 items-center gap-1.5 text-right font-semibold text-primary">
                  <Check className="h-4 w-4" />{cand.first_name} {cand.last_name}
                  {cand.party && <span className="text-xs font-normal text-muted-foreground">{t(cand.party)}</span>}
                </p>
              ) : (
                <Link to={`/ballot/${c.id}`} className="shrink-0 text-sm text-muted-foreground hover:text-primary">
                  <span className="print:hidden">{t("Research this race")} →</span>
                  <span className="hidden print:inline">______________</span>
                </Link>
              )}
            </div>
          );
        })}
        {measures.map((m) => {
          const ch = picks.measures[m.id];
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 break-inside-avoid">
              <p className="min-w-0 font-semibold text-foreground">{m.title}</p>
              {ch ? (
                <p className="flex shrink-0 items-center gap-1.5 font-semibold text-primary"><Check className="h-4 w-4" />{ch === 'yes' ? t("Yes") : t("No")}</p>
              ) : (
                <Link to={`/ballot/measure/${m.id}`} className="shrink-0 text-sm text-muted-foreground hover:text-primary">
                  <span className="print:hidden">{t("Understand this measure")} →</span>
                  <span className="hidden print:inline">{t("Yes")} ☐  {t("No")} ☐</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("Your picks are private. They are saved only to your account (or this device if you're signed out) and are never shared unless you share them.")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t("Some states limit phones in the voting booth. A printed copy is the safest way to bring your picks.")}</p>
    </div>
  );
}
