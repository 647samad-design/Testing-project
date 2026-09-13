import { useEffect, useState } from 'react';
import { Scale, Plus, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { getIssues, getUserIssues, selectIssue, deselectIssue, createCustomIssue } from '@/services/districts';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { IssueFollowButton } from '@/components/shared/FollowButton';
import { AdSlot } from '@/components/shared/AdSlot';
import { LoadingState, ErrorState } from '@/components/shared/StateComponents';
import { Link } from 'react-router-dom';
import type { Issue } from '@/types';
import { cn } from '@/lib/utils';

export function IssuesPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customIssueName, setCustomIssueName] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const allIssues = await getIssues();
        setIssues(allIssues);

        if (user) {
          const userIssues = await getUserIssues();
          setSelectedIds(new Set(userIssues.map((i) => i.id)));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load issues.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  async function toggleIssue(issue: Issue) {
    if (!user) {
      // Allow selection in local state even without auth, but don't persist
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(issue.id)) next.delete(issue.id);
        else next.add(issue.id);
        return next;
      });
      return;
    }

    try {
      if (selectedIds.has(issue.id)) {
        await deselectIssue(issue.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
      } else {
        await selectIssue(issue.id);
        setSelectedIds((prev) => new Set(prev).add(issue.id));
      }
    } catch {
      // Silently fail — UI already reflects state
    }
  }

  async function handleCreateCustom() {
    if (!customIssueName.trim() || !user) return;
    try {
      const newIssue = await createCustomIssue(customIssueName.trim());
      if (newIssue) {
        setIssues((prev) => [...prev, newIssue]);
        await selectIssue(newIssue.id);
        setSelectedIds((prev) => new Set(prev).add(newIssue.id));
      }
    } catch {
      // Ignore — user will see issue didn't appear
    }
    setCustomIssueName('');
    setCustomDialogOpen(false);
  }

  if (loading) return <LoadingState message="Loading issues…" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  // Group by category
  const categories = [...new Set(issues.filter((i) => !i.is_custom).map((i) => i.category ?? 'Other'))].sort();
  const customIssues = issues.filter((i) => i.is_custom);

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">What matters to you?</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Select the issues you care about. BallotLens will never infer your political ideology from your selections.
        </p>
        {!user && (
          <div className="mt-3 rounded-lg border border-border bg-secondary/50 p-3">
            <p className="text-sm text-muted-foreground">
              <Link to="/signin" className="font-medium text-primary hover:underline">Sign in</Link> to save your issue selections to your profile. Your selections are always private.
            </p>
          </div>
        )}
        <div className="mt-4">
          <DemoBanner compact />
        </div>
      </div>

      {/* Custom issues */}
      {customIssues.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your Custom Issues
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customIssues.map((issue) => (
              <IssueToggle
                key={issue.id}
                issue={issue}
                selected={selectedIds.has(issue.id)}
                onToggle={() => toggleIssue(issue)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Categories */}
      {categories.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {cat}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {issues
              .filter((i) => !i.is_custom && (i.category ?? 'Other') === cat)
              .map((issue) => (
                <IssueToggle
                  key={issue.id}
                  issue={issue}
                  selected={selectedIds.has(issue.id)}
                  onToggle={() => toggleIssue(issue)}
                />
              ))}
          </div>
        </section>
      ))}

      {/* Create custom issue */}
      <div className="mt-8">
        <Button variant="outline" onClick={() => setCustomDialogOpen(true)} className="gap-2 rounded-xl touch-target">
          <Plus className="h-4 w-4" />
          Create Your Own Issue
        </Button>
      </div>

      {/* Custom issue dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a custom issue</DialogTitle>
            <DialogDescription>
              Add an issue you care about that isn't in our list. Example: "I care about police body cameras."
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Enter your custom issue…"
            value={customIssueName}
            onChange={(e) => setCustomIssueName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateCustom()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCustom} disabled={!customIssueName.trim() || !user}>
              Add Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mt-8">
        <AdSlot placement="issues_page" />
      </div>
    </div>
  );
}

function IssueToggle({ issue, selected, onToggle }: { issue: Issue; selected: boolean; onToggle: () => void }) {
  return (
    <Card
      className={cn(
        'cursor-pointer p-5 rounded-2xl transition-all hover:shadow-md touch-target',
        selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:border-primary/30'
      )}
      onClick={onToggle}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Scale className={cn('mt-0.5 h-5 w-5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
          <div className="flex-1">
            <p className={cn('font-medium text-sm', selected ? 'text-foreground' : 'text-foreground')}>
              {issue.name}
            </p>
            {issue.is_custom && (
              <p className="text-xs text-muted-foreground">Custom issue</p>
            )}
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <IssueFollowButton issueId={issue.id} issueName={issue.name} />
            </div>
          </div>
        </div>
        <div className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
        )}>
          {selected ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-0" />}
        </div>
      </div>
    </Card>
  );
}
