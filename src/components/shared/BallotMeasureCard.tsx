import { Link } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DistrictBadge } from './DistrictBadge';
import { ExplainSimply } from './ExplainSimply';
import type { BallotMeasure } from '@/types';
import { cn } from '@/lib/utils';

interface BallotMeasureCardProps {
  measure: BallotMeasure;
  className?: string;
}

const typeLabel: Record<string, string> = {
  amendment: 'Amendment',
  referendum: 'Referendum',
  local: 'Local Measure',
};

export function BallotMeasureCard({ measure, className }: BallotMeasureCardProps) {
  return (
    <Card className={cn('p-5 rounded-2xl transition-shadow hover:shadow-md', className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <DistrictBadge text={typeLabel[measure.measure_type] ?? 'Measure'} />
          </div>
          <h3 className="mt-2 font-bold text-foreground">{measure.title}</h3>
          {measure.summary && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{measure.summary}</p>
          )}

          {(measure.plain_english_summary || measure.eli5_explanation) && (
            <ExplainSimply
              plainEnglish={measure.plain_english_summary}
              eli5={measure.eli5_explanation}
              className="mt-3"
            />
          )}
        </div>
      </div>
      <Link
        to={`/ballot/measure/${measure.id}`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80 touch-target"
      >
        Understand this measure
        <ChevronRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}
