import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { VerificationBadge } from './VerificationBadge';
import { Button } from '@/components/ui/button';
import type { CandidatePosition } from '@/types';
import { cn } from '@/lib/utils';

interface IssueCardProps {
  position: CandidatePosition;
  candidateId?: string;
  onShowEvidence?: (position: CandidatePosition) => void;
  className?: string;
}

export function IssueCard({ position, candidateId, onShowEvidence, className }: IssueCardProps) {
  const issueName = position.issue?.name ?? 'Unknown Issue';
  const sourceCount = position.sources?.length ?? 0;

  return (
    <Card className={cn('p-5 rounded-2xl', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/issues`}
            className="font-semibold text-foreground hover:text-primary transition-colors"
          >
            {issueName}
          </Link>
          {position.issue?.category && (
            <p className="text-xs text-muted-foreground mt-0.5">{position.issue.category}</p>
          )}
        </div>
        <VerificationBadge status={position.verification_status} />
      </div>

      <div className="mt-3">
        {position.summary ? (
          <p className="text-sm text-foreground leading-relaxed">{position.summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Position not verified. Insufficient reliable information available.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {sourceCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {sourceCount} Source{sourceCount === 1 ? '' : 's'}
          </span>
        )}
        {onShowEvidence && sourceCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShowEvidence(position)}
            className="text-primary hover:text-primary/80 -ml-2 rounded-xl touch-target font-semibold"
          >
            <MessageSquare className="h-4 w-4" />
            Show Me the Evidence
          </Button>
        )}
      </div>
    </Card>
  );
}
