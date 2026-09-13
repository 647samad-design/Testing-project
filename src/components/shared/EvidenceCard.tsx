import { Link } from 'react-router-dom';
import { ChevronRight, Vote, FileText, Gavel } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SourceBadge } from './SourceBadge';
import { ExplainSimply } from './ExplainSimply';
import type { CandidatePosition, VotingRecord, CandidateStatement } from '@/types';
import { cn } from '@/lib/utils';

type Evidence = CandidatePosition | VotingRecord | CandidateStatement;

interface EvidenceCardProps {
  type: 'position' | 'vote' | 'statement';
  data: Evidence;
  className?: string;
}

export function EvidenceCard({ type, data, className }: EvidenceCardProps) {
  const icon = type === 'vote' ? <Vote className="h-4 w-4" /> : type === 'statement' ? <FileText className="h-4 w-4" /> : <Gavel className="h-4 w-4" />;

  if (type === 'position') {
    const pos = data as CandidatePosition;
    return (
      <Card className={cn('p-4 rounded-2xl', className)}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Position on {pos.issue?.name ?? 'an issue'}
            </p>
            <p className="mt-1 text-sm text-foreground leading-relaxed">
              {pos.summary ?? 'Position not verified.'}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (type === 'vote') {
    const vr = data as VotingRecord;
    const voteColor = vr.vote === 'yes' ? 'text-success' : vr.vote === 'no' ? 'text-destructive' : 'text-muted-foreground';
    const voteBg = vr.vote === 'yes' ? 'bg-success/10' : vr.vote === 'no' ? 'bg-destructive/10' : 'bg-muted';
    return (
      <Card className={cn('p-4 rounded-2xl', className)}>
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', voteBg, voteColor)}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voting Record</p>
              {vr.vote && (
                <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold uppercase', voteBg, voteColor)}>
                  {vr.vote}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-bold text-foreground">{vr.bill_name}</p>
            {vr.bill_number && (
              <p className="text-xs text-muted-foreground font-medium">{vr.bill_number}</p>
            )}
            {vr.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{vr.description}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {vr.vote_date && (
                <span className="text-xs text-muted-foreground">{formatDate(vr.vote_date)}</span>
              )}
              {vr.source && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <Link
                    to="#"
                    onClick={(e) => { e.preventDefault(); window.open(vr.source?.url ?? '#', '_blank'); }}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    View Source <ChevronRight className="inline h-3 w-3" />
                  </Link>
                </>
              )}
            </div>

            {(vr.plain_english_summary || vr.eli5_explanation) && (
              <ExplainSimply
                plainEnglish={vr.plain_english_summary}
                eli5={vr.eli5_explanation}
                className="mt-3"
              />
            )}
          </div>
        </div>
      </Card>
    );
  }

  // statement
  const stmt = data as CandidateStatement;
  return (
    <Card className={cn('p-4 rounded-2xl', className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Statement{stmt.statement_date ? ` · ${formatDate(stmt.statement_date)}` : ''}
          </p>
          <blockquote className="mt-1 text-sm text-foreground leading-relaxed border-l-2 border-primary/30 pl-3 italic">
            {stmt.statement_text}
          </blockquote>
          {stmt.source && (
            <div className="mt-2">
              <SourceBadge type={stmt.source.source_type} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
