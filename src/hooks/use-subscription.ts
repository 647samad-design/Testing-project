import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getMySubscription } from '@/services/subscription-cache';

const PAID_PLANS = new Set([
  'candidate_monthly', 'candidate_yearly', 'pro_monthly', 'pro_yearly',
  'premium_monthly', 'premium_yearly', // legacy plan names
]);

/**
 * Whether the signed-in user has an active paid subscription (any tier).
 * Used to gate paid-tier perks like ad-free browsing. Shares one fetch
 * across every component that calls this on the same page — without this,
 * every <AdSlot> on a page (there can be several) would each independently
 * query the subscriptions table.
 */
export function useIsPaidUser(): { isPaid: boolean; loading: boolean } {
  const { user } = useAuth();
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsPaid(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    getMySubscription(user.id).then((sub) => {
      if (cancelled) return;
      setIsPaid(!!sub && sub.status === 'active' && PAID_PLANS.has(sub.plan));
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setIsPaid(false); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [user]);

  return { isPaid, loading };
}
