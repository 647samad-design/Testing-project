import { usePageMeta } from '@/hooks/use-page-meta';
import { Link } from 'react-router-dom';
import { Mail, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { t } from '@/i18n';

export function ContactPage() {
  usePageMeta({ title: t("Contact Us") });
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{t("Contact Us")}</h1>
        <p className="mt-3 text-muted-foreground">{t("Corrections, accessibility issues, candidate claims, press, or anything else — we'd like to hear from you.")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-6 rounded-2xl">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">{t("Email")}</h2>
          <a href="mailto:getnerfabe@gmail.com" className="mt-1 block text-sm text-primary hover:underline">{t("getnerfabe@gmail.com")}</a>
          <p className="mt-2 text-xs text-muted-foreground">{t("For general questions, corrections, candidate claims, or accessibility feedback.")}</p>
        </Card>

        <Card className="p-6 rounded-2xl">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">{t("Mailing Address")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Gov Search App")}<br />{t("1741 NE 147 St")}<br />{t("Miami, FL 33181")}</p>
        </Card>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">{t("Are you a candidate? You can also claim and verify your profile directly from your")}{' '}
        <Link to="/candidate-portal" className="text-primary hover:underline">{t("Candidate Portal")}</Link>.
      </p>
    </div>
  );
}
