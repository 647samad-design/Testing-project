
import { t } from '@/i18n';const LAST_UPDATED = 'September 17, 2026';

export function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{t("Accessibility Statement")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("Last updated:")} {LAST_UPDATED}</p>
      </header>
      <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-p:leading-relaxed">
        <p>{t("Gov Search App is committed to making civic information accessible to everyone, including people who use assistive technology such as screen readers, voice control, or keyboard-only navigation.")}</p>
        <h2>{t("Our approach")}</h2>
        <p>{t("We're working toward conformance with the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA, and treat accessibility as an ongoing effort rather than a one-time checklist — new features are reviewed with accessibility in mind before launch, and we address issues as they're identified.")}</p>
        <h2>{t("Known limitations")}</h2>
        <p>{t("As with any actively developed platform, some pages or components may not yet fully meet this standard. We prioritize fixes based on impact and would rather be upfront about that than overstate our current conformance.")}</p>
        <h2>{t("Feedback")}</h2>
        <p>{t("If you encounter an accessibility barrier anywhere on Gov Search App, please")}{' '}
          <a href="/contact">{t("let us know")}</a>{t(". Include the page you were on and, if possible, the assistive technology you were using — it helps us reproduce and fix the issue faster.")}</p>
      </div>
    </div>
  );
}
