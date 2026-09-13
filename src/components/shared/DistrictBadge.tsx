import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'federal' | 'state' | 'local' | 'judicial';

interface DistrictBadgeProps {
  text: string;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-secondary text-secondary-foreground border-border',
  federal: 'bg-slate-100 text-slate-700 border-slate-200',
  state: 'bg-blue-50 text-blue-700 border-blue-200',
  local: 'bg-teal-50 text-teal-700 border-teal-200',
  judicial: 'bg-violet-50 text-violet-700 border-violet-200',
};

export function DistrictBadge({ text, variant = 'default', className }: DistrictBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {text}
    </span>
  );
}
