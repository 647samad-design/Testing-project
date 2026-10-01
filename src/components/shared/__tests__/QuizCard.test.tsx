import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuizCard } from '@/components/shared/QuizCard';
import type { QuizQuestion } from '@/services/quiz';

const questions = [
  { id: 'q1', question_text: 'How should public education be funded?', option_a: 'Raise taxes', option_b: 'Redirect to classrooms', option_c: 'Vouchers', option_d: 'Markets', category: 'education', sort_order: 1 },
  { id: 'q2', question_text: 'Transit?', option_a: 'Expand', option_b: 'Cut', option_c: 'Keep', option_d: 'Unsure', category: 'transit', sort_order: 2 },
] as unknown as QuizQuestion[];

describe('QuizCard initialAnswers', () => {
  it('starts with previously submitted answers (the candidate quiz used to always start blank)', () => {
    render(<QuizCard questions={questions} onComplete={vi.fn()} title="t" subtitle="s" initialAnswers={{ q1: 'b', q2: 'c' }} />);
    expect(screen.getByText(/2 answered/i)).toBeInTheDocument();
  });

  it('starts empty without them', () => {
    render(<QuizCard questions={questions} onComplete={vi.fn()} title="t" subtitle="s" />);
    expect(screen.getByText(/0 answered/i)).toBeInTheDocument();
  });
});
