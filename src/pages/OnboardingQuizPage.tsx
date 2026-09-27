import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Users, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { QuizCard } from '@/components/shared/QuizCard';
import { fetchQuizQuestions, saveUserQuizAnswers, getQuizMatches, type QuizQuestion, type QuizMatch } from '@/services/quiz';
import { supabase } from '@/lib/supabase';

type Phase = 'loading' | 'quiz' | 'saving' | 'done';

export function OnboardingQuizPage() {
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [matches, setMatches] = useState<QuizMatch[]>([]);

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

      // Touch the profile's updated_at as a lightweight signal that this
      // user has been through onboarding at least once. There's no
      // dedicated "onboarding_completed" flag — this page is also reachable
      // any time from the Account page as a "retake the quiz" action, so a
      // hard completion flag isn't needed to gate access to it.
      await supabase
        .from('profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', user.id);

      // This is the actual point of the quiz — previously the answers were
      // saved and then nothing ever used them. Show who the voter actually
      // matches with, not just a generic "explore" button.
      const results = await getQuizMatches(user.id);
      setMatches(results);
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

        {matches.length > 0 && (
          <div className="mb-6 text-left">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
              Your top matches
            </p>
            <div className="space-y-2">
              {matches.slice(0, 3).map((m) => (
                <Card
                  key={m.candidate_id}
                  className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-secondary/40 transition-colors"
                  onClick={() => navigate(`/candidates/${m.candidate_id}`)}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
                    {m.photo_url && <img src={m.photo_url} alt={`${m.first_name} ${m.last_name}`} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{m.first_name} {m.last_name}</p>
                    <p className="text-xs text-muted-foreground">{m.party || 'No party listed'}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary">{m.match_percent}%</span>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          <Button
            onClick={() => navigate('/candidates')}
            className="w-full rounded-2xl gap-2 font-bold"
            size="lg"
          >
            <Users className="h-4 w-4" />
            {matches.length > 0 ? 'See All Candidates' : 'Find Your Candidates'}
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
