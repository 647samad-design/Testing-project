
import { t } from '@/i18n';export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{t("About Gov Search App")}</h1>
      </header>
      <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-p:leading-relaxed">
        <p>{t("Gov Search App exists for one reason: voters deserve to see their full ballot, understand who and what is on it, and follow the evidence back to its source — without wading through partisan spin to get there.")}</p>
        <p>{t("We started Gov Search App because researching a ballot shouldn't mean fifteen browser tabs, a dozen news sites, and still not knowing where a candidate actually stands on the issue you care about. Every piece of information on Gov Search App is tied to a cited source, and every candidate profile gives the candidate a direct way to speak for themselves — through a free, verified claim process — rather than relying only on secondhand coverage.")}</p>
        <h2>{t("What we believe")}</h2>
        <ul>
          <li>{t("Core ballot information should always be free.")}</li>
          <li>{t("Evidence and sourcing matter more than opinion — ours or anyone else's.")}</li>
          <li>{t("Nonpartisanship means not endorsing candidates, parties, or measures, ever.")}</li>
          <li>{t("A platform covering elections has to hold itself to a higher security and accuracy bar than most software, because the stakes for getting it wrong are higher.")}</li>
        </ul>
        <p>{t("Gov Search App is operated by Gov Search App, based in Miami, Florida. See our")}{' '}
          <a href="/methodology">{t("Methodology")}</a> {t("page for how we source and verify information, or")}{' '}
          <a href="/contact">{t("get in touch")}</a> {t("if you have questions.")}</p>
      </div>
    </div>
  );
}
