import { useEffect, useState } from 'react';
import { Tag, Plus, X, Info, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'react-router-dom';
import { CANDIDATE_TAG_OPTIONS } from '@/types';
import { getTagsForCandidate, addTag, removeTag, tagLabel, tagColor } from '@/services/tags';
import type { CandidateTag } from '@/types';
import { cn } from '@/lib/utils';

interface CandidateTagsProps {
  candidateId: string;
}

export function CandidateTags({ candidateId }: CandidateTagsProps) {
  const { user } = useAuth();
  const [allTags, setAllTags] = useState<CandidateTag[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await getTagsForCandidate(candidateId);
      if (!cancelled) { setAllTags(data); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [candidateId]);

  async function handleAddTag(tag: string) {
    setSubmitting(tag);
    const r = await addTag(candidateId, tag);
    if (r.success) {
      const updated = await getTagsForCandidate(candidateId);
      setAllTags(updated);
    }
    setSubmitting(null);
  }

  async function handleRemoveTag(tag: string) {
    const r = await removeTag(candidateId, tag);
    if (r.success) {
      setAllTags((prev) => prev.filter((t) => t.tag !== tag));
    }
  }

  const myTagValues = user ? allTags.filter((t) => t.user_id === user.id).map((t) => t.tag) : [];
  const availableTags = CANDIDATE_TAG_OPTIONS.filter((o) => !myTagValues.includes(o.value));

  // Count how many users applied each tag
  const tagCounts: Record<string, number> = {};
  allTags.forEach((t) => { tagCounts[t.tag] = (tagCounts[t.tag] ?? 0) + 1; });
  const uniqueTagValues = [...new Set(allTags.map((t) => t.tag))];

  if (loading) return null;

  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Community Tags</h3>
        </div>
        {user && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-xl touch-target">
                <Plus className="h-4 w-4" />
                Add Tag
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add a tag to this candidate</DialogTitle>
                <DialogDescription>
                  Tags are informational labels to help voters understand a candidate's positions.
                  They are not endorsements. Choose from the list below.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 space-y-2">
                {availableTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    You've already added all available tags for this candidate.
                  </p>
                ) : (
                  availableTags.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleAddTag(opt.value)}
                      disabled={submitting === opt.value}
                      className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left transition-all hover:border-primary/30 hover:bg-secondary/50 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                      {submitting === opt.value ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="mt-4 rounded-lg bg-secondary/50 p-3">
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Tags are community-contributed and informational only. They do not represent
                  BallotLens's endorsement or editorial judgment.
                </p>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {uniqueTagValues.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            No tags yet.{' '}
            {user ? (
              'Click "Add Tag" to add an informational label.'
            ) : (
              <>
                <Link to="/signin" className="text-primary hover:underline font-medium">Sign in</Link> to add tags.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {uniqueTagValues.map((tagValue) => {
            const isMyTag = myTagValues.includes(tagValue);
            const count = tagCounts[tagValue] ?? 0;
            return (
              <span
                key={tagValue}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                  tagColor(tagValue)
                )}
              >
                {tagLabel(tagValue)}
                {count > 1 && (
                  <span className="opacity-60 font-normal">· {count}</span>
                )}
                {isMyTag && (
                  <button
                    onClick={() => handleRemoveTag(tagValue)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"
                    aria-label={`Remove ${tagLabel(tagValue)} tag`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {uniqueTagValues.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground/70">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          Community-contributed tags are informational only and do not represent BallotLens's endorsement.
        </p>
      )}
    </Card>
  );
}
