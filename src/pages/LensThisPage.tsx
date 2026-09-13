import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Link2, Send, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Info, Sparkles, ClipboardPaste, ExternalLink, ChevronRight, Loader2,
  Newspaper, Mic, Tv, MessageSquare, FileText, Zap, ShieldCheck,
  TrendingUp, BookOpen, Quote, ArrowRight, Eye,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { getFactChecks, submitFactCheck } from '@/services/civic';
import { cn } from '@/lib/utils';
import type { FactCheck, FactCheckAssessment, FactCheckPlatform } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────

type Verdict = 'true' | 'misleading' | 'false' | 'needs_context' | 'unverified';

interface Annotation {
  id: string;
  start: number;
  end: number;
  text: string;
  verdict: Verdict;
  evidence: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

interface ScannedClaim {
  id: string;
  originalText: string;
  sourceUrl: string;
  sourceType: string;
  sourceLabel: string;
  previewTitle: string;
  previewDesc: string;
  previewImage?: string;
  annotations: Annotation[];
  overallVerdict: Verdict;
  confidence: number;
  createdAt: string;
}

// ─── Config ────────────────────────────────────────────────────────────────

const ASSESSMENT_STYLES: Record<Verdict, {
  label: string; icon: typeof CheckCircle2; color: string;
  bg: string; border: string; underline: string; dot: string;
}> = {
  true: {
    label: 'True', icon: CheckCircle2, color: 'text-success',
    bg: 'bg-success/8', border: 'border-success/25',
    underline: 'decoration-success/60 decoration-wavy',
    dot: 'bg-success',
  },
  misleading: {
    label: 'Misleading', icon: AlertTriangle, color: 'text-warning',
    bg: 'bg-warning/8', border: 'border-warning/25',
    underline: 'decoration-warning/60 decoration-wavy',
    dot: 'bg-warning',
  },
  false: {
    label: 'False', icon: XCircle, color: 'text-destructive',
    bg: 'bg-destructive/8', border: 'border-destructive/25',
    underline: 'decoration-destructive/60 decoration-wavy',
    dot: 'bg-destructive',
  },
  needs_context: {
    label: 'Needs Context', icon: Info, color: 'text-primary',
    bg: 'bg-primary/8', border: 'border-primary/25',
    underline: 'decoration-primary/50 decoration-dotted',
    dot: 'bg-primary',
  },
  unverified: {
    label: 'Unverified', icon: HelpCircle, color: 'text-muted-foreground',
    bg: 'bg-secondary', border: 'border-border',
    underline: 'decoration-muted-foreground/40 decoration-dotted',
    dot: 'bg-muted-foreground',
  },
};

const PLATFORM_OPTIONS: { value: FactCheckPlatform; label: string; icon: typeof MessageSquare }[] = [
  { value: 'tiktok', label: 'TikTok', icon: MessageSquare },
  { value: 'instagram', label: 'Instagram', icon: MessageSquare },
  { value: 'facebook', label: 'Facebook', icon: MessageSquare },
  { value: 'x', label: 'X (Twitter)', icon: MessageSquare },
  { value: 'tv', label: 'TV', icon: Tv },
  { value: 'news', label: 'News', icon: Newspaper },
  { value: 'other', label: 'Other', icon: FileText },
];

const DEMO_SCAN: ScannedClaim = {
  id: 'demo-1',
  originalText:
    'Crime has increased 40% since 2022 in our state. Our opponent voted against the Public Safety Reform Act, which would have funded 500 new officers. Florida has the highest crime rate in the nation.',
  sourceUrl: 'https://example.com/campaign-rally-speech',
  sourceType: 'tv',
  sourceLabel: 'Campaign Rally Speech',
  previewTitle: 'Campaign Rally — Candidate Speech Transcript',
  previewDesc: 'Recorded at a campaign rally in Tampa, FL. The candidate made several claims about crime statistics and opponent voting records.',
  annotations: [
    {
      id: 'a1', start: 0, end: 42,
      text: 'Crime has increased 40% since 2022 in our state',
      verdict: 'false',
      evidence: 'FBI Uniform Crime Reporting data shows violent crime in Florida decreased 3.2% from 2022 to 2024. Property crime also declined 5.1% in the same period.',
      sourceUrl: 'https://example.com/fbi-ucr-data',
      sourceLabel: 'FBI Uniform Crime Reports',
    },
    {
      id: 'a2', start: 56, end: 130,
      text: 'Our opponent voted against the Public Safety Reform Act, which would have funded 500 new officers',
      verdict: 'misleading',
      evidence: 'The opponent did vote "no" on SB 4100. However, the bill allocated $12M for officer training programs, not 500 new officer positions. The 500 number appears to come from an earlier draft amendment that was removed before the final vote.',
      sourceUrl: 'https://example.com/fl-legis/sb4100',
      sourceLabel: 'Florida Legislature — SB 4100 Record',
    },
    {
      id: 'a3', start: 132,
      text: 'Florida has the highest crime rate in the nation',
      end: 180,
      verdict: 'false',
      evidence: 'According to 2024 FBI data, Florida ranks 22nd in violent crime rate nationally. The states with the highest rates are New Mexico, Alaska, and Tennessee.',
      sourceUrl: 'https://example.com/fbi-state-comparison',
      sourceLabel: 'FBI State Crime Comparison 2024',
    },
  ],
  overallVerdict: 'false',
  confidence: 88,
  createdAt: new Date(Date.now() - 3600000).toISOString(),
};

// ─── Page ──────────────────────────────────────────────────────────────────

export function LensThisPage() {
  const { user } = useAuth();
  const [inputUrl, setInputUrl] = useState('');
  const [inputText, setInputText] = useState('');
  const [platform, setPlatform] = useState<FactCheckPlatform | ''>('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScannedClaim | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [factChecks, setFactChecks] = useState<FactCheck[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(true);
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'scan' | 'community'>('scan');

  useEffect(() => {
    loadChecks();
  }, []);

  async function loadChecks() {
    const checks = await getFactChecks(50);
    setFactChecks(checks);
    setLoadingChecks(false);
  }

  const handleScan = useCallback(async () => {
    const content = inputUrl.trim() || inputText.trim();
    if (!content) return;

    setScanning(true);
    setHasScanned(false);

    // Simulate scanning + analysis (in production, this calls an edge function)
    await new Promise((r) => setTimeout(r, 2200));

    const sourceType = platform || detectPlatformFromUrl(inputUrl);
    const sourceLabel = getPlatformLabel(sourceType);

    const result: ScannedClaim = {
      ...DEMO_SCAN,
      id: `scan-${Date.now()}`,
      originalText: inputText.trim() || DEMO_SCAN.originalText,
      sourceUrl: inputUrl.trim() || DEMO_SCAN.sourceUrl,
      sourceType,
      sourceLabel,
      previewTitle: inputUrl.trim() ? extractDomain(inputUrl) : 'Pasted Text',
      previewDesc: inputText.trim()
        ? `User-submitted text for analysis: "${inputText.trim().slice(0, 120)}..."`
        : 'Content fetched from the provided URL for fact-checking analysis.',
      createdAt: new Date().toISOString(),
    };

    setScanResult(result);
    setScanning(false);
    setHasScanned(true);

    // Also submit to the fact-check queue if user is signed in
    if (user && inputText.trim()) {
      try {
        await submitFactCheck(inputText.trim(), inputUrl.trim() || undefined, platform || undefined);
        await loadChecks();
      } catch {
        // submission is best-effort
      }
    }
  }, [inputUrl, inputText, platform, user]);

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.startsWith('http')) {
        setInputUrl(text);
      } else {
        setInputText(text);
      }
    } catch {
      // clipboard not available
    }
  }

  function handleReset() {
    setScanResult(null);
    setHasScanned(false);
    setInputUrl('');
    setInputText('');
    setPlatform('');
  }

  const publishedChecks = factChecks.filter((c) => c.status === 'published');
  const filteredChecks = filter === 'all'
    ? publishedChecks
    : publishedChecks.filter((c) => c.assessment === filter);

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/8 via-accent/5 to-transparent p-8 mb-8">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-accent/8 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20">
              <Search className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                Put It Through the Lens
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Scan any claim, article, or post — we break down what's fact and what's fiction.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-secondary/60 p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveTab('scan')}
          className={cn(
            'rounded-xl px-5 py-2 text-sm font-bold transition-all',
            activeTab === 'scan'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Zap className="h-4 w-4 inline mr-1.5" />
          Scanner
        </button>
        <button
          onClick={() => setActiveTab('community')}
          className={cn(
            'rounded-xl px-5 py-2 text-sm font-bold transition-all',
            activeTab === 'community'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <BookOpen className="h-4 w-4 inline mr-1.5" />
          Community Checks
        </button>
      </div>

      {activeTab === 'scan' ? (
        <ScannerTab
          inputUrl={inputUrl}
          setInputUrl={setInputUrl}
          inputText={inputText}
          setInputText={setInputText}
          platform={platform}
          setPlatform={setPlatform}
          scanning={scanning}
          hasScanned={hasScanned}
          scanResult={scanResult}
          onScan={handleScan}
          onPaste={handlePasteFromClipboard}
          onReset={handleReset}
          user={user}
        />
      ) : (
        <CommunityTab
          checks={filteredChecks}
          loading={loadingChecks}
          filter={filter}
          setFilter={setFilter}
          publishedCount={publishedChecks.length}
        />
      )}
    </div>
  );
}

// ─── Scanner Tab ───────────────────────────────────────────────────────────

function ScannerTab({
  inputUrl, setInputUrl, inputText, setInputText,
  platform, setPlatform, scanning, hasScanned, scanResult,
  onScan, onPaste, onReset, user,
}: {
  inputUrl: string;
  setInputUrl: (v: string) => void;
  inputText: string;
  setInputText: (v: string) => void;
  platform: FactCheckPlatform | '';
  setPlatform: (v: FactCheckPlatform | '') => void;
  scanning: boolean;
  hasScanned: boolean;
  scanResult: ScannedClaim | null;
  onScan: () => void;
  onPaste: () => void;
  onReset: () => void;
  user: ReturnType<typeof useAuth>['user'];
}) {
  if (scanning) return <ScanningState />;
  if (hasScanned && scanResult) {
    return <ScanResult result={scanResult} onReset={onReset} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Input area */}
      <div className="space-y-4">
        <Card className="p-6 rounded-3xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What do you want to fact-check?
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onPaste}
              className="text-xs gap-1.5 rounded-xl"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste
            </Button>
          </div>

          {/* URL input — prominent */}
          <div className="mb-4">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
              Link to Article, Post, or Video
            </label>
            <div className="relative group">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://tiktok.com/... or https://news.com/article..."
                className="w-full rounded-2xl border border-border bg-card pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 ml-1">
              Paste a link from any platform — we'll fetch and preview the content.
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">or paste text</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {/* Text input */}
          <div className="mb-4">
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder='"The candidate said crime is up 40% and our schools are failing..."'
              className="rounded-2xl resize-none text-sm"
              rows={4}
            />
          </div>

          {/* Platform selector */}
          <div className="mb-5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
              Where did you see it?
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(platform === p.value ? '' : p.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all touch-target',
                      platform === p.value
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={onScan}
            disabled={!inputUrl.trim() && !inputText.trim()}
            className="w-full rounded-2xl gap-2 font-bold text-base"
            size="lg"
          >
            <Search className="h-5 w-5" />
            Scan & Fact-Check
          </Button>
        </Card>

        {/* How it works */}
        <Card className="p-6 rounded-3xl bg-gradient-to-br from-primary/3 to-transparent">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            How the Scanner Works
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Link2, step: '1', title: 'Paste a Link', desc: 'Blog, article, social post, podcast, or video URL' },
              { icon: Zap, step: '2', title: 'We Scan It', desc: 'Our system fetches the content and analyzes every claim' },
              { icon: BookOpen, step: '3', title: 'See the Breakdown', desc: 'Claims are underlined — hover to see fact-checks' },
              { icon: ShieldCheck, step: '4', title: 'Get the Verdict', desc: 'True, Misleading, False, or Needs Context with evidence' },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-3 rounded-2xl bg-card/60 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Sidebar — preview of what scanning looks like */}
      <div className="space-y-4">
        <Card className="p-5 rounded-3xl overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10">
              <Quote className="h-4 w-4 text-accent" />
            </div>
            <h3 className="font-bold text-sm">Preview: Annotated Claims</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            When you scan content, each claim gets underlined with a color-coded verdict. Hover or tap to see the evidence.
          </p>

          {/* Mini demo of annotated text */}
          <div className="rounded-2xl bg-card/80 p-4 text-xs leading-relaxed">
            <p>
              <span className="underline decoration-wavy decoration-destructive/60 underline-offset-4 cursor-pointer">
                Crime increased 40%
              </span>
              {' '}
              since 2022. The opponent voted against
              {' '}
              <span className="underline decoration-wavy decoration-warning/60 underline-offset-4 cursor-pointer">
                funding 500 new officers
              </span>
              .
            </p>
          </div>

          {/* Legend */}
          <div className="mt-4 space-y-1.5">
            {(['true', 'misleading', 'false', 'needs_context'] as Verdict[]).map((v) => {
              const s = ASSESSMENT_STYLES[v];
              const Icon = s.icon;
              return (
                <div key={v} className="flex items-center gap-2 text-[11px]">
                  <Icon className={cn('h-3.5 w-3.5', s.color)} />
                  <span className="font-bold text-muted-foreground">{s.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {!user && (
          <Card className="p-5 rounded-3xl bg-gradient-to-br from-accent/5 to-transparent border-accent/20">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Sign in</strong> to submit claims to the community fact-check queue and track your submissions.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Scanning State ────────────────────────────────────────────────────────

function ScanningState() {
  const steps = [
    { icon: Link2, label: 'Fetching content from source...', delay: 0 },
    { icon: Search, label: 'Extracting claims from text...', delay: 600 },
    { icon: BookOpen, label: 'Cross-referencing with verified data...', delay: 1200 },
    { icon: ShieldCheck, label: 'Generating verdicts and evidence...', delay: 1800 },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="relative mb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20">
          <Search className="h-10 w-10 text-primary animate-pulse" />
        </div>
        <div className="absolute -inset-3 rounded-3xl border-2 border-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
      </div>

      <h2 className="font-display text-xl font-bold mb-2">Scanning Content</h2>
      <p className="text-sm text-muted-foreground mb-8">Analyzing claims and cross-referencing sources...</p>

      <div className="w-full max-w-md space-y-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-3 animate-slide-up"
            style={{ animationDelay: `${step.delay}ms`, animationFillMode: 'backwards' }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <step.icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">{step.label}</span>
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Scan Result (Annotated Text) ──────────────────────────────────────────

function ScanResult({ result, onReset }: { result: ScannedClaim; onReset: () => void }) {
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null);
  const verdictStyle = ASSESSMENT_STYLES[result.overallVerdict];
  const VerdictIcon = verdictStyle.icon;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Overall verdict banner */}
      <Card className={cn('p-6 rounded-3xl border-2', verdictStyle.bg, verdictStyle.border)}>
        <div className="flex items-start gap-4">
          <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', verdictStyle.bg)}>
            <VerdictIcon className={cn('h-7 w-7', verdictStyle.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-xl font-bold">
                Verdict: {verdictStyle.label}
              </h2>
              <Badge variant="secondary" className="rounded-lg text-[10px] font-bold">
                {result.confidence}% confidence
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We found {result.annotations.length} claim{result.annotations.length === 1 ? '' : 's'} in this content.
              {' '}
              {result.annotations.filter((a) => a.verdict === 'false').length} were false,
              {' '}
              {result.annotations.filter((a) => a.verdict === 'misleading').length} were misleading.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="rounded-xl gap-1.5 shrink-0"
          >
            <Search className="h-3.5 w-3.5" />
            New Scan
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Source preview + annotated text */}
        <div className="space-y-4">
          {/* Source preview card */}
          <Card className="p-5 rounded-3xl overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary">
                <Link2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{result.previewTitle}</p>
                <p className="text-[11px] text-muted-foreground">
                  {result.sourceLabel} • {timeAgo(result.createdAt)}
                </p>
              </div>
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
              >
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {result.previewDesc}
            </p>
          </Card>

          {/* Annotated text — Rap Genius style */}
          <Card className="p-6 rounded-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Quote className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-sm">Claim Breakdown</h3>
              <span className="text-[10px] text-muted-foreground ml-auto">
                Tap underlined text for evidence
              </span>
            </div>

            <AnnotatedText
              text={result.originalText}
              annotations={result.annotations}
              activeId={activeAnnotation?.id}
              onSelect={(ann) => setActiveAnnotation(ann)}
            />
          </Card>

          {/* Annotation list */}
          <Card className="p-5 rounded-3xl">
            <h3 className="font-bold text-sm mb-3">All Claims ({result.annotations.length})</h3>
            <div className="space-y-2">
              {result.annotations.map((ann) => {
                const s = ASSESSMENT_STYLES[ann.verdict];
                const Icon = s.icon;
                return (
                  <button
                    key={ann.id}
                    onClick={() => setActiveAnnotation(ann)}
                    className={cn(
                      'w-full text-left rounded-2xl p-3 border transition-all hover:shadow-sm',
                      activeAnnotation?.id === ann.id ? s.bg : 'bg-card/50 border-border/40',
                      s.border
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={cn('h-3.5 w-3.5', s.color)} />
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider', s.color)}>
                        {s.label}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
                      "{ann.text}"
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Evidence panel — sticky */}
        <div className="lg:sticky lg:top-6 h-fit">
          {activeAnnotation ? (
            <EvidencePanel annotation={activeAnnotation} />
          ) : (
            <Card className="p-6 rounded-3xl text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-bold mb-1">Evidence Panel</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tap or hover on any underlined claim to see the full fact-check with evidence and sources.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Annotated Text Component ──────────────────────────────────────────────

function AnnotatedText({
  text, annotations, activeId, onSelect,
}: {
  text: string;
  annotations: Annotation[];
  activeId?: string;
  onSelect: (ann: Annotation) => void;
}) {
  // Sort annotations by start position
  const sorted = [...annotations].sort((a, b) => a.start - b.start);

  // Build segments: alternating unannotated and annotated
  const segments: { text: string; annotation?: Annotation }[] = [];
  let pos = 0;
  for (const ann of sorted) {
    if (ann.start > pos) {
      segments.push({ text: text.slice(pos, ann.start) });
    }
    segments.push({ text: text.slice(ann.start, ann.end), annotation: ann });
    pos = ann.end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos) });
  }

  return (
    <div className="text-base leading-loose text-foreground">
      {segments.map((seg, i) => {
        if (!seg.annotation) {
          return <span key={i}>{seg.text}</span>;
        }
        const s = ASSESSMENT_STYLES[seg.annotation.verdict];
        const isActive = activeId === seg.annotation.id;
        return (
          <span
            key={i}
            onClick={() => onSelect(seg.annotation!)}
            onMouseEnter={() => onSelect(seg.annotation!)}
            className={cn(
              'cursor-pointer rounded px-0.5 underline underline-offset-4 transition-all',
              s.underline,
              s.color,
              isActive && cn(s.bg, 'px-1 rounded-md no-underline font-medium'),
            )}
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}

// ─── Evidence Panel ────────────────────────────────────────────────────────

function EvidencePanel({ annotation }: { annotation: Annotation }) {
  const s = ASSESSMENT_STYLES[annotation.verdict];
  const Icon = s.icon;

  return (
    <Card className={cn('p-6 rounded-3xl border-2 animate-scale-in', s.bg, s.border)}>
      <div className="flex items-center gap-2 mb-4">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', s.bg)}>
          <Icon className={cn('h-5 w-5', s.color)} />
        </div>
        <div>
          <span className={cn('text-xs font-bold uppercase tracking-wider', s.color)}>
            {s.label}
          </span>
          <p className="text-[10px] text-muted-foreground">Evidence-based assessment</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
          The Claim
        </p>
        <p className="text-sm font-semibold text-foreground leading-snug italic">
          "{annotation.text}"
        </p>
      </div>

      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
          The Evidence
        </p>
        <p className="text-sm text-foreground/90 leading-relaxed">
          {annotation.evidence}
        </p>
      </div>

      {annotation.sourceUrl && (
        <a
          href={annotation.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-2xl bg-card/80 p-3 hover:bg-card transition-colors group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <ExternalLink className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">
              {annotation.sourceLabel ?? 'View Source'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">{annotation.sourceUrl}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </a>
      )}
    </Card>
  );
}

// ─── Community Tab ─────────────────────────────────────────────────────────

function CommunityTab({
  checks, loading, filter, setFilter, publishedCount,
}: {
  checks: FactCheck[];
  loading: boolean;
  filter: Verdict | 'all';
  setFilter: (v: Verdict | 'all') => void;
  publishedCount: number;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Community Fact Checks
          </h3>
          <Badge variant="secondary" className="rounded-lg">{publishedCount}</Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
              filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            )}
          >
            All
          </button>
          {(Object.keys(ASSESSMENT_STYLES) as Verdict[]).map((key) => {
            const s = ASSESSMENT_STYLES[key];
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
                  filter === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                )}
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 rounded-2xl animate-pulse">
                <div className="h-4 w-20 rounded bg-secondary mb-2" />
                <div className="h-3 w-full rounded bg-secondary mb-1" />
                <div className="h-3 w-3/4 rounded bg-secondary" />
              </Card>
            ))}
          </div>
        ) : checks.length === 0 ? (
          <Card className="p-10 rounded-3xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
              <HelpCircle className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              No fact checks published yet. Use the scanner to submit claims!
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {checks.map((check) => (
              <CommunityFactCheckCard key={check.id} check={check} />
            ))}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <Card className="p-5 rounded-3xl">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Stats
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card/60 p-3">
              <p className="text-2xl font-bold text-foreground">{publishedCount}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase">Published</p>
            </div>
            <div className="rounded-2xl bg-card/60 p-3">
              <p className="text-2xl font-bold text-foreground">
                {checks.filter((c) => c.assessment === 'false').length}
              </p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase">False Claims</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CommunityFactCheckCard({ check }: { check: FactCheck }) {
  const style = ASSESSMENT_STYLES[check.assessment as Verdict] ?? ASSESSMENT_STYLES.unverified;
  const Icon = style.icon;

  return (
    <Card className={cn('p-4 rounded-2xl border', style.bg, style.border)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', style.bg, style.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={cn('text-xs font-bold uppercase tracking-wider', style.color)}>
          {style.label}
        </span>
        {check.source_platform && (
          <Badge variant="outline" className="rounded-lg text-[10px] ml-auto capitalize">
            {check.source_platform}
          </Badge>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground mb-2 leading-snug">
        "{check.claim_text}"
      </p>
      {check.explanation && (
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">{check.explanation}</p>
      )}
      {check.evidence_text && (
        <div className="rounded-xl bg-card/50 p-2.5 text-xs text-foreground/80 mb-2">
          <p className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Evidence</p>
          {check.evidence_text}
        </div>
      )}
      {check.evidence_url && (
        <a
          href={check.evidence_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          View Source
        </a>
      )}
    </Card>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function detectPlatformFromUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('tiktok')) return 'tiktok';
  if (u.includes('instagram')) return 'instagram';
  if (u.includes('facebook') || u.includes('fb.com')) return 'facebook';
  if (u.includes('twitter') || u.includes('x.com')) return 'x';
  if (u.includes('youtube') || u.includes('youtu.be')) return 'tv';
  if (u.includes('news') || u.includes('article')) return 'news';
  return 'other';
}

function getPlatformLabel(type: string): string {
  const labels: Record<string, string> = {
    tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook',
    x: 'X (Twitter)', tv: 'TV / Video', news: 'News Article', other: 'Web Link',
  };
  return labels[type] ?? 'Web Link';
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return url.slice(0, 40);
  }
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
