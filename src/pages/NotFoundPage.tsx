import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/use-page-meta';
import { t } from '@/i18n';

/** Unknown URLs used to render the home page, so a broken or mistyped link
 * looked like it "worked" and dropped people on the landing page with no
 * explanation (and search engines indexed duplicate copies of it). */
export function NotFoundPage() {
  usePageMeta({ title: t("Page not found"), noindex: true });
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Compass className="h-7 w-7 text-primary" />
      </div>
      <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-primary">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{t("We couldn’t find that page")}</h1>
      <p className="mt-3 text-muted-foreground">{t("The link may be broken or the page may have moved. Try your ballot, or browse candidates.")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild><Link to="/ballot">{t("See my ballot")}</Link></Button>
        <Button asChild variant="outline"><Link to="/candidates">{t("Browse candidates")}</Link></Button>
        <Button asChild variant="ghost"><Link to="/">{t("Home")}</Link></Button>
      </div>
    </div>
  );
}
