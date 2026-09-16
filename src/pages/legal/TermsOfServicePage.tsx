const EFFECTIVE_DATE = 'September 15, 2026';
const LAST_UPDATED = 'September 15, 2026';

const SECTIONS = [
  { id: 'acceptance', label: '1. Acceptance of Terms' },
  { id: 'the-service', label: '2. The Service' },
  { id: 'eligibility-accounts', label: '3. Eligibility & Accounts' },
  { id: 'candidate-claims', label: '4. Candidate Claims' },
  { id: 'subscriptions', label: '5. Subscriptions & Payment' },
  { id: 'user-content', label: '6. User Content & License' },
  { id: 'content-accuracy', label: '7. Content Accuracy & No Advice' },
  { id: 'nonpartisanship', label: '8. Nonpartisanship' },
  { id: 'prohibited-conduct', label: '9. Prohibited Conduct' },
  { id: 'ip', label: '10. Intellectual Property' },
  { id: 'termination', label: '11. Termination' },
  { id: 'disclaimers', label: '12. Disclaimers' },
  { id: 'liability', label: '13. Limitation of Liability' },
  { id: 'indemnification', label: '14. Indemnification' },
  { id: 'disputes', label: '15. Dispute Resolution & Governing Law' },
  { id: 'general', label: '16. General Provisions' },
  { id: 'contact', label: '17. Contact' },
];

