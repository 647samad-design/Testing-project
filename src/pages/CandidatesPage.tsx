import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, MapPin, Building2, Landmark, Scale, Vote as VoteIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CandidateCard } from '@/components/shared/CandidateCard';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { AdSlot } from '@/components/shared/AdSlot';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/StateComponents';
import { getStoredRegion } from '@/services/elections';
import { getAllRegionCandidates, buildRegionBallot, getAllStatesCandidates, getAllStatesBallots, ALL_REGION_CONFIGS, type RegionConfig } from '@/services/regions';
import type { Candidate, BallotContest } from '@/types';

type ViewMode = 'district' | 'all';

const levelOrder = ['federal', 'state', 'local', 'judicial'] as const;
const levelLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  federal: { label: 'Federal Races', icon: Landmark },
  state: { label: 'State Races', icon: Building2 },
  local: { label: 'Local Races', icon: VoteIcon },
  judicial: { label: 'Judicial Races', icon: Scale },
};

export function CandidatesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('district');
  const [region, setRegion] = useState<RegionConfig | null>(null);
  const [districtContests, setDistrictContests] = useState<BallotContest[]>([]);
  const [districtCandidates, setDistrictCandidates] = useState<Candidate[]>([]);
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [allContests, setAllContests] = useState<BallotContest[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const stored = getStoredRegion();
        setRegion(stored);
        if (stored) {
          const ballot = buildRegionBallot(stored);
          setDistrictContests(ballot.contests);
          setDistrictCandidates(getAllRegionCandidates(stored));
        } else {
          // No stored region — district view should be empty until user sets an address
          setDistrictContests([]);
          setDistrictCandidates([]);
        }
        setAllCandidates(getAllStatesCandidates());
        const { contests } = getAllStatesBallots();
        setAllContests(contests);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load candidates.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const contestsByLevel = useMemo(() => {
    if (viewMode !== 'district') return [];
    return levelOrder.map((level) => ({
      level,
      label: levelLabels[level].label,
      icon: levelLabels[level].icon,
      contests: districtContests.filter((c) => c.contest_level === level),
    })).filter((g) => g.contests.length > 0);
  }, [viewMode, districtContests]);

  const allContestsByLevel = useMemo(() => {
    if (viewMode !== 'all') return [];
    return levelOrder.map((level) => ({
      level,
      label: levelLabels[level].label,
      icon: levelLabels[level].icon,
      contests: allContests.filter((c) => c.contest_level === level),
    })).filter((g) => g.contests.length > 0);
  }, [viewMode, allContests]);

  const matchesSearch = (c: Candidate, q: string): boolean => {
    if (!q) return true;
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    const party = (c.party ?? '').toLowerCase();
    return name.includes(q) || party.includes(q);
  };

  if (loading) return <LoadingState message="Loading candidates…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const q = search.trim().toLowerCase();

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Candidates</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Explore biographies, positions, voting records and public statements.
        </p>
        <div className="mt-4">
          <DemoBanner compact />
        </div>
      </div>

      {/* View mode toggle */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex gap-2 rounded-xl border border-border bg-secondary/30 p-1">
          <button
            onClick={() => setViewMode('district')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              viewMode === 'district' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MapPin className="h-4 w-4" />
            In My District
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              viewMode === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-4 w-4" />
            All Candidates
          </button>
        </div>

        {viewMode === 'district' && region && (
          <Card className="p-4 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground">{region.county}, {region.state}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {region.congressional} · {region.state_senate} · {region.state_house}
                </p>
                <Link to="/" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                  Change address
                </Link>
              </div>
            </div>
          </Card>
        )}

        {viewMode === 'district' && !region && (
          <Card className="p-4 rounded-2xl text-center">
            <p className="text-sm text-muted-foreground">
              Enter your address on the home page to see candidates running in your district. Showing all states below.
            </p>
            <Link to="/" className="mt-2 inline-block">
              <Button variant="outline" size="sm">Find My District</Button>
            </Link>
          </Card>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name or party…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 rounded-xl"
            aria-label="Search candidates"
          />
        </div>
      </div>

      {/* District view: grouped by race */}
      {viewMode === 'district' && (
        <>
          {contestsByLevel.map((group) => (
            <section key={group.level} className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <group.icon className="h-4 w-4" />
                {group.label}
              </h2>
              <div className="space-y-6">
                {group.contests.map((contest) => {
                  const contestCands = (contest.candidates ?? []).filter((c) => matchesSearch(c, q));
                  if (contestCands.length === 0) return null;
                  return (
                    <div key={contest.id}>
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-bold text-foreground">{contest.office_name}</h3>
                        <span className="text-sm text-muted-foreground">{contest.seat_description}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {contestCands.map((c) => (
                          <CandidateCard
                            key={c.id}
                            candidate={c}
                            contestLabel={contest.office_name}
                            to={`/candidates/${c.id}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {/* All candidates view: grouped by level then by state */}
      {viewMode === 'all' && (
        allContestsByLevel.map((group) => (
          <section key={group.level} className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <group.icon className="h-4 w-4" />
              {group.label}
            </h2>
            <div className="space-y-6">
              {group.contests.map((contest) => {
                const contestCands = (contest.candidates ?? []).filter((c) => matchesSearch(c, q));
                if (contestCands.length === 0) return null;
                return (
                  <div key={contest.id}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-bold text-foreground">{contest.office_name}</h3>
                      <span className="text-sm text-muted-foreground">{contest.seat_description}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {contestCands.map((c) => (
                        <CandidateCard
                          key={c.id}
                          candidate={c}
                          contestLabel={contest.office_name}
                          to={`/candidates/${c.id}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* No results */}
      {viewMode === 'district' && !region && districtCandidates.length === 0 && (
        <EmptyState
          title="Enter your address to see your district candidates"
          description="Set your location on the home page to view only the candidates running in your district and on your ballot."
          icon={<MapPin className="h-10 w-10" />}
          action={
            <Link to="/">
              <Button variant="outline">Find My District</Button>
            </Link>
          }
        />
      )}

      {viewMode === 'district' && region && districtCandidates.length === 0 && (
        <EmptyState
          title="No candidates found"
          description={search ? `No candidates match "${search}".` : 'No candidates are available for your district yet.'}
          icon={<Users className="h-10 w-10" />}
        />
      )}

      {viewMode === 'all' && allCandidates.length === 0 && (
        <EmptyState
          title="No candidates found"
          description={search ? `No candidates match "${search}".` : 'No candidates are available yet.'}
          icon={<Users className="h-10 w-10" />}
        />
      )}

      {search.trim() && viewMode === 'district' && districtCandidates.some((c) => matchesSearch(c, q)) === false && (
        <EmptyState
          title="No candidates found"
          description={`No candidates match "${search}".`}
          icon={<Users className="h-10 w-10" />}
        />
      )}

      {/* Candidates page ad */}
      <div className="mt-8">
        <AdSlot placement="candidates_page" />
      </div>
    </div>
  );
}
