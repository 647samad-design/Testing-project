import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isDemoMode } from '@/lib/demo-mode';
import { t } from '@/i18n';

interface DemoBannerProps {
  className?: string;
  compact?: boolean;
  /** Pass true when the data on this page is demo data. */
  show?: boolean;
}

/** Shown only when demo data is actually on screen: the page says so via
 * `show`, or the visitor is in demo mode. It used to render unconditionally on
 * 10 pages, telling voters that real candidates were "fictional". */
export function DemoBanner({ className, compact, show = false }: DemoBannerProps) {
  if (!show && !isDemoMode()) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5',
        className
      )}
      role="note"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <p className={cn('text-xs font-semibold text-warning', compact ? '' : 'font-medium')}>{t("DEMO DATA — Not real election information. All candidates, sources and positions are fictional.")}</p>
    </div>
  );
}
