const LAST_UPDATED = 'September 17, 2026';

export function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Accessibility Statement</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </header>
      <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-p:leading-relaxed">
        <p>
          BallotLens is committed to making civic information accessible to everyone, including
          people who use assistive technology such as screen readers, voice control, or keyboard-only
          navigation.
        </p>
        <h2>Our approach</h2>
        <p>
          We're working toward conformance with the Web Content Accessibility Guidelines (WCAG) 2.1,
          Level AA, and treat accessibility as an ongoing effort rather than a one-time checklist —
          new features are reviewed with accessibility in mind before launch, and we address issues
          as they're identified.
        </p>
        <h2>Known limitations</h2>
        <p>
          As with any actively developed platform, some pages or components may not yet fully meet
          this standard. We prioritize fixes based on impact and would rather be upfront about that
          than overstate our current conformance.
        </p>
        <h2>Feedback</h2>
        <p>
          If you encounter an accessibility barrier anywhere on BallotLens, please{' '}
          <a href="/contact">let us know</a>. Include the page you were on and, if possible, the
          assistive technology you were using — it helps us reproduce and fix the issue faster.
        </p>
      </div>
    </div>
  );
}
