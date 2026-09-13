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
