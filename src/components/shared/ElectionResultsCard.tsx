import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Vote as VoteIcon, TrendingUp, ChevronDown, ChevronUp, ShieldCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCalledRaces, getCertifiedResults, type ElectionRace } from '@/services/election-results';

export function ElectionResultsCard({ state, title = 'Election Results', compact = false }: { state?: string; title?: string; compact?: boolean }) {
  const [calledRaces, setCalledRaces] = useState<ElectionRace[]>([]);
  const [certifiedRaces, setCertifiedRaces] = useState<ElectionRace[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [called, certified] = await Promise.all([
        getCalledRaces(state),
        getCertifiedResults(state),
      ]);
      setCalledRaces(called);
      setCertifiedRaces(certified);
      setLoading(false);
    }
    load();
  }, [state]);

  if (loading) {
    return (
      <Card className="p-5 rounded-2xl animate-pulse">
        <div className="h-5 w-40 bg-secondary rounded mb-3" />
        <div className="h-12 bg-secondary rounded" />
      </Card>
    );
  }

  const allRaces = [...calledRaces, ...certifiedRaces.filter(cr => !calledRaces.some(r => r.id === cr.id))];
  if (allRaces.length === 0) return null;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
          <VoteIcon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-bold text-sm">{title}</h3>
        <Badge variant="secondary" className="ml-auto text-[10px] font-bold">
          {allRaces.length} {allRaces.length === 1 ? 'race' : 'races'}
        </Badge>
      </div>

      <div className="divide-y divide-border/30">
        {allRaces.slice(0, compact ? 4 : 10).map((race) => {
          const isExpanded = expanded.has(race.id);
          const candidates = race.election_candidate_results ?? [];
          const sortedCandidates = [...candidates].sort((a, b) => b.vote_count - a.vote_count);
          const totalVotes = candidates.reduce((sum, c) => sum + c.vote_count, 0);

          return (
            <div key={race.id} className="px-5 py-3">
              <button
                onClick={() => toggle(race.id)}
                className="flex w-full items-center gap-2 text-left touch-target"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-foreground truncate">{race.office_name}</p>
                    {race.is_certified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                        <ShieldCheck className="h-3 w-3" />
                        Certified
                      </span>
                    ) : race.winner_name ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <CheckCircle2 className="h-3 w-3" />
                        Called
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </div>
                  {race.winner_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Winner: <span className="font-bold text-foreground">{race.winner_name}</span>
                      {race.winner_party && ` (${race.winner_party})`}
                    </p>
                  )}
                </div>
                {candidates.length > 0 && (
                  isExpanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {isExpanded && sortedCandidates.length > 0 && (
                <div className="mt-3 space-y-2 animate-slide-up">
                  {sortedCandidates.map((cand) => {
                    const pct = cand.vote_percent ?? (totalVotes > 0 ? (cand.vote_count / totalVotes) * 100 : 0);
                    return (
                      <div key={cand.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className={cn('text-xs font-semibold truncate', cand.is_winner ? 'text-foreground' : 'text-muted-foreground')}>
                              {cand.candidate_name}
                              {cand.incumbent && <span className="ml-1 text-[9px] font-bold text-primary">(Inc.)</span>}
                              {cand.party && <span className="ml-1 text-muted-foreground">({cand.party})</span>}
                            </span>
                            <span className="text-xs font-bold text-muted-foreground shrink-0">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                cand.is_winner
                                  ? 'bg-gradient-to-r from-primary to-accent'
                                  : 'bg-muted-foreground/40'
                              )}
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                        {cand.is_winner && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </div>
                    );
                  })}
                  {race.last_updated && (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      <TrendingUp className="h-3 w-3 inline mr-1" />
                      Last updated: {new Date(race.last_updated).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
