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
