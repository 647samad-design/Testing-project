import { cn } from '@/lib/utils';
import type { SourceType, ArticleType } from '@/types';

interface SourceBadgeProps {
  type: SourceType | ArticleType;
  className?: string;
}

const labels: Record<string, { label: string; color: string }> = {
  government: { label: 'Government Record', color: 'bg-primary/10 text-primary border-primary/25 font-semibold' },
  candidate: { label: 'Candidate Statement', color: 'bg-blue-50 text-blue-700 border-blue-200 font-semibold' },
  campaign: { label: 'Campaign Material', color: 'bg-amber-50 text-amber-700 border-amber-200 font-semibold' },
  legislative: { label: 'Legislative Record', color: 'bg-primary/10 text-primary border-primary/25 font-semibold' },
  court: { label: 'Court Record', color: 'bg-slate-100 text-slate-700 border-slate-200 font-semibold' },
  news: { label: 'News Report', color: 'bg-cyan-50 text-cyan-700 border-cyan-200 font-semibold' },
  reporting: { label: 'Reporting', color: 'bg-cyan-50 text-cyan-700 border-cyan-200 font-semibold' },
  interview: { label: 'Interview', color: 'bg-teal-50 text-teal-700 border-teal-200 font-semibold' },
  debate: { label: 'Debate', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold' },
  video: { label: 'Video', color: 'bg-purple-50 text-purple-700 border-purple-200 font-semibold' },
  social: { label: 'Social Media', color: 'bg-rose-50 text-rose-700 border-rose-200 font-semibold' },
  social_media: { label: 'Social Media', color: 'bg-rose-50 text-rose-700 border-rose-200 font-semibold' },
  opinion: { label: 'Opinion', color: 'bg-orange-50 text-orange-700 border-orange-200 font-semibold' },
  other: { label: 'Other', color: 'bg-muted text-muted-foreground border-border font-semibold' },
};

export function SourceBadge({ type, className }: SourceBadgeProps) {
  const c = labels[type] ?? labels.other;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        c.color,
        className
      )}
    >
      {c.label}
    </span>
  );
}
