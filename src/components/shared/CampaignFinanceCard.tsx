import { useEffect, useState } from 'react';
import { DollarSign, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getCampaignFinance, type CampaignFinance } from '@/services/campaign-finance';
import { parseDateOnly } from '@/lib/date-utils';
import { t, dateLocale } from '@/i18n';

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString(dateLocale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Official campaign finance totals from the FEC for a federal candidate. */
export function CampaignFinanceCard({ fecId }: { fecId: string }) {
  const [data, setData] = useState<CampaignFinance | null>(null);
  useEffect(() => {
    let alive = true;
    getCampaignFinance(fecId).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [fecId]);

  const tt = data?.totals;
  const sources = tt ? [
    { label: t("Individuals"), value: tt.individual ?? 0, cls: 'bg-primary' },
    { label: t("PACs & other committees"), value: tt.pac ?? 0, cls: 'bg-accent' },
    { label: t("Party & candidate's own money"), value: tt.partyAndSelf ?? 0, cls: 'bg-muted-foreground' },
  ] : [];
  const sum = sources.reduce((a, s) => a + s.value, 0);

  return (
    <Card className="p-5 md:col-span-2">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">{t("Campaign finance (FEC)")}</h3>
        {tt?.cycle && <span className="text-xs text-muted-foreground">{t("{year} cycle", { year: tt.cycle })}</span>}
      </div>

      {!data ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("Loading…")}</p>
      ) : data.status !== 'ok' || !tt ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("Campaign finance data isn't available right now.")}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
            <Stat label={t("Raised")} value={usd(tt.receipts)} />
            <Stat label={t("Spent")} value={usd(tt.disbursements)} />
            <Stat label={t("Cash on hand")} value={usd(tt.cashOnHand)} />
            <Stat label={t("Debts")} value={usd(tt.debts)} />
          </div>
          {sum > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("Where the money came from")}</p>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-secondary" role="img" aria-label={sources.map((s) => `${s.label}: ${Math.round((s.value / sum) * 100)}%`).join(', ')}>
                {sources.map((s) => s.value > 0 && <div key={s.label} className={s.cls} style={{ width: `${(s.value / sum) * 100}%` }} />)}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {sources.map((s) => (
                  <li key={s.label} className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.cls}`} />{s.label}: <span className="font-semibold text-foreground">{usd(s.value)}</span> ({Math.round((s.value / sum) * 100)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">
            {t("Source: Federal Election Commission filings")}
            {tt.coverageEnd && ` · ${t("through {date}", { date: parseDateOnly(tt.coverageEnd).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) })}`}
            {data.fecUrl && (
              <> · <a href={data.fecUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">fec.gov<ExternalLink className="h-3 w-3" /></a></>
            )}
          </p>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
