import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CalendarDays, MapPin, ArrowLeft, FileText, Gavel, Vote, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BallotContestCard } from '@/components/shared/BallotContestCard';
import { BallotMeasureCard } from '@/components/shared/BallotMeasureCard';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { SponsorBadge } from '@/components/shared/SponsorBadge';
import { AdSlot } from '@/components/shared/AdSlot';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/StateComponents';
import { getVoterBallot, getVoterDistricts } from '@/services/elections';
import { getLocation } from '@/services/districts';
import { useAuth } from '@/hooks/use-auth';
import type { BallotContest, BallotMeasure, Election, DistrictResult } from '@/types';
import { usePageMeta } from '@/hooks/use-page-meta';
import { extractZip, INVALID_ZIP_MESSAGE } from '@/lib/zip';
import { isDemoMode } from '@/lib/demo-mode';
import { parseDateOnly } from '@/lib/date-utils';
import { ElectionResultsCard } from '@/components/shared/ElectionResultsCard';
import { toStatePostal } from '@/lib/us-states';

const levelOrder = ['federal', 'state', 'local', 'judicial'] as const;
const levelLabels: Record<string, string> = {
  federal: 'Federal',
  state: 'State',
  local: 'Local',
  judicial: 'Judicial',
};

export function MyBallotPage() {
  usePageMeta({ title: 'My Ballot', description: 'See your personalized ballot with every race and measure for your address.' });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [needsAddress, setNeedsAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [election, setElection] = useState<Election | null>(null);
  const [contests, setContests] = useState<BallotContest[]>([]);
  const [isDemoBallot, setIsDemoBallot] = useState(false);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [districts, setDistricts] = useState<DistrictResult | null>(null);
  const [ballotScope, setBallotScope] = useState<'district' | 'state' | undefined>(undefined);

  async function loadBallotFor(savedAddress: string) {
    // A stored address that isn't a ZIP (e.g. typed before validation existed)
    // goes back to the form instead of producing a made-up sample ballot.
    if (!extractZip(savedAddress)) {
      sessionStorage.removeItem('ballotlens_address');
      setAddressInput(savedAddress);
      setAddressError(INVALID_ZIP_MESSAGE);
      setNeedsAddress(true);
      setLoading(false);
      return;
    }
    setShowSample(false);
    sessionStorage.setItem('ballotlens_address', savedAddress);
    setAddress(savedAddress);
    setNeedsAddress(false);
    setLoading(true);
    setError(null);

    getVoterDistricts(savedAddress).then(setDistricts).catch(() => {});

    const result = await getVoterBallot(savedAddress);
    if (result.error) {
      setError(result.error);
    } else {
      setElection(result.election);
      setContests(result.contests);
      setMeasures(result.measures);
      setBallotScope(result.scope);
      setIsDemoBallot(!!result.isDemo);
    }
    setLoading(false);
  }

  function handleAddressSubmit() {
    if (!addressInput.trim()) return;
    if (!extractZip(addressInput)) { setAddressError(INVALID_ZIP_MESSAGE); return; }
    setAddressError(null);
    loadBallotFor(addressInput.trim());
  }

  useEffect(() => {
    async function init() {
      let savedAddress = sessionStorage.getItem('ballotlens_address');

      if (!savedAddress && user) {
        const loc = await getLocation();
        if (loc) {
          savedAddress = loc.city ? `${loc.city}, ${loc.state} ${loc.zip_code}` : loc.zip_code;
          sessionStorage.setItem('ballotlens_address', savedAddress);
        }
      }

      if (!savedAddress) {
        // Previously silently redirected to "/" with no explanation --
        // "My Ballot" is a primary header nav link, so a first-time visitor
        // clicking it directly (the normal way anyone would reach this
        // page) would just get bounced back to the page they were probably
        // already on, with nothing telling them why or what to do next.
        // This page now asks for the address itself instead of assuming
        // one was already entered somewhere else.
        setNeedsAddress(true);
        setLoading(false);
        return;
      }

      await loadBallotFor(savedAddress);
    }
    init();
  }, [user]);

  // Group contests by level
  const contestsByLevel = levelOrder.map((level) => ({
    level,
    label: levelLabels[level],
    contests: contests.filter((c) => c.contest_level === level),
  })).filter((g) => g.contests.length > 0);

  if (needsAddress) {
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 py-16 text-center animate-fade-in">
        <MapPin className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-2xl font-semibold">Find your ballot</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your address or ZIP code to see every race and measure on your ballot.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddressSubmit()}
            placeholder="Enter your ZIP code"
            className="flex-1 rounded-xl border border-input bg-background px-4 py-3 text-base"
            aria-label="Enter your address or ZIP code"
          />
          <Button size="lg" onClick={handleAddressSubmit} disabled={!addressInput.trim()} className="rounded-xl font-semibold">
            See My Ballot
          </Button>
        </div>
        {addressError && <p role="alert" className="mt-3 text-sm text-destructive">{addressError}</p>}
      </div>
    );
  }

  // No real ballot data for this area. Previously a full ballot of generated,
  // fictional candidates was shown (with only a banner); a real voter should
  // be told plainly, and see the sample only if they ask for it.
  if (!loading && !error && isDemoBallot && !isDemoMode() && !showSample) {
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 py-16 text-center animate-fade-in">
        <MapPin className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-2xl font-semibold">We don’t cover your area yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          BallotLens doesn’t have verified ballot information for {districts?.state ? `${districts.state}` : 'this ZIP code'} yet.
          Check your state or county election office for your official sample ballot.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => { sessionStorage.removeItem('ballotlens_address'); setAddressInput(''); setNeedsAddress(true); }}>Try another ZIP</Button>
          <Button variant="outline" onClick={() => setShowSample(true)}>See an example ballot</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <LoadingState message="Finding your ballot…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Ballot unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (contests.length === 0 && measures.length === 0) {
    return (
      <EmptyState
        title="No ballot information yet"
        description="We don't have verified ballot information for this location yet. Check back closer to election day."
        action={
          <Link to="/">
            <Button variant="outline">Enter a different address</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Change address
        </Link>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
          My Ballot
        </h1>
        {/* The election was loaded but never shown; its date is the most
            important fact on this page. */}
        {election && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{election.name}</span>
            {election.election_date && (() => {
              const d = parseDateOnly(election.election_date);
              const days = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
              return (
                <span className="text-muted-foreground">
                  <span className="hidden sm:inline">· </span>
                  {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  {days > 1 ? ` · in ${days} days` : days === 1 ? ' · tomorrow' : days === 0 ? ' · today' : ''}
                </span>
              );
            })()}
          </p>
        )}
        {/* Only the parts we know; an unknown ZIP printed a lone ", ". */}
        {[districts?.county, districts?.state].some((x) => x && x.trim()) && (
          <div className="mt-2 flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">
              {[districts?.county, districts?.state].filter((x) => x && x.trim()).join(', ')}
            </span>
          </div>
        )}

        {/* District breakdown */}
        {districts && (
          <div className="mt-4 flex flex-wrap gap-2">
            {districts.congressional && <DistrictChip icon={Building2} text={districts.congressional} />}
            {districts.state_senate && <DistrictChip icon={Vote} text={districts.state_senate} />}
            {districts.state_house && <DistrictChip icon={Vote} text={districts.state_house} />}
            {districts.judicial && <DistrictChip icon={Gavel} text={districts.judicial} />}
            {districts.school && <DistrictChip icon={FileText} text={districts.school} />}
          </div>
        )}

        <div className="mt-4">
          <DemoBanner compact show={isDemoBallot} />
        </div>

        {ballotScope === 'state' && (
          <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            We couldn't match your ZIP code to specific districts yet, so this shows every race in your state.
            Races for other cities or districts may appear here — check the district on each race.
          </p>
        )}

        <p className="mt-3 text-sm text-muted-foreground">
          Your ballot may change depending on your address. Enter a different ZIP code to see races for another location.
        </p>
      </div>

      {/* AP race calls / certified results for the voter's state. Renders
          nothing until results exist. This card existed but was never placed
          on any page, so "race called" notifications had nowhere to lead. */}
      {toStatePostal(districts?.state) && (
        <div className="mb-6">
          <ElectionResultsCard state={toStatePostal(districts?.state)} title="Results in your state" />
        </div>
      )}

      {/* Election guide sponsor */}
      <SponsorBadge placement="election_guide" className="mb-6" />

      {/* Contests by level */}
      {contestsByLevel.map((group) => (
        <section key={group.level} className="mb-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.contests.map((contest) => (
              <BallotContestCard key={contest.id} contest={contest} />
            ))}
          </div>
        </section>
      ))}

      {/* Ballot Measures */}
      {measures.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Ballot Measures
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {measures.map((measure) => (
              <BallotMeasureCard key={measure.id} measure={measure} />
            ))}
          </div>
        </section>
      )}

      {/* Election page ad */}
      <AdSlot placement="election_page" className="mt-8" />
    </div>
  );
}

function DistrictChip({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}
