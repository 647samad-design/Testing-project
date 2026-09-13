const EFFECTIVE_DATE = 'September 13, 2026';

export function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 prose prose-sm dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        These Terms of Service ("Terms") govern your use of the BallotLens website and services
        (the "Service"), operated by BallotLens LLC, 1741 NE 147 St, Miami, FL 33181 ("BallotLens,"
        "we," "us"). By using the Service, you agree to these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        BallotLens provides nonpartisan information about candidates, ballot measures, and
        elections to help voters make informed decisions. Core ballot information is free. Paid
        tiers (Candidate, Pro) unlock additional tools; Candidate Management is a separate paid
        upgrade available to verified candidates.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information when creating an account and are responsible for
        activity under your account. You must be at least 13 years old to use the Service.
      </p>

      <h2>3. Candidate Claims</h2>
      <p>
        Claiming a candidate profile is free. We manually review claims to confirm the claimant is
        the candidate or an authorized representative. We may reject or revoke a claim at our
        discretion, including in cases of suspected impersonation or misuse.
      </p>

      <h2>4. Subscriptions and Payment</h2>
      <p>
        Paid subscriptions (Candidate, Pro, and Candidate Management) renew automatically at the
        interval you select until canceled. Payments are processed by Stripe. Prices are shown at
        checkout and may change with notice. You can cancel a subscription at any time from your
        Account page; cancellation takes effect at the end of the current billing period.
      </p>

      <h2>5. Content and Accuracy</h2>
      <p>
        We work to verify information through cited sources, but BallotLens does not guarantee
        the completeness or accuracy of any candidate, election, or ballot information. Content on
        the Service is for informational purposes and is not legal, financial, or voting advice.
        Always confirm your polling location, deadlines, and ballot details with your local
        election authority.
      </p>

      <h2>6. Nonpartisanship</h2>
      <p>
        BallotLens does not endorse candidates or political positions. User-submitted content,
        candidate self-descriptions, and third-party sources reflect their authors' views, not
        ours.
      </p>

      <h2>7. Prohibited Conduct</h2>
      <ul>
        <li>Impersonating a candidate, official, or another user.</li>
        <li>Submitting false or misleading claims, positions, or verification requests.</li>
        <li>Uploading content you do not have the right to use (including candidate photos).</li>
        <li>Attempting to interfere with or gain unauthorized access to the Service.</li>
      </ul>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate access to the Service for violation of these Terms, at our
        discretion, with or without notice.
      </p>

      <h2>9. Disclaimers and Limitation of Liability</h2>
      <p>
        The Service is provided "as is" without warranties of any kind. To the fullest extent
        permitted by law, BallotLens is not liable for indirect, incidental, or consequential
        damages arising from your use of the Service.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Florida, without regard to conflict
        of law principles. Any disputes will be resolved in the state or federal courts located in
        Miami-Dade County, Florida.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes
        take effect constitutes acceptance of the updated Terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        BallotLens LLC, 1741 NE 147 St, Miami, FL 33181 —{' '}
        <a href="mailto:getnerfabe@gmail.com">getnerfabe@gmail.com</a>
      </p>

      <p className="text-xs text-muted-foreground mt-8">
        This is a template-based draft and has not been reviewed by an attorney. Consider having
        it reviewed before relying on it for legal compliance.
      </p>
    </div>
  );
}
