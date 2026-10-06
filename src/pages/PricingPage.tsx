import { useEffect, useState } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { startCheckout, type CheckoutPlan } from '@/services/stripe';
import { toast } from 'sonner';
import { usePageMeta } from '@/hooks/use-page-meta';
import { t, msg } from '@/i18n';

const candidateFeatures = [
  msg('Follow unlimited candidates to your watchlist'),
  msg('Get email alerts when new info is added'),
  msg('Access advanced candidate comparison tools'),
  msg('See voting records with plain-English summaries'),
  msg('Track ballot measures with personalized notes'),
  msg('Ad-free browsing experience'),
];

const proFeatures = [
  ...candidateFeatures,
  msg('Expanded AI Research — up to 100 questions/day'),
  msg('Early access to new tools'),
  msg('Support our nonpartisan mission at the highest tier'),
];

type Plan = {
  id: 'free' | CheckoutPlan;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlight: boolean;
};

const plans: Plan[] = [
  { id: 'free', name: msg('Free'), price: 0, period: msg('forever'), description: 'Everything you need to research your ballot', features: [msg('See your full ballot'), msg('Research candidates'), msg('Compare positions'), msg('Follow evidence sources'), msg('Ask Gov Search AI — 5 questions/day'), msg('Follow up to 5 candidates')], cta: 'Current Plan', highlight: false },
  { id: 'candidate_monthly', name: msg('Candidate'), price: 9, period: msg('/month'), description: 'Advanced tools for engaged voters', features: candidateFeatures, cta: 'Go Candidate', highlight: false },
  { id: 'pro_monthly', name: msg('Pro'), price: 29, period: msg('/month'), description: 'Everything, for power users', features: proFeatures, cta: 'Go Pro', highlight: true },
];

const yearlyPlans: Record<string, { id: CheckoutPlan; price: number }> = {
  candidate_monthly: { id: 'candidate_yearly', price: 89 },
  pro_monthly: { id: 'pro_yearly', price: 289 },
};

export function PricingPage() {
  // Stripe sends a canceled checkout back here; say so instead of showing the
  // pricing page as if nothing happened.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('checkout') === 'canceled') {
      toast('Checkout was canceled — no charge was made.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  usePageMeta({ title: t("Pricing"), description: t("Simple, transparent pricing for voters and candidates.") });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleSubscribe(planId: Plan['id']) {
    if (planId === 'free') return;
    if (!user) {
      navigate('/signin');
      return;
    }

    const targetPlan: CheckoutPlan =
      billing === 'yearly' && yearlyPlans[planId] ? yearlyPlans[planId].id : (planId as CheckoutPlan);

    setLoadingPlan(planId);
    try {
      await startCheckout(targetPlan);
      // startCheckout redirects the browser on success; nothing else to do here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start checkout. Please try again.');
      setLoadingPlan(null);
    }
  }

  return (
    <div className="animate-fade-in">
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-background to-background" />
        <div className="absolute top-10 right-1/4 h-64 w-64 rounded-full bg-accent/8 blur-3xl animate-float" />
        <div className="relative mx-auto max-w-content px-4 sm:px-6 py-12 md:py-16 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Crown className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{t("Free for everyone. More power for the rest.")}</h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">{t("Gov Search App is free forever — no paywalls on ballot information. Candidate and Pro add advanced tools for voters who want to go deeper.")}</p>

          <div className="mt-6 inline-flex items-center rounded-full border border-border bg-secondary/40 p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${billing === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >{t("Monthly")}</button>
            <button
              onClick={() => setBilling('yearly')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${billing === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >{t("Yearly")} <span className="text-xs">{t("(save ~17%)")}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 sm:px-6 py-12">
        <div className="grid gap-5 md:grid-cols-3 max-w-5xl mx-auto [&>*]:min-w-0">
          {plans.map((plan) => {
            const isYearly = billing === 'yearly' && yearlyPlans[plan.id];
            const displayPrice = isYearly ? yearlyPlans[plan.id].price : plan.price;
            const displayPeriod = t(isYearly ? msg('/year') : plan.period);
            const isLoading = loadingPlan === plan.id;

            return (
              <Card
                key={plan.id}
                className={`relative p-6 rounded-2xl transition-all hover:shadow-xl ${
                  plan.highlight ? 'border-2 border-primary ring-2 ring-primary/10 scale-[1.02]' : ''
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> {t("Most Popular")}</span>
                )}
                <h3 className="font-bold text-xl">{t(plan.name)}</h3>
                <p className="mt-2 text-4xl font-extrabold text-foreground">
                  ${displayPrice}
                  <span className="text-base font-normal text-muted-foreground">{displayPeriod}</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{t(plan.description)}</p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-muted-foreground">{t(f)}</span>
                    </li>
                  ))}
                </ul>
                {plan.id === 'free' && !user ? (
                  // Signed-out visitors were shown a disabled "Current Plan".
                  <Button asChild variant="outline" className="mt-6 w-full rounded-xl">
                    <Link to="/signin">{t("Get started free")}</Link>
                  </Button>
                ) : (
                  <Button
                    variant={plan.highlight ? 'default' : 'outline'}
                    className="mt-6 w-full rounded-xl"
                    disabled={plan.id === 'free' || isLoading}
                    onClick={() => handleSubscribe(plan.id)}
                  >
                    {plan.id === 'free' ? t(plan.cta) : isLoading ? t("Redirecting…") : t(plan.cta)}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="bg-secondary/30 border-y border-border/60">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight">{t("Why we charge for premium tiers")}</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto leading-relaxed">{t("Gov Search App will never charge for access to your ballot or candidate information. Candidate and Pro subscriptions fund our nonpartisan research, source verification, and keep the platform independent. Candidates themselves can claim their profile for free — Candidate Management (team access, campaign tools, analytics) is a separate paid upgrade available from a claimed profile's dashboard.")}</p>
        </div>
      </section>
    </div>
  );
}
