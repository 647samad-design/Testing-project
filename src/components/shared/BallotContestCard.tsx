import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Scale, ChevronDown, GitCompare, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { DistrictBadge } from './DistrictBadge';
import { compareCandidates } from '@/services/candidates';
import { getUserIssues } from '@/services/districts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { BallotContest, Candidate, CandidatePosition, Issue } from '@/types';
import { cn } from '@/lib/utils';

interface BallotContestCardProps {
  contest: BallotContest;
  className?: string;
}

const levelVariant = {
  federal: 'federal' as const,
  state: 'state' as const,
  local: 'local' as const,
  judicial: 'judicial' as const,
};

const levelLabel = {
  federal: 'Federal',
  state: 'State',
  local: 'Local',
  judicial: 'Judicial',
};

// Key issues shown in the quick comparison
const QUICK_ISSUE_SLUGS = [
  'healthcare',
  'economy',
  'immigration',
  'abortion-reproductive-rights',
  'gun-policy',
  'climate',
];

export function BallotContestCard({ contest, className }: BallotContestCardProps) {
  const { user } = useAuth();
  const isJudicial = contest.contest_level === 'judicial';
  const candidates = contest.candidates ?? [];
  const hasMultipleCandidates = candidates.length >= 2;

  const [expanded, setExpanded] = useState(false);
  const [positions, setPositions] = useState<Record<string, CandidatePosition[]>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [userIssueIds, setUserIssueIds] = useState<Set<string>>(new Set());
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    if (!expanded || !hasMultipleCandidates || Object.keys(positions).length > 0) return;

    async function loadComparison() {
      setLoadingComparison(true);
      const candidateIds = candidates.map((c) => c.id);

      // Load issues (filtered to quick set), user issues, and positions in parallel
      const [issuesRes, userIssuesRes, posResult] = await Promise.all([
        supabase.from('issues').select('id, name, slug, category, is_custom').in('slug', QUICK_ISSUE_SLUGS),
        user ? getUserIssues() : Promise.resolve([]),
        compareCandidates(candidateIds),
      ]);

      const issueList = (issuesRes.data ?? []) as Issue[];
      setIssues(issueList);
      setUserIssueIds(new Set((userIssuesRes ?? []).map((i) => i.id)));
      setPositions(posResult);
      setLoadingComparison(false);
    }
    loadComparison();
  }, [expanded, hasMultipleCandidates, candidates, positions.length, user]);

  return (
    <Card className={cn('p-6 rounded-2xl transition-shadow hover:shadow-md', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DistrictBadge
              text={levelLabel[contest.contest_level]}
              variant={levelVariant[contest.contest_level]}
            />
            {contest.district && (
              <span className="text-xs text-muted-foreground">{contest.district.name}</span>
            )}
          </div>
          <h3 className="mt-2 font-bold text-foreground">{contest.office_name}</h3>
          {contest.seat_description && (
            <p className="text-sm text-muted-foreground">{contest.seat_description}</p>
          )}
        </div>
        {isJudicial && <Scale className="h-5 w-5 text-muted-foreground shrink-0" />}
      </div>

      {candidates.length > 0 ? (
        <div className="mt-4 space-y-2">
          {candidates.slice(0, 3).map((c) => (
            <Link
              key={c.id}
              to={`/candidates/${c.id}`}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-secondary touch-target"
            >
              <Avatar className="h-7 w-7">
                {c.photo_url ? (
                  <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-xs">{c.first_name[0]}{c.last_name[0]}</AvatarFallback>
                )}
              </Avatar>
              <span className="font-medium text-foreground">
                {c.first_name} {c.last_name}
              </span>
              {c.party && (
                <span className="text-xs text-muted-foreground">{c.party}</span>
              )}
            </Link>
          ))}
          {candidates.length > 3 && (
            <p className="px-3 text-xs text-muted-foreground">
              +{candidates.length - 3} more candidate{candidates.length - 3 === 1 ? '' : 's'}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No candidate information available yet.
        </p>
      )}

      {/* Inline quick comparison toggle */}
      {hasMultipleCandidates && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 flex w-full items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary touch-target"
        >
          <GitCompare className="h-4 w-4 text-primary" />
          {expanded ? 'Hide comparison' : 'Quick comparison on issues'}
          <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}

      {/* Inline comparison content */}
      {expanded && hasMultipleCandidates && (
        <div className="mt-3 animate-fade-in">
          {loadingComparison ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading positions…</p>
          ) : issues.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No issue data available yet.</p>
          ) : (
            <div className="space-y-3">
              {issues.slice(0, 4).map((issue) => {
                const isUserIssue = userIssueIds.has(issue.id);
                return (
                  <div key={issue.id} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      {isUserIssue && <Star className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />}
                      <h4 className={cn('text-sm font-semibold', isUserIssue ? 'text-primary' : 'text-foreground')}>
                        {issue.name}
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {candidates.slice(0, 4).map((c) => {
                        const pos = (positions[c.id] ?? []).find((p) => p.issue_id === issue.id);
                        return (
                          <div key={c.id} className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground">
                                {c.first_name} {c.last_name}
                              </span>
                              <span className="text-muted-foreground">{c.party}</span>
                            </div>
                            {pos && pos.summary ? (
                              <p className="mt-0.5 text-muted-foreground leading-relaxed line-clamp-2">
                                {pos.summary}
                              </p>
                            ) : (
                              <p className="mt-0.5 italic text-muted-foreground/70">No verified position on record.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <Link
                to={`/ballot/${contest.id}`}
                className="flex items-center justify-center gap-1 rounded-lg border border-primary/20 bg-primary/5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 touch-target"
              >
                View full comparison <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      <Link
        to={`/ballot/${contest.id}`}
        className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80 touch-target"
      >
        {isJudicial ? 'Research this race' : 'Research this race'}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}
