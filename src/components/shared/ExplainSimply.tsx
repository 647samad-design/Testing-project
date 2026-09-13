import { useState } from 'react';
import { BookOpen, ChevronDown, GraduationCap, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExplainSimplyProps {
  plainEnglish?: string | null;
  eli5?: string | null;
  className?: string;
}

export function ExplainSimply({ plainEnglish, eli5, className }: ExplainSimplyProps) {
  const [open, setOpen] = useState(false);

  if (!plainEnglish && !eli5) return null;

  return (
    <div className={cn('rounded-xl border border-primary/20 bg-primary/5', className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left touch-target"
        aria-expanded={open}
      >
        <GraduationCap className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-bold text-primary">Explain This Like I'm 5</span>
        <ChevronDown className={cn(
          'ml-auto h-4 w-4 text-primary transition-transform',
          open && 'rotate-180'
        )} />
      </button>

      {open && (
        <div className="space-y-4 px-4 pb-4 animate-slide-up">
          {eli5 && (
            <div className="rounded-lg bg-card p-3.5 border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Info className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider text-accent">In Simple Terms</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{eli5}</p>
            </div>
          )}

          {plainEnglish && (
            <div className="rounded-lg bg-card p-3.5 border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Plain English Summary</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{plainEnglish}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
