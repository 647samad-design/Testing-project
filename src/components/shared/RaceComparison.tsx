import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Star, ArrowRight, GitCompare, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { compareCandidates } from '@/services/candidates';
import { getUserIssues, getIssues } from '@/services/districts';
import { getTagsForCandidates, tagLabel, tagColor } from '@/services/tags';
import { demoIssues } from '@/services/demo-data';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { Candidate, CandidatePosition, Issue, CandidateTag } from '@/types';
import { cn } from '@/lib/utils';

interface RaceComparisonProps {
  candidates: Candidate[];
  contestId: string;
}

export function RaceComparison({ candidates }: RaceComparisonProps) {
  const { user } = useAuth();
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [userIssueIds, setUserIssueIds] = useState<Set<string>>(new Set());
  const [positions, setPositions] = useState<Record<string, CandidatePosition[]>>({});
  const [tagsByCandidate, setTagsByCandidate] = useState<Record<string, CandidateTag[]>>({});
  const [loading, setLoading] = useState(true);
  const [showAllIssues, setShowAllIssues] = useState(false);

  useEffect(() => {
    async function load() {
      let issuesData: Issue[] = [];
      try {
        const { data } = await supabase.from('issues').select('*').eq('is_custom', false).order('name');
        issuesData = (data ?? []) as Issue[];
      } catch { /* fall through */ }
      if (issuesData.length === 0) issuesData = demoIssues;
      setAllIssues(issuesData);

      if (user) {
        try {
          const uIssues = await getUserIssues();
          setUserIssueIds(new Set(uIssues.map((i) => i.id)));
        } catch { /* ignore */ }
      }

      const candidateIds = candidates.map((c) => c.id);
      if (candidateIds.length >= 2) {
        const [posData, tagData] = await Promise.all([
          compareCandidates(candidateIds),
          getTagsForCandidates(candidateIds),
        ]);
        setPositions(posData);
        setTagsByCandidate(tagData);
      }
      setLoading(false);
    }
    load();
  }, [candidates, user]);

  const sortedIssues = useMemo(() => {
    const userIssues = allIssues.filter((i) => userIssueIds.has(i.id));
    const otherIssues = allIssues.filter((i) => !userIssueIds.has(i.id));
    return [...userIssues, ...otherIssues];
  }, [allIssues, userIssueIds]);

  const visibleIssues = useMemo(() => {
    if (showAllIssues || userIssueIds.size === 0) return sortedIssues;
    const userIssues = sortedIssues.filter((i) => userIssueIds.has(i.id));
    return userIssues.length > 0 ? userIssues : sortedIssues;
  }, [sortedIssues, userIssueIds, showAllIssues]);

  if (loading) {
    return (
      <Card className="p-8 rounded-2xl text-center">
        <p className="text-sm text-muted-foreground">Loading candidate comparisons…</p>
      </Card>
    );
  }

  if (candidates.length < 2) {
    return (
      <Card className="p-8 rounded-2xl text-center">
        <GitCompare className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm font-semibold text-foreground">Need at least 2 candidates to compare</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Once more candidates join this race, you'll see a side-by-side comparison here.
        </p>
      </Card>
    );
  }

  const hasPositions = Object.values(positions).some((arr) => arr.length > 0);

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="rounded-2xl bg-primary/5 border border-primary/15 p-4">
        <div className="flex items-start gap-3">
          <GitCompare className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-sm text-foreground">
              Side-by-side comparison on the issues
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {userIssueIds.size > 0
                ? "Sorted by the issues you care about most. Each cell shows the candidate's verified position and evidence count."
                : "Select your issues on the Issues page to prioritize what matters most to you here."}
            </p>
          </div>
        </div>
      </div>

      {/* Your issues summary */}
      {userIssueIds.size > 0 && (
        <Card className="p-4 rounded-2xl border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <Star className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-sm text-foreground">
                {userIssueIds.size} issue{userIssueIds.size === 1 ? '' : 's'} you care about are highlighted below
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allIssues.filter((i) => userIssueIds.has(i.id)).map((i) => (
                  <span key={i.id} className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary">
                    {i.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {!hasPositions && (
        <Card className="p-6 rounded-2xl text-center">
          <Info className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-semibold text-foreground">No verified positions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            BallotLens hasn't verified any issue positions for these candidates yet. Check back as we add more data,
            or visit each candidate's profile for statements and voting records.
          </p>
        </Card>
      )}

      {hasPositions && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="sticky left-0 z-10 bg-secondary/30 p-4 text-left text-sm font-semibold text-foreground min-w-[160px]">Issue</th>
                  {candidates.map((c) => (
                    <th key={c.id} className="p-4 text-left min-w-[220px] align-top">
                      <Link to={`/candidates/${c.id}`} className="block hover:text-primary transition-colors">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-border">
                            {c.photo_url ? (
                              <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                            ) : (
                              <AvatarFallback className="text-sm font-semibold">{c.first_name[0]}{c.last_name[0]}</AvatarFallback>
                            )}
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">{c.first_name} {c.last_name}</p>
                            <p className="text-xs text-muted-foreground">{c.party}</p>
                          </div>
                        </div>
                      </Link>
                      {(tagsByCandidate[c.id] ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[...new Set((tagsByCandidate[c.id] ?? []).map((t) => t.tag))].slice(0, 4).map((tv) => (
                            <span key={tv} className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', tagColor(tv))}>
                              {tagLabel(tv)}
                            </span>
                          ))}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleIssues.map((issue) => {
                  const isUserIssue = userIssueIds.has(issue.id);
                  return (
                    <tr key={issue.id} className={cn('border-b border-border last:border-0 transition-colors', isUserIssue && 'bg-primary/5')}>
                      <td className={cn('sticky left-0 z-10 p-4 text-sm font-medium align-top', isUserIssue ? 'bg-primary/5' : 'bg-background')}>
                        <div className="flex items-center gap-1.5">
                          {isUserIssue && <Star className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />}
                          <span className={cn(isUserIssue && 'text-primary font-bold')}>{issue.name}</span>
                        </div>
                      </td>
                      {candidates.map((c) => {
                        const pos = (positions[c.id] ?? []).find((p) => p.issue_id === issue.id);
                        return (
                          <td key={c.id} className="p-4 align-top">
                            <ComparisonCell position={pos} candidateId={c.id} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: grouped by issue */}
          <div className="md:hidden space-y-4">
            {visibleIssues.map((issue) => {
              const isUserIssue = userIssueIds.has(issue.id);
              return (
                <Card key={issue.id} className={cn('p-4 rounded-2xl', isUserIssue && 'border-primary/30 ring-1 ring-primary/10')}>
                  <div className="flex items-center gap-1.5 mb-3">
                    {isUserIssue && <Star className="h-4 w-4 text-primary fill-primary shrink-0" />}
                    <h3 className={cn('font-semibold', isUserIssue ? 'text-primary' : 'text-foreground')}>{issue.name}</h3>
                    {isUserIssue && (
                      <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Your Issue</span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {candidates.map((c) => {
                      const pos = (positions[c.id] ?? []).find((p) => p.issue_id === issue.id);
                      return (
                        <div key={c.id} className="rounded-lg border border-border p-3">
                          <Link to={`/candidates/${c.id}`} className="flex items-center gap-2 mb-2 hover:text-primary transition-colors">
                            <Avatar className="h-7 w-7">
                              {c.photo_url ? (
                                <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                              ) : (
                                <AvatarFallback className="text-xs">{c.first_name[0]}{c.last_name[0]}</AvatarFallback>
                              )}
                            </Avatar>
                            <span className="text-sm font-medium">{c.first_name} {c.last_name}</span>
                            <span className="text-xs text-muted-foreground">{c.party}</span>
                          </Link>
                          {(tagsByCandidate[c.id] ?? []).length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1">
                              {[...new Set((tagsByCandidate[c.id] ?? []).map((t) => t.tag))].slice(0, 4).map((tv) => (
                                <span key={tv} className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', tagColor(tv))}>
                                  {tagLabel(tv)}
                                </span>
                              ))}
                            </div>
                          )}
                          <ComparisonCell position={pos} candidateId={c.id} />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Toggle: show all issues vs just your issues */}
          {userIssueIds.size > 0 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-2 touch-target"
                onClick={() => setShowAllIssues(!showAllIssues)}
              >
                {showAllIssues ? 'Show only my issues' : 'Show all issues'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ComparisonCell({ position, candidateId }: { position?: CandidatePosition; candidateId: string }) {
  if (!position || position.verification_status === 'insufficient_information' || !position.summary) {
    return (
      <div>
        <p className="text-sm text-muted-foreground italic">No verified position on record.</p>
        <div className="mt-2">
          <VerificationBadge status="insufficient_information" />
        </div>
      </div>
    );
  }

  const sourceCount = (position as CandidatePosition & { source_count?: number }).source_count ?? 0;

  return (
    <div>
      <p className="text-sm text-foreground leading-relaxed">{position.summary}</p>
      <div className="mt-2 flex items-center gap-2">
        <VerificationBadge status={position.verification_status} />
        {sourceCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {sourceCount} Source{sourceCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <Link
        to={`/candidates/${candidateId}`}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        View evidence <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
