import { ChevronRight, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SourceBadge } from './SourceBadge';
import { cn } from '@/lib/utils';
import type { Source } from '@/types';

interface SourceCardProps {
  source: Source;
  showBadge?: boolean;
  className?: string;
}

export function SourceCard({ source, showBadge = true, className }: SourceCardProps) {
  return (
    <a
      href={source.url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <Card className={cn('group p-4 transition-all hover:border-primary/30 hover:shadow-sm', className)}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground leading-snug group-hover:text-primary transition-colors">
              {source.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {source.publisher && (
                <span className="text-xs text-muted-foreground">{source.publisher}</span>
              )}
              {source.publication_date && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(source.publication_date)}
                  </span>
                </>
              )}
            </div>
            {showBadge && (
              <div className="mt-2">
                <SourceBadge type={source.source_type} />
              </div>
            )}
            {source.description && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{source.description}</p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </a>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
