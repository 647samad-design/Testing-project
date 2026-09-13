import { useEffect, useState } from 'react';
import { Megaphone, Building2, Scale, GraduationCap, Check, ArrowRight, ShieldCheck, MapPin, BarChart3, Users, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getAdPlans, getCandidateServicePlans } from '@/services/advertising';
import { AdSlot } from '@/components/shared/AdSlot';
import { SponsorBadge } from '@/components/shared/SponsorBadge';
import { Link } from 'react-router-dom';
import { ALL_REGION_CONFIGS } from '@/services/regions';
import type { AdPlan, CandidateServicePlan } from '@/types';

function formatPrice(price: number): string {
  if (price === 0) return 'Custom';
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const audienceTypes = [
  { icon: Building2, title: 'Local Businesses', desc: 'Reach engaged voters in your community' },
  { icon: Scale, title: 'Law Firms', desc: 'Connect with people researching candidates and issues' },
  { icon: GraduationCap, title: 'Universities', desc: 'Engage students and first-time voters' },
  { icon: Users, title: 'Advocacy Groups', desc: 'Share educational content with an informed audience' },
];

const placementOptions = [
  { icon: Megaphone, label: 'Homepage Banner' },
  { icon: Users, label: 'Candidate Page' },
  { icon: Newspaper, label: 'Election Page' },
  { icon: Scale, label: 'Issue Page' },
  { icon: BarChart3, label: 'Search Results' },
  { icon: Megaphone, label: 'Mobile Banner' },
  { icon: Megaphone, label: 'Footer Placement' },
  { icon: Megaphone, label: 'Sponsored Content' },
];

export function AdvertisingPage() {
  const [plans, setPlans] = useState<AdPlan[]>([]);
  const [servicePlans, setServicePlans] = useState<CandidateServicePlan[]>([]);

  useEffect(() => {
    Promise.all([getAdPlans(), getCandidateServicePlans()]).then(([a, c]) => {
      setPlans(a);
      setServicePlans(c);
    });
  }, []);

  return (
    <div className="animate-fade-in">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-background to-background" />
        <div className="absolute top-10 right-1/4 h-72 w-72 rounded-full bg-accent/8 blur-3xl animate-float" />
        <div className="relative mx-auto max-w-content px-4 sm:px-6 py-16 md:py-24 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Megaphone className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl leading-[1.05]">
            Reach engaged voters.
            <br />
            <span className="text-primary">Keep it honest.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Advertise on BallotLens and connect with an audience that cares about
            their community. Every ad is clearly labeled and never affects
            candidate rankings or editorial content.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" className="h-14 px-8 rounded-2xl text-base font-bold touch-target shadow-md shadow-primary/20" asChild>
              <Link to="/signin">Start Advertising <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 rounded-2xl text-base font-semibold touch-target" asChild>
              <Link to="/contact">Talk to Our Team</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Who advertises on BallotLens?</h2>
        <p className="mt-3 text-center text-muted-foreground">Organizations that want to reach informed, civically engaged audiences.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {audienceTypes.map((a) => (
            <Card key={a.title} className="p-6 text-center rounded-2xl hover:shadow-lg transition-all">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <a.icon className="h-7 w-7 text-primary" strokeWidth={1.8} />
              </div>
              <h3 className="mt-4 font-bold text-lg">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-secondary/30 border-y border-border/60">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">Where your ad appears</h2>
          <p className="mt-3 text-center text-muted-foreground">Choose from multiple placements across the platform.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {placementOptions.map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <p.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-sm font-semibold text-foreground">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
        <p className="mt-3 text-center text-muted-foreground">Admin-configurable. No hidden fees. Cancel anytime.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, idx) => (
            <Card key={plan.id} className={`relative p-6 rounded-2xl transition-all hover:shadow-xl ${idx === 1 ? 'border-2 border-primary ring-2 ring-primary/10' : ''}`}>
              {idx === 1 && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Most Popular</span>
              )}
              <h3 className="font-bold text-xl">{plan.plan_name}</h3>
              <p className="mt-2 text-3xl font-extrabold text-foreground">
                {formatPrice(plan.monthly_price)}
                {plan.monthly_price > 0 && <span className="text-base font-normal text-muted-foreground">/mo</span>}
              </p>
              {plan.description && <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>}
              <ul className="mt-4 space-y-2">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant={idx === 1 ? 'default' : 'outline'} className="mt-6 w-full rounded-xl" asChild>
                <Link to="/signin">Get Started</Link>
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-secondary/30 border-y border-border/60">
        <div className="mx-auto max-w-content px-4 sm:px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <MapPin className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Geographic targeting</h2>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              Target by state, city, ZIP code, or district. Only reach the voters
              who matter to you. We currently support {ALL_REGION_CONFIGS.length} states with more on the way.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {ALL_REGION_CONFIGS.map((c: { state: string }) => (
                <span key={c.state} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground">{c.state}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <ShieldCheck className="h-7 w-7 text-accent" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Are you a candidate?</h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Claim your profile and manage your campaign information. All candidate
            services are administrative only — they never affect your ranking,
            placement, or editorial content.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 max-w-3xl mx-auto">
          {servicePlans.map((plan) => (
            <Card key={plan.id} className="p-6 rounded-2xl">
              <h3 className="font-bold text-xl">{plan.plan_name}</h3>
              <p className="mt-2 text-3xl font-extrabold text-foreground">
                {formatPrice(plan.annual_price)}
                <span className="text-base font-normal text-muted-foreground">/yr</span>
              </p>
              {plan.description && <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>}
              <ul className="mt-4 space-y-2">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="mt-6 w-full rounded-xl" asChild>
                <Link to="/signin">Claim Your Profile</Link>
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 sm:px-6 py-16">
        <Card className="p-8 rounded-2xl bg-gradient-to-r from-primary/5 to-accent/5">
          <h2 className="text-2xl font-bold tracking-tight">Our commitment to nonpartisanship</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              'Advertising never affects candidate rankings or editorial placement',
              'All ads are clearly labeled as "Advertisement"',
              'Sponsorships are always marked "Presented by" or "Sponsored by"',
              'Advertisers cannot edit candidate information',
              'Candidate payments never affect search order or comparison results',
              'All content submissions go through admin approval',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <p className="text-sm text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <div className="mx-auto max-w-content px-4 sm:px-6 pb-16 space-y-4">
        <AdSlot placement="footer" />
        <SponsorBadge placement="civic_page" />
      </div>
    </div>
  );
}