export function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Terms of Service</h1>
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

        <h2 id="acceptance">1. Acceptance of Terms</h2>
        <p>
          These Terms of Service ("Terms") form a binding agreement between you and BallotLens LLC,
          a Florida limited liability company with its principal place of business at 1741 NE 147
          St, Miami, FL 33181 ("BallotLens," "we," "us," or "our"), governing your access to and use
          of the BallotLens website and related services (the "Service"). By creating an account or
          otherwise using the Service, you agree to be bound by these Terms. If you do not agree,
          do not use the Service.
        </p>

        <h2 id="the-service">2. The Service</h2>
        <p>
          BallotLens provides nonpartisan information about candidates, ballot measures, and
          elections to help voters make informed decisions. Core ballot information — your
          personalized ballot, candidate profiles, source citations, and basic AI research — is free
          and will remain free. Paid tiers (Candidate, Pro) unlock additional voter tools. Candidate
          Management is a separate paid upgrade available to verified candidates who have claimed
          their profile.
        </p>

        <h2 id="eligibility-accounts">3. Eligibility &amp; Accounts</h2>
        <p>
          You must be at least 13 years old to create an account. If you are between 13 and the age
          of majority in your jurisdiction, you represent that a parent or guardian has reviewed and
          agreed to these Terms on your behalf. You must provide accurate information when creating
          an account and are responsible for all activity that occurs under your account, including
          keeping your password confidential. Notify us immediately at the contact below if you
          suspect unauthorized use of your account.
        </p>

        <h2 id="candidate-claims">4. Candidate Claims</h2>
        <p>
          Claiming a candidate profile is free. We manually review claims to confirm the claimant is
          the candidate or an authorized representative before granting verified status. We may
          reject, suspend, or revoke a claim at our sole discretion, including where we suspect
          impersonation, misrepresentation, or misuse of the platform. Content a candidate submits
          about themselves is reviewed by our team before publication but reflects the candidate's
          own statements, not our independent verification of every underlying fact.
        </p>

        <h2 id="subscriptions">5. Subscriptions &amp; Payment</h2>
        <p>
          Paid subscriptions (Candidate, Pro, and Candidate Management) automatically renew at the
          interval you select — monthly or annually — until you cancel. Payments are processed by
          Stripe, Inc.; by subscribing, you also agree to Stripe's terms of service. Prices are shown
          at checkout and may change with at least 30 days' notice for existing subscribers.
          Cancelling a subscription takes effect at the end of the current billing period; we do not
          provide prorated refunds for partial billing periods except where required by law. You can
          manage or cancel your subscription at any time from your Account page's Billing tab, which
          opens Stripe's secure billing portal.
        </p>

        <h2 id="user-content">6. User Content &amp; License</h2>
        <p>
          "User Content" means anything you submit to the Service — profile information, photos,
          messages, questions, quiz responses, and community posts. You retain ownership of your
          User Content. By submitting it, you grant BallotLens a non-exclusive, worldwide,
          royalty-free license to host, store, reproduce, display, and distribute it solely for the
          purpose of operating and promoting the Service. You represent that you have the right to
          submit any content you upload (including candidate photos) and that it does not infringe
          any third party's rights. We may remove User Content that violates these Terms without
          prior notice.
        </p>

        <h2 id="content-accuracy">7. Content Accuracy &amp; No Advice</h2>
        <p>
          We work to verify information through cited, primary sources, but BallotLens does not
          guarantee the completeness, accuracy, or timeliness of any candidate, election, or ballot
          information, including AI-generated summaries. Content on the Service is for informational
          purposes only and does not constitute legal, financial, tax, or voting advice. Always
          confirm your polling location, registration status, ballot contents, and deadlines with
          your local election authority before voting.
        </p>

        <h2 id="nonpartisanship">8. Nonpartisanship</h2>
        <p>
          BallotLens does not endorse or oppose any candidate, party, or ballot measure.
          User-submitted content, candidate self-descriptions, and third-party sources reflect their
          authors' own views and statements, not those of BallotLens.
        </p>

        <h2 id="prohibited-conduct">9. Prohibited Conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Impersonate a candidate, election official, or another user.</li>
          <li>Submit false, misleading, or fraudulent claims, positions, votes, or verification requests.</li>
          <li>Upload content you do not have the legal right to use, including candidate photos subject to copyright.</li>
          <li>Post content that is defamatory, harassing, or that spreads deliberate election misinformation (for example, false information about voting dates, locations, or eligibility requirements).</li>
          <li>Attempt to interfere with, disrupt, reverse-engineer, or gain unauthorized access to the Service or its underlying systems.</li>
          <li>Use automated means (bots, scrapers) to access the Service in a manner that sends more requests than a human could reasonably generate, without our prior written consent.</li>
          <li>Use the Service for any unlawful purpose or in violation of any applicable election law.</li>
        </ul>

        <h2 id="ip">10. Intellectual Property</h2>
        <p>
          The Service, including its design, text, graphics, logos, and underlying software
          (excluding User Content and third-party data such as AP election results), is owned by
          BallotLens LLC or its licensors and is protected by copyright, trademark, and other
          intellectual property laws. You may not copy, modify, distribute, or create derivative
          works from the Service except as expressly permitted by these Terms.
        </p>

        <h2 id="termination">11. Termination</h2>
        <p>
          We may suspend or terminate your access to the Service, with or without notice, for
          conduct that violates these Terms or that we believe is harmful to other users, third
          parties, or BallotLens. You may stop using the Service and delete your account at any
          time. Sections that by their nature should survive termination (including Sections 7, 9,
          10, 12, 13, 14, and 15) will survive.
        </p>

        <h2 id="disclaimers">12. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS
          OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT ANY ELECTION OR CANDIDATE INFORMATION IS
          COMPLETE OR ACCURATE.
        </p>

        <h2 id="liability">13. Limitation of Liability</h2>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, BALLOTLENS LLC AND ITS OFFICERS, EMPLOYEES, AND
          AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF
          THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY FOR
          ANY CLAIM ARISING OUT OF THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE
          AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS
          ($100). SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OF LIABILITY, SO SOME OF THE
          ABOVE MAY NOT APPLY TO YOU.
        </p>

        <h2 id="indemnification">14. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless BallotLens LLC and its officers, employees, and
          agents from any claims, damages, liabilities, and expenses (including reasonable
          attorneys' fees) arising from your use of the Service, your User Content, or your
          violation of these Terms or applicable law.
        </p>

        <h2 id="disputes">15. Dispute Resolution &amp; Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of Florida, without regard to its
          conflict-of-law principles. Any dispute arising out of or relating to these Terms or the
          Service will be resolved exclusively in the state or federal courts located in Miami-Dade
          County, Florida, and you consent to the personal jurisdiction of those courts. [Placeholder
          — counsel to confirm whether a mandatory arbitration clause and/or class-action waiver
          should be added here before this page is finalized; none is currently included.]
        </p>

        <h2 id="general">16. General Provisions</h2>
        <ul>
          <li><strong>Entire agreement.</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and BallotLens regarding the Service.</li>
          <li><strong>Severability.</strong> If any provision of these Terms is found unenforceable, the remaining provisions will remain in full effect.</li>
          <li><strong>No waiver.</strong> Our failure to enforce any provision is not a waiver of our right to do so later.</li>
          <li><strong>Assignment.</strong> You may not assign these Terms without our written consent; we may assign them in connection with a merger, acquisition, or sale of assets.</li>
          <li><strong>Changes to these Terms.</strong> We may update these Terms from time to time. Material changes will be notified in advance via email or an in-app notice. Continued use after changes take effect constitutes acceptance.</li>
        </ul>

        <h2 id="contact">17. Contact</h2>
        <p>
          BallotLens LLC, 1741 NE 147 St, Miami, FL 33181 —{' '}
          <a href="mailto:getnerfabe@gmail.com">getnerfabe@gmail.com</a>
        </p>

        <hr />
        <p className="text-sm text-muted-foreground not-prose">
          This document is a template-based draft prepared for legal counsel review and has not yet
          been reviewed or approved by an attorney. It should not be relied upon as final or
          published to end users until reviewed by a licensed attorney in the applicable
          jurisdiction(s). In particular, counsel should confirm the liability cap amount, whether
          an arbitration clause is desired, and compliance with Florida and any other applicable
          state consumer-protection statutes.
        </p>
      </div>
    </div>
  );
}
