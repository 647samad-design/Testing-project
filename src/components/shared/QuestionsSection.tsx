import { useEffect, useState } from 'react';
import { MessageCircle, ThumbsUp, ThumbsDown, BadgeCheck, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { getVoterQuestions, askQuestion, answerQuestion, rateQuestion } from '@/services/social';
import { getIssues } from '@/services/districts';
import { cn } from '@/lib/utils';
import type { VoterQuestion, Issue, RatingType } from '@/types';

export function QuestionsSection({ candidateId, canAnswer }: { candidateId: string; canAnswer: boolean }) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<VoterQuestion[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<string>('none');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const [qs, is] = await Promise.all([
        getVoterQuestions(candidateId),
        getIssues(),
      ]);
      setQuestions(qs);
      setIssues(is);
      setLoading(false);
    }
    load();
  }, [candidateId]);

  async function handleAsk() {
    if (!newQuestion.trim() || !user) return;
    setSubmitting(true);
    try {
      await askQuestion(candidateId, newQuestion.trim(), selectedIssue !== 'none' ? selectedIssue : undefined);
      setNewQuestion('');
      setSelectedIssue('none');
      const qs = await getVoterQuestions(candidateId);
      setQuestions(qs);
    } catch {
      // ignore
    }
    setSubmitting(false);
  }

  async function handleAnswer(qId: string) {
    const answer = prompt('Type your answer:');
    if (!answer?.trim()) return;
    try {
      await answerQuestion(qId, answer.trim());
      const qs = await getVoterQuestions(candidateId);
      setQuestions(qs);
    } catch {
      // ignore
    }
  }

  async function handleRate(qId: string, type: RatingType, value: boolean) {
    await rateQuestion(qId, type, value);
    const qs = await getVoterQuestions(candidateId);
    setQuestions(qs);
  }

  function toggleExpand(qId: string) {
    setExpandedAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  }

  const openQuestions = questions.filter((q) => q.status === 'open');
  const answeredQuestions = questions.filter((q) => q.status === 'answered');

  // Group answered questions by issue
  const byIssue: Record<string, VoterQuestion[]> = {};
  answeredQuestions.forEach((q) => {
    const key = q.issue?.name ?? 'General';
    if (!byIssue[key]) byIssue[key] = [];
    byIssue[key].push(q);
  });

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading questions…</div>;

  return (
    <div className="space-y-6">
      {/* Ask a question */}
      {user && (
        <Card className="p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h3 className="font-bold">Ask a Question</h3>
          </div>
          <Textarea
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Ask about housing, public safety, education, taxes…"
            className="rounded-xl mb-3 resize-none"
            rows={3}
          />
          <div className="flex items-center justify-between gap-3">
            <Select value={selectedIssue} onValueChange={setSelectedIssue}>
              <SelectTrigger className="w-[200px] rounded-xl">
                <SelectValue placeholder="Select a topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific topic</SelectItem>
                {issues.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAsk}
              disabled={!newQuestion.trim() || submitting}
              size="sm"
              className="rounded-xl gap-2"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Sending…' : 'Submit'}
            </Button>
          </div>
        </Card>
      )}

      {/* Open questions */}
      {openQuestions.length > 0 && (
        <div>
          <h3 className="font-bold mb-3 flex items-center gap-2">
            Open Questions
            <Badge variant="secondary" className="rounded-lg">{openQuestions.length}</Badge>
          </h3>
          <div className="space-y-3">
            {openQuestions.map((q) => (
              <Card key={q.id} className="p-4 rounded-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{q.question_text}</p>
                    {q.issue && (
                      <Badge variant="outline" className="mt-1.5 rounded-lg text-xs">{q.issue.name}</Badge>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {timeAgo(q.created_at)}
                    </p>
                  </div>
                  {canAnswer && (
                    <Button size="sm" variant="outline" className="rounded-xl shrink-0" onClick={() => handleAnswer(q.id)}>
                      Answer
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Answered questions — grouped by topic (AMA knowledge base) */}
      {Object.keys(byIssue).length > 0 && (
        <div>
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-success" />
            Answered Questions
          </h3>
          <div className="space-y-4">
            {Object.entries(byIssue).map(([issueName, qs]) => (
              <Card key={issueName} className="p-4 rounded-2xl">
                <button
                  onClick={() => toggleExpand(issueName)}
                  className="flex items-center justify-between w-full mb-2"
                >
                  <span className="font-bold text-sm flex items-center gap-2">
                    {issueName}
                    <Badge variant="secondary" className="rounded-lg">{qs.length}</Badge>
                  </span>
                  {expandedAnswers.has(issueName) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {expandedAnswers.has(issueName) && (
                  <div className="space-y-3 mt-2">
                    {qs.map((q) => (
                      <div key={q.id} className="rounded-xl bg-secondary/30 p-3">
                        <p className="text-sm font-semibold text-foreground mb-1.5">Q: {q.question_text}</p>
                        <p className="text-sm text-foreground/80 leading-relaxed">A: {q.answer_text}</p>
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                          <RatingButton
                            label="Useful"
                            count={q.helpful_count}
                            type="helpful"
                            questionId={q.id}
                            onRate={() => handleRate(q.id, 'helpful', true)}
                          />
                          <RatingButton
                            label="Evidence"
                            count={q.evidence_count}
                            type="evidence"
                            questionId={q.id}
                            onRate={() => handleRate(q.id, 'evidence', true)}
                          />
                          <RatingButton
                            label="Responsive"
                            count={q.responsive_count}
                            type="responsive"
                            questionId={q.id}
                            onRate={() => handleRate(q.id, 'responsive', true)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {questions.length === 0 && (
        <div className="text-center py-12">
          <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No questions yet. Be the first to ask!</p>
        </div>
      )}
    </div>
  );
}

function RatingButton({ label, count, type, questionId, onRate }: {
  label: string;
  count: number;
  type: RatingType;
  questionId: string;
  onRate: () => void;
}) {
  return (
    <button
      onClick={onRate}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors touch-target"
    >
      <ThumbsUp className="h-3 w-3" />
      {label} ({count})
    </button>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
