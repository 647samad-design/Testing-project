import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Candidate } from '@/types';
import { cn } from '@/lib/utils';

interface CandidateCardProps {
  candidate: Candidate;
  contestLabel?: string;
  className?: string;
  to?: string;
}

function getPartyClass(party: string | null): string {
  if (!party) return '';
  const p = party.toLowerCase();
  if (p.includes('democratic') || p.includes('democrat')) return 'party-dem';
  if (p.includes('republican') || p.includes('gop')) return 'party-rep';
  if (p.includes('independent') || p.includes('nonpartisan') || p.includes('libertarian') || p.includes('green')) return 'party-ind';
  return '';
}

export function CandidateCard({ candidate, contestLabel, className, to }: CandidateCardProps) {
  const linkTo = to ?? `/candidates/${candidate.id}`;
  const initials = `${candidate.first_name[0] ?? ''}${candidate.last_name[0] ?? ''}`;
  const partyClass = getPartyClass(candidate.party);

  return (
    <Link to={linkTo} className="block">
      <Card
        className={cn(
          'group flex items-center gap-3 p-4 rounded-2xl transition-all hover:border-primary/30 hover:shadow-md touch-target',
          className
        )}
      >
        <Avatar className="h-12 w-12 border border-border bg-secondary shrink-0">
          {candidate.photo_url ? (
            <img src={candidate.photo_url} alt={`${candidate.first_name} ${candidate.last_name}`} className="h-full w-full object-cover" />
          ) : (
            <AvatarFallback className="bg-secondary text-sm font-semibold text-secondary-foreground">
              {initials}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-foreground">
            {candidate.first_name} {candidate.last_name}
          </p>
          {candidate.party && (
            partyClass ? (
              <span className={cn('mt-0.5 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', partyClass)}>
                {candidate.party}
              </span>
            ) : (
              <p className="truncate text-sm text-muted-foreground">{candidate.party}</p>
            )
          )}
          {contestLabel && (
            <p className="truncate text-xs text-muted-foreground mt-0.5">{contestLabel}</p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 shrink-0" />
      </Card>
    </Link>
  );
}
