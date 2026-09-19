import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { QuizCard } from '@/components/shared/QuizCard';
import {
  fetchAllQuizQuestions,
  getCandidateQuizAnswers,
  saveCandidateQuizAnswer,
  type QuizQuestion,
} from '@/services/quiz';
import { supabase } from '@/lib/supabase';

type Phase = 'loading' | 'quiz' | 'saving' | 'done';

export function CandidateQuizPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      if (!user) {
        setError('Please sign in to access the candidate quiz.');
        setPhase('quiz');
        return;
      }

      // Clear any earlier "please sign in" error from a previous run of this
      // effect where `user` was still null (e.g. on first mount, before the
      // session finishes restoring) — without this, that message would
      // never go away even once the real, signed-in user loads a moment
      // later and a valid claim is found.
      setError(null);

      // Find the candidate this user has a verified claim for
      const { data: claim } = await supabase
        .from('candidate_claims')
        .select('candidate_id')
        .eq('user_id', user.id)
        .eq('status', 'verified')
        .maybeSingle();

      let cId = claim?.candidate_id ?? null;

      if (!cId) {
        // Check campaign_team membership
        const { data: team } = await supabase
          .from('campaign_team')
          .select('candidate_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        cId = team?.candidate_id ?? null;
      }

      if (!cId) {
        setError('You need a verified candidate claim or active team membership to answer quiz questions.');
        setPhase('quiz');
        return;
      }

      setCandidateId(cId);

      const [allQuestions, existingAnswers] = await Promise.all([
        fetchAllQuizQuestions(),
        getCandidateQuizAnswers(cId),
      ]);

      // Pre-fill answers so candidates can see/edit their existing responses
      const questionsWithAnswers = allQuestions;
      setQuestions(questionsWithAnswers);

      // Store existing answers in localStorage so QuizCard can pre-fill
      if (Object.keys(existingAnswers).length > 0) {
        localStorage.setItem('candidate_quiz_existing', JSON.stringify(existingAnswers));
      }

      setPhase('quiz');
    }
    init();
  }, [user]);

  async function handleComplete(answers: Record<string, string>) {
    if (!candidateId || !user) {
      navigate('/candidate-portal');
      return;
    }

    setPhase('saving');
    let savedCount = 0;

    for (const [questionId, answer] of Object.entries(answers)) {
      const result = await saveCandidateQuizAnswer(
        candidateId,
        questionId,
        answer as 'a' | 'b' | 'c' | 'd',
      );
      if (result.success) savedCount++;
    }

    setPhase('done');
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-accent animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading quiz questions...</p>
      </div>
    );
  }

  if (phase === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <Loader2 className="h-8 w-8 text-accent animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Saving your positions...</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center animate-scale-in">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">Positions Saved!</h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Your answers have been submitted for review. Once approved by our team,
          voters will be able to see where you stand on the issues and find alignment with your campaign.
        </p>
        <Button
          onClick={() => navigate('/candidate-portal')}
          className="w-full rounded-2xl gap-2 font-bold"
          size="lg"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Portal
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Card className="p-8 rounded-3xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10">
            <AlertCircle className="h-6 w-6 text-warning" />
          </div>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => navigate('/candidate-portal')} variant="outline" className="rounded-2xl">
            Back to Portal
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <QuizCard
      questions={questions}
      onComplete={handleComplete}
      title="Where Do You Stand?"
      subtitle="Answer these questions so voters can find candidates who share their values. All answers are reviewed before going live."
      accentColor="accent"
      saveLabel="Submit for Review"
    />
  );
}
