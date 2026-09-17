import { getMySubscription as fetchMySubscription, type MySubscription } from '@/services/stripe';

// Multiple components on the same page (e.g. several <AdSlot>s) may all ask
// "is this user paid?" at roughly the same moment. Without this cache, each
// one would independently query the `subscriptions` table. This memoizes the
// in-flight/most-recent request per user so they share one fetch instead.
let cache: { userId: string; promise: Promise<MySubscription | null> } | null = null;

export function getMySubscription(userId: string): Promise<MySubscription | null> {
  if (cache && cache.userId === userId) return cache.promise;
  const promise = fetchMySubscription().catch(() => null);
  cache = { userId, promise };
  return promise;
}

/** Call after a subscription changes (e.g. checkout success) so the next
 * read reflects the new plan instead of a stale cached one. */
export function invalidateSubscriptionCache(): void {
  cache = null;
}
