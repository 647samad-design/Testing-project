import { ExternalLink, Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SourceBadge } from './SourceBadge';
import type { NewsArticle } from '@/types';
import { cn } from '@/lib/utils';

interface NewsCardProps {
  article: NewsArticle;
  className?: string;
}

export function NewsCard({ article, className }: NewsCardProps) {
  const isOpinion = article.article_type === 'opinion';
  const isCampaign = article.article_type === 'campaign_material';

  return (
    <a href={article.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
      <Card className={cn('group p-4 transition-all hover:border-primary/30 hover:shadow-sm', className)}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Newspaper className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge type={article.article_type} />
              {isOpinion && (
                <span className="text-xs text-muted-foreground italic">
                  This is opinion, not factual reporting.
                </span>
              )}
              {isCampaign && (
                <span className="text-xs text-muted-foreground italic">
                  This is campaign material, not independent reporting.
                </span>
              )}
            </div>
            <h3 className="mt-2 font-medium text-foreground leading-snug group-hover:text-primary transition-colors">
              {article.title}
            </h3>
            {article.summary && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{article.summary}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {article.publisher && (
                <span className="text-xs text-muted-foreground">{article.publisher}</span>
              )}
              {article.published_date && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(article.published_date)}
                  </span>
                </>
              )}
              <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
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
