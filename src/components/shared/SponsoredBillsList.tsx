import { useEffect, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { getSponsoredBills, type SponsoredBill } from '@/services/representatives';
import { parseDateOnly } from '@/lib/date-utils';
import { t, dateLocale } from '@/i18n';

/** A legislator's most recent sponsored bills, loaded live from Open States. */
export function SponsoredBillsList({ personId, jurisdictionId, limit = 5 }: { personId: string; jurisdictionId: string; limit?: number }) {
  const [bills, setBills] = useState<SponsoredBill[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setBills(null);
    setFailed(false);
    getSponsoredBills(personId, jurisdictionId).then((r) => {
      if (!alive) return;
      if (r.status === 'ok') setBills(r.bills ?? []); else setFailed(true);
    });
    return () => { alive = false; };
  }, [personId, jurisdictionId]);

  if (failed) return <p className="text-xs text-muted-foreground">{t("Legislative record isn't available right now.")}</p>;
  if (!bills) return <p className="text-xs text-muted-foreground">{t("Loading bills…")}</p>;
  if (bills.length === 0) return <p className="text-xs text-muted-foreground">{t("No sponsored bills found.")}</p>;

  return (
    <ul className="space-y-2">
      {bills.slice(0, limit).map((b) => (
        <li key={`${b.session}-${b.identifier}`} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {b.identifier}
                {b.session && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({b.session})</span>}
              </p>
              <p className="text-muted-foreground line-clamp-2">{b.title}</p>
              {b.latestAction && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.latestActionDate && `${parseDateOnly(b.latestActionDate).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' })} · `}
                  {b.latestAction}
                </p>
              )}
              {b.url && (
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  {t("View bill")}<ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </li>
      ))}
      <li className="text-[11px] text-muted-foreground">{t("Source: Open States. Bills this legislator sponsored, newest activity first.")}</li>
    </ul>
  );
}
