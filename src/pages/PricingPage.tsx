import { useState } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useNavigate } from 'react-router-dom';
import { startCheckout, type CheckoutPlan } from '@/services/stripe';
import { toast } from 'sonner';

const candidateFeatures = [
  'Save unlimited candidates to your watchlist',
  'Get email alerts when new info is added',
  'Access advanced candidate comparison tools',
  'See voting records with plain-English summaries',
  'Track ballot measures with personalized notes',
  'Ad-free browsing experience',
];

const proFeatures = [
  ...candidateFeatures,
  'Priority AI research requests',
  'Early access to new tools',
  'Support our nonpartisan mission at the highest tier',
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
  { id: 'free', name: 'Free', price: 0, period: 'forever', description: 'Everything you need to research your ballot', features: ['See your full ballot', 'Research candidates', 'Compare positions', 'Follow evidence sources', 'Ask BallotLens AI (limited)'], cta: 'Current Plan', highlight: false },
  { id: 'candidate_monthly', name: 'Candidate', price: 9, period: '/month', description: 'Advanced tools for engaged voters', features: candidateFeatures, cta: 'Go Candidate', highlight: false },
  { id: 'pro_monthly', name: 'Pro', price: 29, period: '/month', description: 'Everything, for power users', features: proFeatures, cta: 'Go Pro', highlight: true },
];

const yearlyPlans: Record<string, { id: CheckoutPlan; price: number }> = {
  candidate_monthly: { id: 'candidate_yearly', price: 89 },
  pro_monthly: { id: 'pro_yearly', price: 289 },
};

export function PricingPage() {
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
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Free for everyone. More power for the rest.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            BallotLens is free forever — no paywalls on ballot information. Candidate and Pro
            add advanced tools for voters who want to go deeper.
          </p>

          <div className="mt-6 inline-flex items-center rounded-full border border-border bg-secondary/40 p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${billing === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${billing === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              Yearly <span className="text-xs opacity-80">(save ~17%)</span>
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 sm:px-6 py-12">
        <div className="grid gap-5 md:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const isYearly = billing === 'yearly' && yearlyPlans[plan.id];
            const displayPrice = isYearly ? yearlyPlans[plan.id].price : plan.price;
            const displayPeriod = isYearly ? '/year' : plan.period;
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
                    <Sparkles className="h-3 w-3" /> Most Popular
                  </span>
                )}
                <h3 className="font-bold text-xl">{plan.name}</h3>
                <p className="mt-2 text-4xl font-extrabold text-foreground">
                  ${displayPrice}
                  <span className="text-base font-normal text-muted-foreground">{displayPeriod}</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.highlight ? 'default' : 'outline'}
                  className="mt-6 w-full rounded-xl"
                  disabled={plan.id === 'free' || isLoading}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {plan.id === 'free' ? plan.cta : isLoading ? 'Redirecting…' : plan.cta}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="bg-secondary/30 border-y border-border/60">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Why we charge for premium tiers</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            BallotLens will never charge for access to your ballot or candidate information.
            Candidate and Pro subscriptions fund our nonpartisan research, source verification,
            and keep the platform independent. Candidates themselves can claim their profile for
            free — Candidate Management (team access, campaign tools, analytics) is a separate
            paid upgrade available from a claimed profile's dashboard.
          </p>
        </div>
      </section>
    </div>
  );
}
