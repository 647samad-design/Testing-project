export function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-3 text-muted-foreground">How we source, verify, and label information on BallotLens.</p>
      </header>
      <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-h2:mt-8 prose-p:leading-relaxed prose-li:leading-relaxed">

        <h2>Where information comes from</h2>
        <ul>
          <li><strong>Official records</strong> — voting records, bill text, and legislative history, sourced from government databases and official filings.</li>
          <li><strong>Primary sources</strong> — candidate websites, official statements, and campaign filings.</li>
          <li><strong>News reporting</strong> — established, generally reliable outlets, cited by name and link.</li>
          <li><strong>Candidate self-submissions</strong> — biography, positions, and events a candidate adds through their claimed, verified profile. These are clearly labeled and go through a review step before publishing, but reflect the candidate's own statements rather than independent fact-checking of every claim.</li>
          <li><strong>The Associated Press</strong> — live and certified election results, via the AP Elections API.</li>
        </ul>

        <h2>How we verify a candidate's identity</h2>
        <p>
          Claiming a candidate profile is free, but claims are reviewed manually by our team before
          a profile is marked "verified" — checking that the person claiming it is the candidate or
          an authorized campaign representative. Only verified claims unlock the ability to edit a
          profile or receive messages as that candidate.
        </p>

        <h2>Candidate claim assessments</h2>
        <p>
          When we assess a specific claim a candidate has made, we label it against the evidence we
          found: for example, whether it's supported, unsupported, missing context, or outdated —
          rather than issuing a simple "true/false" verdict, because most political claims are more
          nuanced than that. Every assessment links back to the sources behind it.
        </p>

        <h2>AI-assisted content</h2>
        <p>
          Some content, like plain-English summaries of voting records or "Ask BallotLens" answers,
          is generated with AI, working only from the cited sources already in our database — never
          from open-ended internet search or the AI's own unsourced knowledge. It is reviewed for
          quality but can still contain errors, which is why every answer links back to the sources
          it drew from.
        </p>

        <h2>Nonpartisanship</h2>
        <p>
          BallotLens does not accept payment from candidates or campaigns in exchange for favorable
          coverage, positioning, or omission of unfavorable information. Candidate and Pro
          subscriptions and Candidate Management fees fund the platform's operating costs; they do
          not affect what appears on any candidate's profile.
        </p>

        <h2>Corrections</h2>
        <p>
          If you believe something on BallotLens is inaccurate or out of date, <a href="/contact">contact us</a> with
          the specific page and claim — we review corrections promptly and update sourced content
          when warranted.
        </p>
      </div>
    </div>
  );
}
