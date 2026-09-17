import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getSources } from '@/services/sources';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import type { Source } from '@/types';

export function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSources().then((data) => {
      setSources(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-3 text-muted-foreground">
          Every claim on BallotLens is tied to a source. Here's a sample of what we cite — see our{' '}
          <a href="/methodology" className="text-primary hover:underline">Methodology</a> page for how we choose and verify them.
        </p>
      </header>

      {loading ? (
        <LoadingState message="Loading sources…" />
      ) : sources.length === 0 ? (
        <EmptyState title="No sources listed yet" description="Sources will appear here as candidate and election content is published." />
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <a
              key={s.id}
              href={s.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start justify-between gap-3 rounded-xl border border-border p-4 hover:bg-secondary/40 transition-colors"
            >
              <div>
                <p className="font-medium text-sm">{s.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.publisher && `${s.publisher} · `}{s.source_type}
                  {s.credibility_level && ` · ${s.credibility_level}`}
                </p>
              </div>
              {s.url && <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
