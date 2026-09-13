import { Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { box: 'h-8 w-8', icon: 'h-4 w-4', text: 'text-base' },
  md: { box: 'h-9 w-9', icon: 'h-5 w-5', text: 'text-lg' },
  lg: { box: 'h-12 w-12', icon: 'h-6 w-6', text: 'text-xl' },
};

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  const c = sizeConfig[size];

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className={cn(
        'flex items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/20',
        c.box
      )}>
        <Scale className={cn('text-primary-foreground', c.icon)} />
      </div>
      {showText && (
        <span className={cn('font-extrabold tracking-tight text-foreground', c.text)}>
          Ballot<span className="text-primary">Lens</span>
        </span>
      )}
    </div>
  );
}
