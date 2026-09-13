import { useEffect, useState } from 'react';
import { Check, Crown, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';

const premiumFeatures = [
  'Save unlimited candidates to your watchlist',
  'Get email alerts when new info is added',
  'Access advanced candidate comparison tools',
  'See voting records with plain-English summaries',
  'Track ballot measures with personalized notes',
  'Priority AI research requests',
  'Ad-free browsing experience',
  'Support our nonpartisan mission',
];

const plans = [
  { id: 'free', name: 'Free', price: 0, period: 'forever', description: 'Everything you need to research your ballot', features: ['See your full ballot', 'Research candidates', 'Compare positions', 'Follow evidence sources', 'Ask BallotLens AI (limited)'], cta: 'Current Plan', highlight: false },
  { id: 'premium-monthly', name: 'Premium', price: 5, period: '/month', description: 'Advanced tools for engaged voters', features: [...premiumFeatures], cta: 'Go Premium', highlight: true },
  { id: 'premium-yearly', name: 'Premium Yearly', price: 48, period: '/year', description: 'Best value — save 20%', features: [...premiumFeatures, 'Two months free'], cta: 'Go Yearly', highlight: false },
];

export function PricingPage() {
  const [, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

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
            Free for everyone. Premium for power users.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            BallotLens is free forever — no paywalls on ballot information. Premium adds advanced tools
            for voters who want to go deeper.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 sm:px-6 py-12">
        <div className="grid gap-5 md:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative p-6 rounded-2xl transition-all hover:shadow-xl ${
                plan.highlight ? 'border-2 border-primary ring-2 ring-primary/10 scale-[1.02]' : ''
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Best Value
                </span>
              )}
              <h3 className="font-bold text-xl">{plan.name}</h3>
              <p className="mt-2 text-4xl font-extrabold text-foreground">
                ${plan.price}
                <span className="text-base font-normal text-muted-foreground">{plan.period}</span>
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
                disabled={plan.id === 'free'}
                asChild={plan.id !== 'free'}
              >
                {plan.id === 'free' ? <span>{plan.cta}</span> : <Link to="/signin">{plan.cta} <ArrowRight className="ml-2 h-4 w-4" /></Link>}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-secondary/30 border-y border-border/60">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Why we charge for premium</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            BallotLens will never charge for access to your ballot or candidate information.
            Premium subscriptions fund our nonpartisan research, source verification, and keep the
            platform independent.
          </p>
        </div>
      </section>
    </div>
  );
}
