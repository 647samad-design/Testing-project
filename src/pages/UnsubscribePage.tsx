import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/use-page-meta';

const LIST_NAMES: Record<string, string> = {
  digest: 'the BallotLens Digest',
  reminders: 'election reminder emails',
};

/** Landing page for the one-click unsubscribe link in bulk emails. The
 * email-unsubscribe function does the work and redirects here with the result
 * (it can't show an HTML page itself: Supabase serves function responses on
 * *.supabase.co as plain text). */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const status = params.get('status');
  const what = LIST_NAMES[params.get('list') ?? ''] ?? 'these emails';
  usePageMeta({ title: 'Email preferences', noindex: true });

  const ok = status === 'ok';
  const title = ok ? "You're unsubscribed" : status === 'error' ? 'Something went wrong' : 'This link didn’t work';
  const message = ok
    ? `You won't receive ${what} anymore. You can turn it back on any time from Account → Notifications.`
    : status === 'error'
    ? "We couldn't update your email preferences just now. Please try the link again in a minute, or turn emails off from your account settings."
    : 'This unsubscribe link is invalid or has expired. You can manage all BallotLens emails from your account settings.';

  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <Card className="p-8 rounded-3xl text-center">
        {ok
          ? <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          : <AlertTriangle className="mx-auto h-10 w-10 text-warning" />}
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline"><Link to="/account">Email settings</Link></Button>
          <Button asChild><Link to="/">Go to BallotLens</Link></Button>
        </div>
      </Card>
    </div>
  );
}
