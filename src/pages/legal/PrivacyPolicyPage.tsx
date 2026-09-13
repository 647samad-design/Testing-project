const EFFECTIVE_DATE = 'September 13, 2026';

export function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 prose prose-sm dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>

      <p>
        BallotLens LLC ("BallotLens," "we," "us," or "our") operates the BallotLens website and
        related services (the "Service"). This Privacy Policy explains what information we
        collect, how we use it, and the choices you have.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Account information:</strong> name, email address, and ZIP code you provide when creating an account.</li>
        <li><strong>Usage data:</strong> pages viewed, features used, and interactions with candidate profiles, ballots, and the AI assistant.</li>
        <li><strong>Content you submit:</strong> saved candidates, notes, questions, messages, quiz responses, candidate claims, and any material you upload (e.g. candidate photos).</li>
        <li><strong>Payment information:</strong> if you subscribe to a paid tier or purchase Candidate Management, payment is processed by Stripe. We do not store your full card number — Stripe handles that under its own privacy policy.</li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>To provide, maintain, and improve the Service (e.g. showing your personalized ballot).</li>
        <li>To verify candidate claims and prevent impersonation.</li>
        <li>To process subscriptions and payments.</li>
        <li>To send you account-related and, where you've opted in, informational emails.</li>
        <li>To detect, investigate, and prevent fraud, abuse, or security incidents.</li>
      </ul>

      <h2>3. How We Share Information</h2>
      <p>We do not sell your personal information. We share information only with:</p>
      <ul>
        <li>Service providers who help us operate the Service (e.g. Supabase for hosting/database, Stripe for payments), under contracts limiting their use of your data.</li>
        <li>Other users, to the extent you make information public (e.g. a claimed candidate profile, public posts in the community feed).</li>
        <li>Law enforcement or regulators, when required by law.</li>
      </ul>

      <h2>4. Your Choices</h2>
      <ul>
        <li>You can access, update, or delete your account information from your Account page.</li>
        <li>You can request a copy of your data or full account deletion by contacting us (see Section 7).</li>
        <li>You can opt out of non-essential emails at any time.</li>
      </ul>

      <h2>5. Data Retention</h2>
      <p>
        We retain account and content data for as long as your account is active, or as needed to
        provide the Service, comply with legal obligations, resolve disputes, and enforce our
        agreements.
      </p>

      <h2>6. Children's Privacy</h2>
      <p>
        BallotLens is not directed to children under 13, and we do not knowingly collect personal
        information from children under 13.
      </p>

      <h2>7. Contact Us</h2>
      <p>
        BallotLens LLC<br />
        1741 NE 147 St, Miami, FL 33181<br />
        Email: <a href="mailto:getnerfabe@gmail.com">getnerfabe@gmail.com</a>
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated version
        here with a new effective date.
      </p>

      <p className="text-xs text-muted-foreground mt-8">
        This is a template-based draft and has not been reviewed by an attorney. Consider having
        it reviewed before relying on it for legal compliance.
      </p>
    </div>
  );
}
