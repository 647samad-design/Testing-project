export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">About BallotLens</h1>
      </header>
      <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-p:leading-relaxed">
        <p>
          BallotLens exists for one reason: voters deserve to see their full ballot, understand
          who and what is on it, and follow the evidence back to its source — without wading
          through partisan spin to get there.
        </p>
        <p>
          We started BallotLens because researching a ballot shouldn't mean fifteen browser tabs,
          a dozen news sites, and still not knowing where a candidate actually stands on the issue
          you care about. Every piece of information on BallotLens is tied to a cited source, and
          every candidate profile gives the candidate a direct way to speak for themselves — through
          a free, verified claim process — rather than relying only on secondhand coverage.
        </p>
        <h2>What we believe</h2>
        <ul>
          <li>Core ballot information should always be free.</li>
          <li>Evidence and sourcing matter more than opinion — ours or anyone else's.</li>
          <li>Nonpartisanship means not endorsing candidates, parties, or measures, ever.</li>
          <li>A platform covering elections has to hold itself to a higher security and accuracy bar than most software, because the stakes for getting it wrong are higher.</li>
        </ul>
        <p>
          BallotLens is operated by BallotLens LLC, based in Miami, Florida. See our{' '}
          <a href="/methodology">Methodology</a> page for how we source and verify information, or{' '}
          <a href="/contact">get in touch</a> if you have questions.
        </p>
      </div>
    </div>
  );
}
