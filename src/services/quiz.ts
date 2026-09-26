import { supabase } from '@/lib/supabase';

export interface QuizQuestion {
  id: string;
  issue_category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  sort_order: number;
}

export interface QuizAnswer {
  question_id: string;
  answer: 'a' | 'b' | 'c' | 'd';
}

/**
 * Fetch a random subset of quiz questions for a quiz session.
 * Picks `count` questions from the pool of 30, shuffled.
 */
export async function fetchQuizQuestions(count: number = 8): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from('civic_quiz_questions')
    .select('id, issue_category, question_text, option_a, option_b, option_c, option_d, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error || !data) return [];

  const shuffled = [...data].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count) as QuizQuestion[];
}

/**
 * Save a batch of user quiz answers. Uses upsert so retaking the quiz
 * updates existing answers rather than creating duplicates.
 */
export async function saveUserQuizAnswers(
  userId: string,
  answers: QuizAnswer[],
  session: string = 'default',
): Promise<{ success: boolean; error?: string }> {
  const rows = answers.map((a) => ({
    user_id: userId,
    question_id: a.question_id,
    answer: a.answer,
    quiz_session: session,
  }));

  const { error } = await supabase
    .from('user_quiz_answers')
    .upsert(rows, { onConflict: 'user_id,question_id' });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Fetch a user's existing quiz answers.
 */
export async function getUserQuizAnswers(userId: string): Promise<QuizAnswer[]> {
  const { data, error } = await supabase
    .from('user_quiz_answers')
    .select('question_id, answer')
    .eq('user_id', userId);

  if (error || !data) return [];
  return data as QuizAnswer[];
}

/**
 * Check if a user has completed the onboarding quiz.
 */
export async function hasUserCompletedQuiz(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_quiz_answers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return false;
  return (count ?? 0) >= 6;
}

/**
 * Save a single candidate quiz answer (upsert).
 */
export async function saveCandidateQuizAnswer(
  candidateId: string,
  questionId: string,
  answer: 'a' | 'b' | 'c' | 'd',
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('candidate_quiz_answers')
    .upsert(
      { candidate_id: candidateId, question_id: questionId, answer },
      { onConflict: 'candidate_id,question_id' },
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Fetch a candidate's quiz answers (all statuses — used by team/admin).
 */
export async function getCandidateQuizAnswers(candidateId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('candidate_quiz_answers')
    .select('question_id, answer, status')
    .eq('candidate_id', candidateId);

  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data) {
    map[row.question_id] = row.answer;
  }
  return map;
}

/**
 * Fetch a candidate's approved quiz answers (public).
 */
export async function getPublicCandidateQuizAnswers(candidateId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('candidate_quiz_answers')
    .select('question_id, answer')
    .eq('candidate_id', candidateId)
    .eq('status', 'approved');

  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data) {
    map[row.question_id] = row.answer;
  }
  return map;
}

/**
 * Fetch all 30 quiz questions (for the candidate quiz page where they answer all).
 */
export async function fetchAllQuizQuestions(): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from('civic_quiz_questions')
    .select('id, issue_category, question_text, option_a, option_b, option_c, option_d, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error || !data) return [];
  return data as QuizQuestion[];
}

export interface QuizMatch {
  candidate_id: string;
  first_name: string;
  last_name: string;
  party: string | null;
  photo_url: string | null;
  match_percent: number;
  questions_compared: number;
}

/**
 * The actual point of the quiz — previously completely missing. Voters and
 * candidates both answer the same civic_quiz_questions pool and both sides
 * were saved, but nothing ever compared them: a voter would finish the quiz
 * and just see generic "explore candidates" buttons, never anything
 * personalized. This compares the voter's saved answers against every
 * candidate who has at least a few approved answers, and returns a ranked
 * match list.
 *
 * Only candidates with at least `minOverlap` questions in common with the
 * voter are included, so a candidate who only answered one question doesn't
 * show up as a false "100% match" on a single coincidental agreement.
 */
export async function getQuizMatches(userId: string, minOverlap = 3): Promise<QuizMatch[]> {
  const userAnswers = await getUserQuizAnswers(userId);
  if (userAnswers.length === 0) return [];
  const userAnswerMap = new Map(userAnswers.map((a) => [a.question_id, a.answer]));

  const { data: candidateAnswers, error } = await supabase
    .from('candidate_quiz_answers')
    .select('candidate_id, question_id, answer, candidates(first_name, last_name, party, photo_url)')
    .eq('status', 'approved')
    .in('question_id', userAnswers.map((a) => a.question_id));
  if (error || !candidateAnswers) return [];

  const byCandidate = new Map<string, { matches: number; total: number; info: { first_name: string; last_name: string; party: string | null; photo_url: string | null } }>();

  for (const row of candidateAnswers as unknown as Array<{
    candidate_id: string; question_id: string; answer: string;
    candidates: { first_name: string; last_name: string; party: string | null; photo_url: string | null } | null;
  }>) {
    const userAnswer = userAnswerMap.get(row.question_id);
    if (!userAnswer || !row.candidates) continue;

    const existing = byCandidate.get(row.candidate_id) ?? { matches: 0, total: 0, info: row.candidates };
    existing.total += 1;
    if (userAnswer === row.answer) existing.matches += 1;
    byCandidate.set(row.candidate_id, existing);
  }

  return Array.from(byCandidate.entries())
    .filter(([, v]) => v.total >= minOverlap)
    .map(([candidateId, v]) => ({
      candidate_id: candidateId,
      first_name: v.info.first_name,
      last_name: v.info.last_name,
      party: v.info.party,
      photo_url: v.info.photo_url,
      match_percent: Math.round((v.matches / v.total) * 100),
      questions_compared: v.total,
    }))
    .sort((a, b) => b.match_percent - a.match_percent);
}
