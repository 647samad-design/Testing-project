import { ShieldCheck, FileText, Link2, PenLine } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type VerificationLevel = 'official' | 'candidate_managed' | 'ballotlens_researched' | 'source_verified';

interface VerificationBadgeDef {
  level: VerificationLevel;
  label: string;
  icon: typeof ShieldCheck;
  description: string;
  color: string;
}

const VERIFICATION_LEVELS: VerificationBadgeDef[] = [
  {
    level: 'official',
    label: 'Official',
    icon: ShieldCheck,
    description: 'Candidate identity verified, campaign verified, official campaign contact verified',
    color: 'text-success',
  },
  {
    level: 'candidate_managed',
    label: 'Candidate-Managed',
    icon: PenLine,
    description: 'Candidate or campaign team can edit this profile',
    color: 'text-primary',
  },
  {
    level: 'ballotlens_researched',
    label: 'BallotLens Researched',
    icon: FileText,
    description: 'Information independently compiled by BallotLens',
    color: 'text-accent',
  },
  {
    level: 'source_verified',
    label: 'Source Verified',
    icon: Link2,
    description: 'Information linked to a primary or public source',
    color: 'text-muted-foreground',
  },
];

export function VerificationBadges({
  levels,
  size = 'sm',
}: {
  levels: VerificationLevel[];
  size?: 'sm' | 'xs';
}) {
  if (levels.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-1.5">
        {levels.map((level) => {
          const def = VERIFICATION_LEVELS.find((v) => v.level === level);
          if (!def) return null;
          const Icon = def.icon;
          return (
            <Tooltip key={level}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 font-semibold cursor-help',
                    size === 'xs' ? 'text-[10px]' : 'text-xs',
                    def.color
                  )}
                >
                  <Icon className={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                  {def.label}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">{def.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function getVerificationLevels(hasClaim: boolean, hasSources: boolean, hasBallotLensData: boolean): VerificationLevel[] {
  const levels: VerificationLevel[] = [];
  if (hasClaim) {
    levels.push('official');
    levels.push('candidate_managed');
  }
  if (hasBallotLensData) {
    levels.push('ballotlens_researched');
  }
  if (hasSources) {
    levels.push('source_verified');
  }
  return levels;
}
