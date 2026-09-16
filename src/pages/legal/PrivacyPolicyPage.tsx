const EFFECTIVE_DATE = 'September 15, 2026';
const LAST_UPDATED = 'September 15, 2026';

const SECTIONS = [
  { id: 'information-we-collect', label: '1. Information We Collect' },
  { id: 'how-we-use', label: '2. How We Use Information' },
  { id: 'legal-basis', label: '3. Our Legal Basis for Processing' },
  { id: 'how-we-share', label: '4. How We Share Information' },
  { id: 'cookies', label: '5. Cookies & Tracking' },
  { id: 'data-retention', label: '6. Data Retention' },
  { id: 'data-security', label: '7. Data Security' },
  { id: 'your-rights', label: '8. Your Privacy Rights' },
  { id: 'california', label: '9. California Privacy Rights (CCPA/CPRA)' },
  { id: 'children', label: "10. Children's Privacy" },
  { id: 'international', label: '11. International Users' },
  { id: 'political-content', label: '12. Political Content & Nonpartisanship' },
  { id: 'changes', label: '13. Changes to This Policy' },
  { id: 'contact', label: '14. Contact Us' },
];

export function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Effective date: {EFFECTIVE_DATE} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
        </p>
      </header>

      <nav aria-label="Table of contents" className="mb-10 rounded-xl border border-border bg-secondary/30 p-5">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contents</p>
        <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">{s.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h2:scroll-mt-24 prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-primary">

        <p>
          BallotLens LLC ("BallotLens," "we," "us," or "our") operates the BallotLens website,
          mobile-responsive web application, and related services (collectively, the "Service").
          This Privacy Policy explains what personal information we collect, why we collect it,
          how we use and share it, and the choices and rights you have. By using the Service, you
          agree to the collection and use of information as described here.
        </p>
        <p>
          We built BallotLens to help voters make informed decisions without being tracked,
          profiled, or sold to advertisers based on their political interests. This policy reflects
          that principle wherever legally and practically possible.
        </p>

        <h2 id="information-we-collect">1. Information We Collect</h2>
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account information.</strong> Name, email address, and ZIP code you provide
            when creating an account, and any optional profile details you add (photo, occupation,
            interests).
          </li>
          <li>
            <strong>Usage data.</strong> Pages viewed, features used, search terms, and interactions
            with candidate profiles, ballots, quizzes, and the AI assistant. We use this to improve
            the Service, not to build advertising profiles about your political views.
          </li>
          <li>
            <strong>Content you submit.</strong> Saved candidates, notes, questions, quiz responses,
            candidate claims, messages, community posts, and any files you upload (such as candidate
            photos).
          </li>
          <li>
            <strong>Device and log data.</strong> IP address, browser type, operating system, and
            general location derived from your IP address (city/region level, not precise GPS unless
            you separately grant location permission).
          </li>
          <li>
            <strong>Payment information.</strong> If you subscribe to a paid tier or purchase
            Candidate Management, payment is processed by Stripe, Inc. We receive confirmation of
            your subscription status and the last four digits of your payment method for support
            purposes; we do not store your full card number, CVV, or bank credentials — Stripe
            handles that under its own privacy policy, available at stripe.com/privacy.
          </li>
        </ul>

        <h2 id="how-we-use">2. How We Use Information</h2>
        <ul>
          <li>To provide, operate, and maintain the Service, including your personalized ballot and district lookups.</li>
          <li>To verify candidate claims and prevent impersonation of real candidates or officials.</li>
          <li>To process subscriptions, payments, and Candidate Management purchases.</li>
          <li>To send account-related messages (confirmations, security alerts) and, where you have opted in, product updates or election reminders.</li>
          <li>To moderate user-submitted content for accuracy, spam, and abuse.</li>
          <li>To detect, investigate, and prevent fraud, security incidents, and violations of our Terms of Service.</li>
          <li>To comply with legal obligations and respond to lawful requests from public authorities.</li>
        </ul>
        <p>We do not use your data to serve you political advertising based on inferred party affiliation, and we do not sell personal information to data brokers.</p>

        <h2 id="legal-basis">3. Our Legal Basis for Processing</h2>
        <p>
          Where applicable law requires a legal basis for processing (for example, for users in the
          European Economic Area or United Kingdom), we rely on: performance of a contract (to
          provide the Service you signed up for), legitimate interests (improving and securing the
          Service), consent (for optional communications and certain cookies), and compliance with
          legal obligations.
        </p>

        <h2 id="how-we-share">4. How We Share Information</h2>
        <p>We do not sell your personal information. We share information only with:</p>
        <ul>
          <li><strong>Service providers</strong> who help us operate the Service under contract and only for that purpose — for example, Supabase (hosting and database), Stripe (payments), and the Associated Press (election results data).</li>
          <li><strong>Other users</strong>, to the extent you choose to make information public — for example, a claimed and verified candidate profile, or a public post in the community feed.</li>
          <li><strong>Law enforcement or regulators</strong>, when required by a valid legal process such as a subpoena or court order, or to protect the rights, property, or safety of BallotLens, our users, or the public.</li>
          <li><strong>A successor entity</strong>, in the event of a merger, acquisition, or sale of assets — you will be notified before your information becomes subject to a different privacy policy.</li>
        </ul>

        <h2 id="cookies">5. Cookies &amp; Tracking</h2>
        <p>
          We use strictly necessary cookies to keep you signed in and remember your preferences.
          We use limited analytics cookies to understand aggregate usage patterns (for example, which
          pages are most visited) — this data is not used to build individual political profiles. You
          can control cookies through your browser settings; disabling strictly necessary cookies may
          prevent you from staying signed in.
        </p>

        <h2 id="data-retention">6. Data Retention</h2>
        <p>
          We retain account and content data for as long as your account is active, or as needed to
          provide the Service, comply with legal obligations, resolve disputes, and enforce our
          agreements. If you delete your account, we delete or anonymize your personal information
          within 30 days, except where retention is required by law (for example, financial records
          related to payments).
        </p>

        <h2 id="data-security">7. Data Security</h2>
        <p>
          We use industry-standard safeguards, including encryption in transit (TLS), database
          access controls, and row-level security policies restricting who can read or modify data.
          No method of transmission or storage is 100% secure, and we cannot guarantee absolute
          security. If we become aware of a data breach affecting your personal information, we will
          notify you and relevant authorities as required by applicable law.
        </p>

        <h2 id="your-rights">8. Your Privacy Rights</h2>
        <p>Depending on your location, you may have the right to:</p>
        <ul>
          <li>Access the personal information we hold about you.</li>
          <li>Correct inaccurate information.</li>
          <li>Delete your account and associated personal information.</li>
          <li>Export your data in a portable format.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Withdraw consent for optional communications at any time.</li>
        </ul>
        <p>
          You can exercise most of these rights directly from your Account settings, or by
          contacting us at the email below. We will respond within the timeframe required by
          applicable law (generally 30–45 days).
        </p>

        <h2 id="california">9. California Privacy Rights (CCPA/CPRA)</h2>
        <p>
          If you are a California resident, the California Consumer Privacy Act (as amended by the
          California Privacy Rights Act) gives you the right to know what personal information we
          collect, request deletion, correct inaccuracies, opt out of the "sale" or "sharing" of
          personal information (we do not sell or share personal information as those terms are
          defined by the CCPA), and not be discriminated against for exercising these rights. To
          submit a request, email us at the address in Section 14 with the subject line "California
          Privacy Request."
        </p>

        <h2 id="children">10. Children's Privacy</h2>
        <p>
          BallotLens is not directed to children under 13, and we do not knowingly collect personal
          information from children under 13. If we learn that we have collected personal
          information from a child under 13 without parental consent, we will delete it promptly. If
          you believe a child has provided us with personal information, contact us at the email
          below.
        </p>

        <h2 id="international">11. International Users</h2>
        <p>
          BallotLens is designed for U.S. voters and is operated from the United States. If you
          access the Service from outside the United States, your information will be transferred
          to, stored, and processed in the United States, where data protection laws may differ from
          those in your jurisdiction.
        </p>

        <h2 id="political-content">12. Political Content &amp; Nonpartisanship</h2>
        <p>
          BallotLens is a nonpartisan platform. We do not use your data to target you with content
          designed to influence your vote for or against any candidate or party, and we do not share
          inferred political affiliation data with third parties for advertising purposes.
        </p>

        <h2 id="changes">13. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we will
          notify you by email or through a notice on the Service before the change takes effect. The
          "Last updated" date above reflects the most recent revision.
        </p>

        <h2 id="contact">14. Contact Us</h2>
        <p>
          BallotLens LLC<br />
          1741 NE 147 St, Miami, FL 33181<br />
          Email: <a href="mailto:getnerfabe@gmail.com">getnerfabe@gmail.com</a>
        </p>

        <hr />
        <p className="text-sm text-muted-foreground not-prose">
          This document is a template-based draft prepared for legal counsel review and has not yet
          been reviewed or approved by an attorney. It should not be relied upon as final or
          published to end users until reviewed by a licensed attorney in the applicable
          jurisdiction(s).
        </p>
      </div>
    </div>
  );
}
