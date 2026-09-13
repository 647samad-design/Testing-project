import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Circle, XCircle, HelpCircle, Target, ExternalLink, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCandidatePromises, addCandidatePromise, updatePromiseStatus } from '@/services/civic';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { CandidatePromise, PromiseStatus } from '@/types';

const STATUS_STYLES: Record<PromiseStatus, { label: string; icon: typeof CheckCircle2; color: string; bg: string; dot: string }> = {
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/8', dot: 'bg-success' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'text-warning', bg: 'bg-warning/8', dot: 'bg-warning' },
  not_started: { label: 'Not Started', icon: Circle, color: 'text-muted-foreground', bg: 'bg-secondary', dot: 'bg-muted-foreground' },
  contradicted: { label: 'Contradicted', icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/8', dot: 'bg-destructive' },
  unverified: { label: 'Unable to Verify', icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-secondary', dot: 'bg-muted-foreground/50' },
};

export function PromisesTracker({ candidateId, canEdit }: { candidateId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const [promises, setPromises] = useState<CandidatePromise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPromise, setNewPromise] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newSource, setNewSource] = useState('');

  useEffect(() => {
    load();
  }, [candidateId]);

  async function load() {
    const data = await getCandidatePromises(candidateId);
    setPromises(data);
    setLoading(false);
  }

  async function handleAdd() {
    if (!newPromise.trim()) return;
    try {
      await addCandidatePromise(candidateId, newPromise.trim(), newDate || undefined, newSource || undefined);
      setNewPromise('');
      setNewDate('');
      setNewSource('');
      setShowAdd(false);
      await load();
    } catch {
      // ignore
    }
  }

  async function handleStatusUpdate(promiseId: string, status: PromiseStatus) {
    try {
      await updatePromiseStatus(promiseId, status);
      await load();
    } catch {
      // ignore
    }
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading promises...</div>;

  const counts: Record<PromiseStatus, number> = {
    completed: 0, in_progress: 0, not_started: 0, contradicted: 0, unverified: 0,
  };
  promises.forEach((p) => { counts[p.status]++; });

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {promises.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {Object.entries(STATUS_STYLES).map(([key, style]) => {
            const count = counts[key as PromiseStatus];
            if (count === 0) return null;
            const Icon = style.icon;
            return (
              <div key={key} className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5', style.bg)}>
                <Icon className={cn('h-3.5 w-3.5', style.color)} />
                <span className={cn('text-xs font-bold', style.color)}>{style.label}</span>
                <span className="text-xs font-bold text-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add promise button */}
      {canEdit && user && (
        <>
          {!showAdd ? (
            <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add Promise
            </Button>
          ) : (
            <Card className="p-4 rounded-2xl space-y-3">
              <input
                type="text"
                value={newPromise}
                onChange={(e) => setNewPromise(e.target.value)}
                placeholder="What was promised?"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="url"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="Source URL"
                  className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl" onClick={handleAdd} disabled={!newPromise.trim()}>
                  Save
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Promises list */}
      {promises.length === 0 ? (
        <div className="text-center py-10">
          <Target className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No promises tracked yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {promises.map((promise) => {
            const style = STATUS_STYLES[promise.status];
            const Icon = style.icon;
            return (
              <Card key={promise.id} className={cn('p-4 rounded-2xl border', style.bg)}>
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', style.bg, style.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">{promise.promise_text}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className={cn('rounded-lg text-[10px] font-bold', style.color, style.bg)}>
                        {style.label}
                      </Badge>
                      {promise.date_made && (
                        <span className="text-xs text-muted-foreground">
                          Promised {new Date(promise.date_made).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {promise.issue && (
                        <Badge variant="secondary" className="rounded-lg text-[10px]">{promise.issue.name}</Badge>
                      )}
                      {promise.source_url && (
                        <a href={promise.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" />
                          Source
                        </a>
                      )}
                    </div>
                    {promise.status_evidence && (
                      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{promise.status_evidence}</p>
                    )}

                    {/* Status selector for editors */}
                    {canEdit && user && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(STATUS_STYLES).map(([key, s]) => (
                          <button
                            key={key}
                            onClick={() => handleStatusUpdate(promise.id, key as PromiseStatus)}
                            className={cn(
                              'rounded-lg px-2 py-0.5 text-[10px] font-bold transition-all',
                              promise.status === key
                                ? cn(s.bg, s.color, 'ring-1 ring-current')
                                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
