import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MessageSquare, Send, ExternalLink, ShieldAlert, Sparkles, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { LoadingState } from '@/components/shared/StateComponents';
import { askBallotLensAI, assessClaim } from '@/services/ai';
import { getCandidates } from '@/services/candidates';
import type { AIResponse, Candidate, ClaimAssessment } from '@/types';
import { cn } from '@/lib/utils';

const exampleQuestions = [
  'What has Alex Morgan said about healthcare?',
  'What bills has Jordan Rivera voted for?',
  'What is Taylor Brooks\' position on immigration?',
  'Compare these candidates on healthcare.',
  'Show me the evidence.',
  'What sources support this information?',
];

export function AskBallotLensPage() {
  const [searchParams] = useSearchParams();
  const initialCandidate = searchParams.get('c') ?? undefined;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | undefined>(initialCandidate);
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'ask' | 'claim'>('ask');
  const [claimResult, setClaimResult] = useState<ClaimAssessment | null>(null);
  const [claimInput, setClaimInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCandidates().then(setCandidates).catch(() => {});
  }, []);

  async function handleAsk() {
    if (!question.trim()) return;
    setLoading(true);
    setResponse(null);
    const result = await askBallotLensAI(question, selectedCandidate);
    setResponse(result);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function handleClaimCheck() {
    if (!claimInput.trim()) return;
    setLoading(true);
    setClaimResult(null);
    const result = await assessClaim(claimInput);
    setClaimResult(result);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Ask BallotLens AI</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Ask questions about candidates, issues, voting records and sources.
          The AI answers only from retrieved evidence — it never invents information.
        </p>
        <div className="mt-4">
          <DemoBanner compact />
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setMode('ask')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            mode === 'ask' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
          )}
        >
          <Sparkles className="h-4 w-4" />
          Ask a Question
        </button>
        <button
          onClick={() => setMode('claim')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            mode === 'claim' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
          )}
        >
          <Search className="h-4 w-4" />
          Claim Explorer
        </button>
      </div>

      {mode === 'ask' ? (
        <div className="space-y-6">
          {/* Question input */}
          <Card className="p-6 rounded-2xl">
            <label className="text-sm font-semibold text-foreground">Your question</label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="Ask about a candidate's position, voting record, or sources…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                className="flex-1"
              />
              <Button onClick={handleAsk} disabled={loading || !question.trim()} className="gap-2">
                <Send className="h-4 w-4" />
                Ask
              </Button>
            </div>

            {/* Candidate selector */}
            <div className="mt-4">
              <label className="text-xs font-medium text-muted-foreground">Candidate (optional)</label>
              <select
                value={selectedCandidate ?? ''}
                onChange={(e) => setSelectedCandidate(e.target.value || undefined)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All candidates</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>

            {/* Example questions */}
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Example questions:</p>
              <div className="flex flex-wrap gap-2">
                {exampleQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuestion(q)}
                    className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Loading */}
          {loading && <LoadingState message="Researching evidence…" />}

          {/* Response */}
          {response && !loading && (
            <div ref={scrollRef}>
              <AIResponseCard response={response} />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Claim input */}
          <Card className="p-6 rounded-2xl">
            <label className="text-sm font-semibold text-foreground">Enter a claim to explore</label>
            <p className="mt-1 text-xs text-muted-foreground">
              BallotLens does not label claims as simply TRUE or FALSE. It shows you the evidence and explains the context.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="e.g., Candidate Smith voted to eliminate Social Security."
                value={claimInput}
                onChange={(e) => setClaimInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleClaimCheck()}
                className="flex-1"
              />
              <Button onClick={handleClaimCheck} disabled={loading || !claimInput.trim()} className="gap-2">
                <Search className="h-4 w-4" />
                Explore
              </Button>
            </div>
          </Card>

          {loading && <LoadingState message="Examining the claim…" />}

          {claimResult && !loading && (
            <div ref={scrollRef}>
              <ClaimResultCard result={claimResult} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AIResponseCard({ response }: { response: AIResponse }) {
  return (
    <Card className="p-6 animate-slide-up">
      {/* ANSWER */}
      <section>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Answer</h3>
        </div>
        <p className="mt-3 text-foreground leading-relaxed">{response.answer}</p>

        {/* Confidence */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Confidence:</span>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            response.confidence === 'high' && 'bg-success/10 text-success',
            response.confidence === 'medium' && 'bg-warning/10 text-warning',
            response.confidence === 'low' && 'bg-muted text-muted-foreground',
          )}>
            {response.confidence}
          </span>
        </div>
      </section>

      {/* EVIDENCE */}
      {response.evidence.length > 0 && (
        <section className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Evidence</h3>
          <ul className="mt-3 space-y-2">
            {response.evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* SOURCES */}
      {response.sources.length > 0 && (
        <section className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sources</h3>
          <div className="mt-3 space-y-2">
            {response.sources.map((src) => (
              <a
                key={src.id}
                href={src.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm transition-colors hover:border-primary/30 hover:bg-secondary/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{src.title}</p>
                  <p className="text-xs text-muted-foreground">{src.publisher}</p>
                </div>
                <SourceBadge type={src.source_type} />
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* LIMITATIONS */}
      {response.limitations.length > 0 && (
        <section className="mt-6 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Limitations</h3>
          </div>
          <ul className="mt-3 space-y-2">
            {response.limitations.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                {l}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}

function ClaimResultCard({ result }: { result: ClaimAssessment }) {
  const assessmentConfig: Record<string, { label: string; className: string }> = {
    requires_context: { label: 'Requires Context', className: 'bg-warning/10 text-warning border-warning/20' },
    supported: { label: 'Supported by Evidence', className: 'bg-success/10 text-success border-success/20' },
    unsupported: { label: 'Unsupported by Evidence', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    insufficient_information: { label: 'Insufficient Information', className: 'bg-muted text-muted-foreground border-border' },
  };
  const ac = assessmentConfig[result.assessment] ?? assessmentConfig.insufficient_information;

  return (
    <Card className="p-6 animate-slide-up">
      {/* CLAIM */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Claim</h3>
        <p className="mt-3 text-foreground leading-relaxed">{result.claim}</p>
      </section>

      {/* ASSESSMENT */}
      <section className="mt-6 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assessment</h3>
        <span className={cn('mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium', ac.className)}>
          {ac.label}
        </span>
      </section>

      {/* WHY */}
      {result.explanation && (
        <section className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Why</h3>
          <p className="mt-3 text-foreground leading-relaxed">{result.explanation}</p>
        </section>
      )}

      {/* EVIDENCE */}
      {result.evidence.length > 0 && (
        <section className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Evidence</h3>
          <ul className="mt-3 space-y-2">
            {result.evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* SOURCES */}
      {result.sources.length > 0 && (
        <section className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sources</h3>
          <div className="mt-3 space-y-2">
            {result.sources.map((src) => (
              <a
                key={src.id}
                href={src.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm transition-colors hover:border-primary/30 hover:bg-secondary/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{src.title}</p>
                  <p className="text-xs text-muted-foreground">{src.publisher}</p>
                </div>
                <SourceBadge type={src.source_type} />
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 rounded-lg bg-secondary/50 p-4">
        <p className="text-xs text-muted-foreground">
          BallotLens does not simply label political claims TRUE or FALSE without explaining the evidence.
          Always review the original documentation.
        </p>
      </div>
    </Card>
  );
}
