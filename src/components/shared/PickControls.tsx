import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { usePicks, setContestPick, setMeasurePick, type Picks } from '@/services/picks';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/** Picks for the current visitor (account when signed in, device otherwise). */
export function useMyPicks(): Picks {
  const { user, loading } = useAuth();
  return usePicks(loading ? undefined : user?.id ?? null);
}

const failed = () => toast.error(t("Couldn't save your pick. Please try again."));

/** Toggle: "this is my pick" for one candidate in one race. */
export function CandidatePickButton({ contestId, candidateId, name, className }: {
  contestId: string; candidateId: string; name: string; className?: string;
}) {
  const picks = useMyPicks();
  const picked = picks.contests[contestId] === candidateId;
  return (
    <button
      type="button"
      aria-pressed={picked}
      aria-label={picked ? t("Remove {name} from my picks", { name }) : t("Pick {name}", { name })}
      title={picked ? t("My pick") : t("Add to my picks")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContestPick(contestId, picked ? null : candidateId).catch(failed);
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors touch-target',
        picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary',
        className,
      )}
    >
      <Check className="h-3.5 w-3.5" />
      {picked ? t("My pick") : t("Pick")}
    </button>
  );
}

/** Yes / No pick for a ballot measure. */
export function MeasurePickButtons({ measureId, className }: { measureId: string; className?: string }) {
  const picks = useMyPicks();
  const current = picks.measures[measureId];
  const choose = (c: 'yes' | 'no') => setMeasurePick(measureId, current === c ? null : c).catch(failed);
  return (
    <div className={cn('flex items-center gap-2', className)} role="group" aria-label={t("My pick")}>
      <span className="text-xs font-medium text-muted-foreground">{t("My pick")}:</span>
      {(['yes', 'no'] as const).map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={current === c}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); choose(c); }}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold transition-colors touch-target',
            current === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary',
          )}
        >
          {c === 'yes' ? t("Yes") : t("No")}
        </button>
      ))}
    </div>
  );
}
