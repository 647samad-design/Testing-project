import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin, ArrowLeft, FileText, Gavel, Vote, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

const levelOrder = ['federal', 'state', 'local', 'judicial'] as const;
const levelLabels: Record<string, string> = {
  federal: 'Federal',
  state: 'State',
  local: 'Local',
  judicial: 'Judicial',
};

export function MyBallotPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { contestId } = useParams();
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [election, setElection] = useState<Election | null>(null);
  const [contests, setContests] = useState<BallotContest[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [districts, setDistricts] = useState<DistrictResult | null>(null);

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
        navigate('/');
        return;
      }
      setAddress(savedAddress);

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
      }
      setLoading(false);
    }
    init();
  }, [navigate, user]);

  // Group contests by level
  const contestsByLevel = levelOrder.map((level) => ({
    level,
    label: levelLabels[level],
    contests: contests.filter((c) => c.contest_level === level),
  })).filter((g) => g.contests.length > 0);

  if (loading) {
    return <LoadingState message="Finding your ballot…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Ballot unavailable"
        message={error}
        onRetry={() => navigate('/')}
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
          My 2026 Ballot
        </h1>
        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">
            {districts?.county ?? 'Your county'}, {districts?.state ?? 'Your state'}
          </span>
        </div>

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
          <DemoBanner compact />
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Your ballot may change depending on your address. Enter a different ZIP code to see races for another location.
        </p>
      </div>

      {/* Election guide sponsor */}
      <div className="mb-6">
        <SponsorBadge placement="election_guide" />
      </div>

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
      <div className="mt-8">
        <AdSlot placement="election_page" />
      </div>
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
