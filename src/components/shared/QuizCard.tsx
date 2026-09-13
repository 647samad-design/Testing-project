import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Sparkles, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuizQuestion } from '@/services/quiz';

interface QuizCardProps {
  questions: QuizQuestion[];
  onComplete: (answers: Record<string, string>) => void;
  title: string;
  subtitle: string;
  accentColor?: 'primary' | 'accent';
  saveLabel?: string;
}

export function QuizCard({
  questions,
  onComplete,
  title,
  subtitle,
  accentColor = 'primary',
  saveLabel = 'Save My Answers',
}: QuizCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const total = questions.length;
  const question = questions[currentIndex];
  const isLast = currentIndex === total - 1;
  const hasAnswered = question ? !!answers[question.id] : false;
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / total) * 100;

  const options: { key: string; label: string | null }[] = [
    { key: 'a', label: question?.option_a ?? null },
    { key: 'b', label: question?.option_b ?? null },
    { key: 'c', label: question?.option_c ?? null },
    { key: 'd', label: question?.option_d ?? null },
  ].filter((o) => o.label !== null);

  function selectAnswer(key: string) {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: key }));
  }

  function goNext() {
    if (isLast) {
      onComplete(answers);
      return;
    }
    setDirection('forward');
    setCurrentIndex((i) => Math.min(i + 1, total - 1));
  }

  function goBack() {
    setDirection('back');
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }

  if (!question) return null;

  const accent = accentColor === 'accent' ? 'accent' : 'primary';
  const accentText = accentColor === 'accent' ? 'text-accent' : 'text-primary';
  const accentBg = accentColor === 'accent' ? 'bg-accent' : 'bg-primary';
  const accentBgLight = accentColor === 'accent' ? 'bg-accent/10' : 'bg-primary/10';

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-6">
        <div className={cn('mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl', accentBgLight)}>
          <Sparkles className={cn('h-7 w-7', accentText)} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-muted-foreground">
            Question {currentIndex + 1} of {total}
          </span>
          <span className="text-xs font-bold text-muted-foreground">
            {answeredCount} answered
          </span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', accentBg)}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <Card
        key={question.id}
        className={cn(
          'p-6 sm:p-8 rounded-3xl mb-6',
          direction === 'forward' ? 'animate-slide-up' : 'animate-fade-in',
        )}
      >
        <div className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider mb-4', accentBgLight, accentText)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', accentBg)} />
          {question.issue_category}
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug mb-6">
          {question.question_text}
        </h2>

        <div className="space-y-2.5">
          {options.map((opt) => {
            const isSelected = answers[question.id] === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => selectAnswer(opt.key)}
                className={cn(
                  'w-full text-left rounded-2xl border-2 p-4 transition-all touch-target group',
                  isSelected
                    ? cn(accentColor === 'accent' ? 'border-accent bg-accent/5' : 'border-primary bg-primary/5')
                    : 'border-border bg-card hover:border-primary/30 hover:bg-secondary/40',
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                      isSelected
                        ? cn(accentBg, 'text-white')
                        : 'bg-secondary text-muted-foreground group-hover:bg-primary/10',
                    )}
                  >
                    {isSelected ? <Check className="h-4 w-4" /> : opt.key.toUpperCase()}
                  </div>
                  <span className={cn(
                    'text-sm leading-snug',
                    isSelected ? 'font-semibold text-foreground' : 'text-foreground/80',
                  )}>
                    {opt.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentIndex === 0}
          className="rounded-2xl gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        <Button
          onClick={goNext}
          disabled={!hasAnswered}
          className={cn('rounded-2xl gap-1.5 font-bold', !hasAnswered && 'opacity-50')}
        >
          {isLast ? (
            <>
              {saveLabel}
              <ArrowRight className="h-4 w-4" />
            </>
          ) : (
            <>
              Next
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      {/* Skip link */}
      <div className="text-center mt-4">
        <button
          onClick={() => onComplete(answers)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          Skip remaining questions
        </button>
      </div>
    </div>
  );
}
