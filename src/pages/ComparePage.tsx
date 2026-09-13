import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { GitCompare, X, ArrowRight, Scale, Star, Search, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { getCandidates, compareCandidates } from '@/services/candidates';
import { getUserIssues, getIssues } from '@/services/districts';
import { demoIssues } from '@/services/demo-data';
import { getTagsForCandidates, tagLabel, tagColor } from '@/services/tags';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { Candidate, CandidatePosition, Issue, CandidateTag } from '@/types';
import { Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ComparePage() {
  const [searchParams] = useSearchParams();
  const initialCandidate = searchParams.get('c');
  const { user } = useAuth();
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [positions, setPositions] = useState<Record<string, CandidatePosition[]>>({});
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [userIssueIds, setUserIssueIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [tagsByCandidate, setTagsByCandidate] = useState<Record<string, CandidateTag[]>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
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

      const cands = await getCandidates();
      setAllCandidates(cands);
      if (initialCandidate) setSelectedIds([initialCandidate]);
      setLoading(false);
    }
    load();
  }, [initialCandidate, user]);

  useEffect(() => {
    if (selectedIds.length === 0) { setPositions({}); setTagsByCandidate({}); return; }
    compareCandidates(selectedIds).then(setPositions);
    getTagsForCandidates(selectedIds).then(setTagsByCandidate);
  }, [selectedIds]);

  const selectedCandidates = allCandidates.filter((c) => selectedIds.includes(c.id));

  // Build full issue list: ALL issues, not just overlapping ones
  // Sort: user-selected issues first, then the rest alphabetically
  const sortedIssues = useMemo(() => {
    const userIssues = allIssues.filter((i) => userIssueIds.has(i.id));
    const otherIssues = allIssues.filter((i) => !userIssueIds.has(i.id));
    return [...userIssues, ...otherIssues];
  }, [allIssues, userIssueIds]);

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  const filteredPickerCandidates = allCandidates
    .filter((c) => !selectedIds.includes(c.id))
    .filter((c) => {
      if (!pickerSearch.trim()) return true;
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      return name.includes(pickerSearch.toLowerCase());
    });

  if (loading) return <LoadingState message="Loading comparison tool…" />;

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Compare Candidates</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Select 2 or more candidates and compare their positions side by side.
          Issues you care about are highlighted.
        </p>
        <div className="mt-4">
          <DemoBanner compact />
        </div>
      </div>

      {/* Candidate selector */}
      <Card className="mb-6 p-5 rounded-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Selected ({selectedIds.length}):
          </span>
          {selectedCandidates.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5">
              <Avatar className="h-7 w-7">
                {c.photo_url ? (
                  <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-xs">{c.first_name[0]}{c.last_name[0]}</AvatarFallback>
                )}
              </Avatar>
              <span className="text-sm font-medium">{c.first_name} {c.last_name}</span>
              <button onClick={() => toggleCandidate(c.id)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {selectedIds.length < 2 && (
            <span className="text-xs text-muted-foreground italic">Add at least 2 to compare</span>
          )}
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(!pickerOpen)} className="gap-2 rounded-xl touch-target ml-auto">
            <Users className="h-4 w-4" />
            Add Candidate
          </Button>
        </div>

        {pickerOpen && (
          <div className="mt-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search candidates by name…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="pl-10 h-11 rounded-xl"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-y-auto">
              {filteredPickerCandidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { toggleCandidate(c.id); setPickerSearch(''); }}
                  className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-secondary/50 touch-target"
                >
                  <Avatar className="h-8 w-8">
                    {c.photo_url ? (
                      <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />
                    ) : (
                      <AvatarFallback className="text-xs">{c.first_name[0]}{c.last_name[0]}</AvatarFallback>
                    )}
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.first_name} {c.last_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.party}</p>
                  </div>
                </button>
              ))}
              {filteredPickerCandidates.length === 0 && (
                <p className="col-span-full text-center text-sm text-muted-foreground py-4">No candidates found.</p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Your issues summary */}
      {userIssueIds.size > 0 && selectedIds.length >= 2 && (
        <Card className="mb-6 p-4 rounded-2xl border-primary/20 bg-primary/5">
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

      {/* Comparison table */}
      {selectedIds.length < 2 ? (
        <EmptyState
          title="Select at least 2 candidates"
          description="Choose candidates from the selector above to start comparing their positions on key issues."
          icon={<GitCompare className="h-10 w-10" />}
        />
      ) : (
        <ComparisonTable
          candidates={selectedCandidates}
          issues={sortedIssues}
          positions={positions}
          userIssueIds={userIssueIds}
          tagsByCandidate={tagsByCandidate}
        />
      )}

      <div className="mt-8 rounded-lg border border-border bg-secondary/30 p-4 text-center">
        <p className="text-sm font-medium text-foreground">
          Review the evidence and decide for yourself.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          BallotLens does not score candidates or declare a "winner." Compare the evidence and make your own decision.
        </p>
      </div>
    </div>
  );
}

function ComparisonTable({
  candidates,
  issues,
  positions,
  userIssueIds,
  tagsByCandidate,
}: {
  candidates: Candidate[];
  issues: Issue[];
  positions: Record<string, CandidatePosition[]>;
  userIssueIds: Set<string>;
  tagsByCandidate: Record<string, CandidateTag[]>;
}) {
  return (
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
            {issues.map((issue) => {
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
        {issues.map((issue) => {
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
    </>
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
