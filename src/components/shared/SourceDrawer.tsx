import { ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { SourceCard } from './SourceCard';
import { VerificationBadge } from './VerificationBadge';
import type { CandidatePosition } from '@/types';

interface SourceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: CandidatePosition | null;
}

export function SourceDrawer({ open, onOpenChange, position }: SourceDrawerProps) {
  if (!position) return null;

  const sources = position.sources ?? [];
  const issueName = position.issue?.name ?? 'this issue';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">Evidence: {issueName}</SheetTitle>
          <SheetDescription className="sr-only">
            Source evidence for this candidate position
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* CLAIM */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Claim
            </h4>
            <p className="mt-2 text-sm text-foreground leading-relaxed">
              {position.summary ?? 'Position not verified.'}
            </p>
            <div className="mt-2">
              <VerificationBadge status={position.verification_status} />
            </div>
          </section>

          {/* SOURCES */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sources ({sources.length})
            </h4>
            <div className="mt-3 space-y-3">
              {sources.length > 0 ? (
                sources.map((src) => <SourceCard key={src.id} source={src} />)
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No sources are linked to this position. Insufficient reliable information available.
                </p>
              )}
            </div>
          </section>

          {/* DISCLAIMER */}
          <div className="rounded-lg bg-secondary p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              BallotLens presents evidence from available sources. Always verify important
              information using original sources and your official election authority.
              {' '}
              <a
                href="#"
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                onClick={(e) => e.preventDefault()}
              >
                Learn about our methodology <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
