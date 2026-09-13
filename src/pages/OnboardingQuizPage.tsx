import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Users, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { QuizCard } from '@/components/shared/QuizCard';
import { fetchQuizQuestions, saveUserQuizAnswers, type QuizQuestion } from '@/services/quiz';
import { supabase } from '@/lib/supabase';

type Phase = 'loading' | 'quiz' | 'saving' | 'done';

export function OnboardingQuizPage() {
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  useEffect(() => {
    // Pick 8 random questions from the pool of 30
    fetchQuizQuestions(8).then((qs) => {
      setQuestions(qs);
      setPhase('quiz');
    });
  }, []);

  async function handleComplete(answers: Record<string, string>) {
    setPhase('saving');

    if (user && !isDemo) {
      const answerList = Object.entries(answers).map(([question_id, answer]) => ({
        question_id,
        answer: answer as 'a' | 'b' | 'c' | 'd',
      }));
      await saveUserQuizAnswers(user.id, answerList, 'onboarding');

      // Mark onboarding as completed
      await supabase
        .from('profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    setPhase('done');
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Preparing your questions...</p>
      </div>
    );
  }

  if (phase === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Saving your answers...</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center animate-scale-in">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">You're all set!</h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Your answers help us find candidates who align with your values.
          You can retake the quiz anytime from your account settings.
        </p>
        <div className="space-y-2.5">
          <Button
            onClick={() => navigate('/candidates')}
            className="w-full rounded-2xl gap-2 font-bold"
            size="lg"
          >
            <Users className="h-4 w-4" />
            Find Your Candidates
          </Button>
          <Button
            onClick={() => navigate('/ballot')}
            variant="outline"
            className="w-full rounded-2xl gap-2"
            size="lg"
          >
            <Sparkles className="h-4 w-4" />
            View My Ballot
          </Button>
        </div>
      </div>
    );
  }

  return (
    <QuizCard
      questions={questions}
      onComplete={handleComplete}
      title="Where Do You Stand?"
      subtitle="Answer a few questions so we can find candidates who share your values."
      accentColor="primary"
      saveLabel="Find My Candidates"
    />
  );
}
