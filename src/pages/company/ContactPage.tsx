import { Mail, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Contact Us</h1>
        <p className="mt-3 text-muted-foreground">
          Corrections, accessibility issues, candidate claims, press, or anything else — we'd like to hear from you.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-6 rounded-2xl">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">Email</h2>
          <a href="mailto:getnerfabe@gmail.com" className="mt-1 block text-sm text-primary hover:underline">
            getnerfabe@gmail.com
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            For general questions, corrections, candidate claims, or accessibility feedback.
          </p>
        </Card>

        <Card className="p-6 rounded-2xl">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">Mailing Address</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            BallotLens LLC<br />
            1741 NE 147 St<br />
            Miami, FL 33181
          </p>
        </Card>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Are you a candidate? You can also claim and verify your profile directly from your{' '}
        <a href="/candidate-portal" className="text-primary hover:underline">Candidate Portal</a>.
      </p>
    </div>
  );
}
