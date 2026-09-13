import { cn } from '@/lib/utils';
import type { VerificationStatus } from '@/types';

interface VerificationBadgeProps {
  status: VerificationStatus;
  className?: string;
}

const config: Record<VerificationStatus, { label: string; className: string }> = {
  verified: {
    label: 'Verified',
    className: 'bg-success/10 text-success border-success/25 font-semibold',
  },
  not_verified: {
    label: 'Not Verified',
    className: 'bg-warning/10 text-warning border-warning/25 font-semibold',
  },
  insufficient_information: {
    label: 'No Info',
    className: 'bg-muted text-muted-foreground border-border font-semibold',
  },
};

export function VerificationBadge({ status, className }: VerificationBadgeProps) {
  const c = config[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        c.className,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {c.label}
    </span>
  );
}
