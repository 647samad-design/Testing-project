import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, GitCompare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { CandidateCard } from '@/components/shared/CandidateCard';
import { RaceComparison } from '@/components/shared/RaceComparison';
import { OfficeDescriptionCard } from '@/components/shared/OfficeDescriptionCard';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { supabase } from '@/lib/supabase';
import { getDemoContestById, getDemoMeasureById } from '@/services/demo-data';
import type { BallotContest, BallotMeasure, Candidate, District } from '@/types';

export function ContestDetailPage() {
  const { contestId } = useParams<{ contestId: string }>();
  const [contest, setContest] = useState<BallotContest | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contestId) return;
    async function load() {
      let result: BallotContest | null = null;
      let cands: Candidate[] = [];

      try {
        const { data: c } = await supabase
          .from('ballot_contests')
          .select('id, election_id, district_id, office_name, contest_level, seat_description, term_length')
          .eq('id', contestId!)
          .maybeSingle();

        if (c) {
          let district: District | null = null;
          if (c.district_id) {
            const { data: d } = await supabase
              .from('districts')
              .select('id, name, district_type, state')
              .eq('id', c.district_id)
              .maybeSingle();
            district = d as District | null;
          }
          result = { ...c, district } as BallotContest;

          const { data: offices } = await supabase
            .from('candidate_offices')
            .select('candidate_id')
            .eq('contest_id', contestId!);

          const candidateIds = (offices ?? []).map((o) => o.candidate_id);
          if (candidateIds.length > 0) {
            const { data: dbCands } = await supabase
              .from('candidates')
              .select('*')
              .in('id', candidateIds)
              .order('last_name');
            cands = (dbCands ?? []) as Candidate[];
          }
        }
      } catch {
        // Database unreachable — fall through to demo data
      }

      if (!result) {
        result = getDemoContestById(contestId!);
        if (result) {
          cands = result.candidates ?? [];
        }
      }

      setContest(result);
      setCandidates(cands);
      setLoading(false);
    }
    load();
  }, [contestId]);

  if (loading) return <LoadingState message="Loading contest…" />;
  if (!contest) return <EmptyState title="Contest not found" description="This contest may not exist or has been removed." />;

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <Link to="/ballot" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to ballot
      </Link>

      <div className="mt-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
            {contest.contest_level}
          </span>
          {contest.district && (
            <span className="text-sm text-muted-foreground">{contest.district.name}</span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{contest.office_name}</h1>
        {contest.seat_description && (
          <p className="mt-1 text-muted-foreground">{contest.seat_description}</p>
        )}
        {contest.term_length && (
          <p className="mt-1 text-sm text-muted-foreground">Term: {contest.term_length}</p>
        )}
        <div className="mt-4">
          <DemoBanner compact />
        </div>
      </div>

      {/* What does this office do? */}
      <div className="mb-8">
        <OfficeDescriptionCard officeName={contest.office_name} />
      </div>

      {/* Side-by-side comparison on the issues */}
      {candidates.length >= 2 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Compare on the Issues</h2>
          </div>
          <RaceComparison candidates={candidates} contestId={contest.id} />
        </div>
      )}

      <h2 className="mb-4 text-lg font-semibold">Candidates in this race</h2>
      {candidates.length === 0 ? (
        <EmptyState
          title="No candidates yet"
          description="There are no candidates registered for this race yet."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <CandidateCard key={c.id} candidate={c} contestLabel={contest.office_name} />
          ))}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-border bg-secondary/30 p-4">
        <p className="text-sm text-muted-foreground">
          BallotLens does not endorse or recommend candidates. Research each candidate's
          positions, voting records and public statements, then make your own decision.
        </p>
      </div>
    </div>
  );
}

export function MeasureDetailPage() {
  const { measureId } = useParams<{ measureId: string }>();
  const [measure, setMeasure] = useState<BallotMeasure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!measureId) return;
    async function load() {
      let result: BallotMeasure | null = null;
      try {
        const { data } = await supabase
          .from('ballot_measures')
          .select('*')
          .eq('id', measureId!)
          .maybeSingle();
        result = data as BallotMeasure | null;
      } catch {
        // Database unreachable — fall through to demo data
      }
      if (!result) {
        result = getDemoMeasureById(measureId!);
      }
      setMeasure(result);
      setLoading(false);
    }
    load();
  }, [measureId]);

  if (loading) return <LoadingState message="Loading measure…" />;
  if (!measure) return <EmptyState title="Measure not found" description="This ballot measure may not exist or has been removed." />;

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <Link to="/ballot" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to ballot
      </Link>

      <div className="mt-4 mb-6">
        <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
          {measure.measure_type}
        </span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{measure.title}</h1>
        <div className="mt-4">
          <DemoBanner compact />
        </div>
      </div>

      {measure.summary && (
        <Card className="p-6 mb-4">
          <h2 className="font-semibold mb-2">Summary</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{measure.summary}</p>
        </Card>
      )}

      {measure.plain_english_summary && (
        <Card className="p-6 mb-4 bg-secondary/30">
          <h2 className="font-semibold mb-2">In Plain English</h2>
          <p className="text-sm text-foreground leading-relaxed">{measure.plain_english_summary}</p>
        </Card>
      )}

      {measure.eli5_explanation && (
        <Card className="p-6 mb-4 bg-accent/5">
          <h2 className="font-semibold mb-2">Explain Like I'm 5</h2>
          <p className="text-sm text-foreground leading-relaxed">{measure.eli5_explanation}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {measure.arguments_for && (
          <Card className="p-6">
            <h2 className="font-semibold mb-2 text-success">Arguments For</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{measure.arguments_for}</p>
          </Card>
        )}
        {measure.arguments_against && (
          <Card className="p-6">
            <h2 className="font-semibold mb-2 text-destructive">Arguments Against</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{measure.arguments_against}</p>
          </Card>
        )}
      </div>

      {measure.full_text_url && (
        <div className="mt-4">
          <a href={measure.full_text_url} target="_blank" rel="noopener noreferrer">
            <button className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary">
              Read Full Text
            </button>
          </a>
        </div>
      )}

      <div className="mt-8 rounded-lg border border-border bg-secondary/30 p-4">
        <p className="text-sm text-muted-foreground">
          BallotLens presents arguments for and against ballot measures as reported in
          public records. Always consult your official voter guide for the full text and
          official analysis.
        </p>
      </div>
    </div>
  );
}
