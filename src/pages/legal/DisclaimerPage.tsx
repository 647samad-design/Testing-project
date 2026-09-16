const LAST_UPDATED = 'September 15, 2026';

export function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Disclaimer</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-primary">

        <h2>Nonpartisan, Informational Purpose Only</h2>
        <p>
          BallotLens is a nonpartisan civic information platform. We do not endorse, support, or
          oppose any candidate, party, or ballot measure. Information on this site — including
          candidate positions, voting records, and AI-generated summaries — is provided for
          informational purposes only and should not be treated as an endorsement, legal advice, or
          the final word on any candidate or issue.
        </p>

        <h2>Accuracy of Information</h2>
        <p>
          We source candidate and election information from public records, official filings, news
          reporting, and candidate self-submissions, and we verify claims where possible. However,
          election information can change quickly, and errors or omissions may occur. Always confirm
          your registration status, polling location, ballot contents, and deadlines directly with
          your county or state election office before voting.
        </p>

        <h2>AI-Generated Content</h2>
        <p>
          Some content on BallotLens, including "Ask BallotLens" answers and plain-English summaries,
          is generated with the help of artificial intelligence based on cited sources. AI-generated
          content may contain mistakes or reflect gaps in the underlying source material. It is not a
          substitute for reading primary sources or consulting your local election authority, and it
          should not be your sole basis for deciding how to vote.
        </p>

        <h2>Election Results Data</h2>
        <p>
          Live and certified election results displayed on BallotLens are sourced from the
          Associated Press (AP) Elections API. Results may be delayed, provisional, or subject to
          later correction as counting and certification proceed. BallotLens is not responsible for
          errors originating in AP's underlying data feed. Official results are only final once
          certified by the relevant state or county election authority.
        </p>

        <h2>Candidate-Submitted Content</h2>
        <p>
          Content submitted by candidates through the Candidate Portal (biographies, positions,
          photos, event listings) reflects the candidate's own statements. Our team reviews
          submissions before they are published, but this review does not constitute independent
          verification of every factual claim a candidate makes about themselves or their record.
        </p>

        <h2>Third-Party Links and Sources</h2>
        <p>
          BallotLens links to and cites third-party sources (news outlets, government websites,
          campaign materials). We are not responsible for the content, accuracy, or availability of
          external sites, and linking to a source does not imply our endorsement of its content.
        </p>

        <h2>No Legal, Financial, or Voting Advice</h2>
        <p>
          Nothing on BallotLens constitutes legal, financial, or professional advice. If you have
          questions about your eligibility to vote, ballot access, or election law, contact your
          local election office or a qualified attorney.
        </p>

        <h2>Accessibility</h2>
        <p>
          We aim to make BallotLens usable by people of all abilities and are working toward
          conformance with WCAG 2.1 AA accessibility standards. If you encounter an accessibility
          barrier, please contact us so we can address it.
        </p>

        <hr />
        <p className="text-sm text-muted-foreground not-prose">
          This document is a template-based draft prepared for legal counsel review and has not yet
          been reviewed or approved by an attorney.
        </p>
      </div>
    </div>
  );
}
