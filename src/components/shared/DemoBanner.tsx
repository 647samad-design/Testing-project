import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DemoBannerProps {
  className?: string;
  compact?: boolean;
}

export function DemoBanner({ className, compact }: DemoBannerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5',
        className
      )}
      role="note"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <p className={cn('text-xs font-semibold text-warning', compact ? '' : 'font-medium')}>
        DEMO DATA — Not real election information. All candidates, sources and positions are fictional.
      </p>
    </div>
  );
}
