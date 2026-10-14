import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Scale, Search, ExternalLink, CalendarDays } from 'lucide-react';
import { getPublicPartner, trackPartnerEvent, type PublicPartner } from '@/services/partners';
import { getVoterBallot } from '@/services/elections';
import { extractZip, INVALID_ZIP_MESSAGE } from '@/lib/zip';
import { parseDateOnly } from '@/lib/date-utils';
import { currentLanguage, dateLocale, t } from '@/i18n';
import type { BallotContest, BallotMeasure, Election } from '@/types';

/** "Find your ballot" widget that partners embed on their own sites in an
 * iframe. No site header/footer; opens the full site in a new tab. */
export function EmbedPage() {
  const [params] = useSearchParams();
  const slug = (params.get('partner') ?? '').toLowerCase();
  const [partner, setPartner] = useState<PublicPartner | null>(null);
  const [zip, setZip] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ election: Election | null; contests: BallotContest[]; measures: BallotMeasure[]; zip: string } | null>(null);
  const viewed = useRef(false);

  useEffect(() => {
    document.title = t("Find your ballot");
    if (!slug) return;
    getPublicPartner(slug).then(setPartner);
    if (!viewed.current) { viewed.current = true; trackPartnerEvent(slug, 'view'); }
  }, [slug]);

  const color = partner?.brand_color ?? '#15776c';
  const lang = currentLanguage();
  const site = `${window.location.origin}${lang === 'en' ? '' : `/${lang}`}`;

  async function lookup() {
    const z = extractZip(zip);
    if (!z) { setError(t(INVALID_ZIP_MESSAGE)); return; }
    setError(null);
    setLoading(true);
    const r = await getVoterBallot(z);
    setLoading(false);
    if (r.error) { setError(t("We couldn't load the ballot right now. Please try again.")); return; }
    setResult({ election: r.election, contests: r.isDemo ? [] : r.contests, measures: r.isDemo ? [] : r.measures, zip: z });
    if (slug) trackPartnerEvent(slug, 'lookup');
  }

  const fullBallotUrl = result ? `${site}/ballot?zip=${result.zip}${slug ? `&ref=${encodeURIComponent(slug)}` : ''}` : site;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          {partner?.logo_url
            ? <img src={partner.logo_url} alt={partner.name} className="h-9 w-auto max-w-[120px] object-contain" />
            : <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: color }}><Scale className="h-5 w-5" /></span>}
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{t("Find your ballot")}</p>
            {partner && <p className="truncate text-xs text-muted-foreground">{t("Voter guide from {name}", { name: partner.name })}</p>}
          </div>
        </div>

        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder={t("Enter your ZIP code")}
            aria-label={t("Enter your ZIP code")}
            className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-base"
          />
          <button type="submit" disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" style={{ background: color }}>
            <Search className="h-4 w-4" />{loading ? t("Searching…") : t("Find")}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        {result && (
          <div className="mt-4">
            {result.election && (
              <p className="flex items-center gap-1.5 text-sm">
                <CalendarDays className="h-4 w-4" style={{ color }} />
                <span className="font-semibold">{result.election.name}</span>
                {result.election.election_date && (
                  <span className="text-muted-foreground">· {parseDateOnly(result.election.election_date).toLocaleDateString(dateLocale(), { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                )}
              </p>
            )}
            {result.contests.length + result.measures.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("We don't have verified ballot information for this location yet. Check back closer to election day.")}</p>
            ) : (
              <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {result.contests.map((c) => (
                  <li key={c.id} className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-semibold">{c.office_name}</p>
                    {c.district?.name && <p className="text-xs text-muted-foreground">{c.district.name}</p>}
                    {(c.candidates ?? []).length > 0 && (
                      <p className="mt-1 text-muted-foreground">
                        {(c.candidates ?? []).map((x) => `${x.first_name} ${x.last_name}${x.party ? ` (${t(x.party)})` : ''}`).join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
                {result.measures.map((m) => (
                  <li key={m.id} className="rounded-xl border border-border p-3 text-sm font-semibold">{m.title}</li>
                ))}
              </ul>
            )}
            <a
              href={fullBallotUrl}
              target="_blank"
              rel="noopener"
              onClick={() => slug && trackPartnerEvent(slug, 'click')}
              className="mt-4 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: color }}
            >
              {t("See full ballot & compare candidates")}<ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          <a href={site} target="_blank" rel="noopener" className="hover:underline">{t("Powered by Gov Search App")}</a> · {t("Nonpartisan. No endorsements.")}
        </p>
      </div>
    </div>
  );
}
