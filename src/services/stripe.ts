import { supabase } from '@/lib/supabase';

export type CheckoutPlan =
  | 'candidate_monthly'
  | 'candidate_yearly'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'candidate_management';

/**
 * Starts a Stripe Checkout session for the given plan and redirects the browser
 * to Stripe. Throws with a user-facing message on failure so callers can show
 * an error state instead of silently doing nothing.
 */
export async function startCheckout(plan: CheckoutPlan, candidateId?: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Please sign in before subscribing.');
  }

  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    'create-checkout-session',
    { body: { plan, candidateId } }
  );

  if (error) {
    throw new Error(error.message || 'Could not start checkout. Please try again.');
  }
  if (!data?.url) {
    throw new Error(data?.error || 'Checkout session did not return a redirect URL.');
  }

  window.location.href = data.url;
}

/** Opens the Stripe-hosted billing portal (update card, view invoices, cancel). */
export async function openBillingPortal(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    throw new Error('Please sign in first.');
  }
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    'create-portal-session',
    { body: {} }
  );
  if (error) throw new Error(error.message || 'Could not open billing portal.');
  if (!data?.url) throw new Error(data?.error || 'Billing portal did not return a URL.');
  window.location.href = data.url;
}

export type MySubscription = {
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/** The signed-in user's own voter subscription (Free/Candidate/Pro), if any.
 * Explicitly filters by the current user's id rather than relying only on
 * RLS — an admin's RLS policy is intentionally broader ("own row OR is_admin"),
 * so without this filter an admin viewing their own billing page would pull
 * back every user's subscription row and `.maybeSingle()` would throw. */
export async function getMySubscription(): Promise<MySubscription | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type MyManagedCandidate = {
  candidate_id: string;
  first_name: string;
  last_name: string;
  status: string;
  is_comped: boolean;
  current_period_end: string | null;
};

/** Candidate Management subscriptions tied to profiles this user has verified-claimed.
 * Explicitly scopes to the current user's own verified claims first, for the
 * same reason as getMySubscription() above — an admin's RLS visibility here is
 * intentionally broader (all candidates), and without this filter an admin
 * would see every claimed candidate's management status on their own account
 * page, not just their own. */
export async function getMyManagedCandidates(): Promise<MyManagedCandidate[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throw new Error('Not signed in.');

  const { data: claims, error: claimsError } = await supabase
    .from('candidate_claims')
    .select('candidate_id')
    .eq('user_id', userData.user.id)
    .eq('status', 'verified');
  if (claimsError) throw claimsError;

  const candidateIds = (claims ?? []).map((c) => c.candidate_id);
  if (candidateIds.length === 0) return [];

  const { data, error } = await supabase
    .from('candidate_management_subscriptions')
    .select('candidate_id, status, is_comped, current_period_end, candidates(first_name, last_name)')
    .in('candidate_id', candidateIds);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    candidate_id: row.candidate_id,
    status: row.status,
    is_comped: row.is_comped,
    current_period_end: row.current_period_end,
    first_name: row.candidates?.first_name ?? '',
    last_name: row.candidates?.last_name ?? '',
  }));
}
