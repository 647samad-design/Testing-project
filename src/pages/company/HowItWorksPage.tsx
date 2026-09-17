import { Search, ShieldCheck, GitCompare, MessageSquare } from 'lucide-react';

const steps = [
  {
    icon: Search,
    title: 'Find your ballot',
    body: "Enter your ZIP code and BallotLens looks up every race and measure that will actually appear on your ballot, based on your specific district lines — not just your city or county.",
  },
  {
    icon: ShieldCheck,
    title: 'Research with sources',
    body: "Every candidate position, voting record entry, and fact-check is tied to a cited primary source — a vote record, an official filing, a direct quote — so you can verify it yourself, not just take our word for it.",
  },
  {
    icon: GitCompare,
    title: 'Compare candidates',
    body: 'See candidates side by side on the issues you care about, take the issue-matching quiz, and check voting records in plain English instead of legislative jargon.',
  },
  {
    icon: MessageSquare,
    title: 'Ask questions, follow along',
    body: "Ask BallotLens AI for a sourced summary of a candidate's position, follow candidates and issues for updates, and message a candidate's team directly if they've claimed their profile.",
  },
];

export function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <header className="mb-10 border-b border-border pb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">How It Works</h1>
        <p className="mt-3 text-muted-foreground">From ZIP code to informed vote, in four steps.</p>
      </header>
      <div className="space-y-8">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">{s.title}</h2>
              <p className="mt-1 text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
