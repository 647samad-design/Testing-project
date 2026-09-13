/*
# Civic Quiz System: Questions, User Answers, Candidate Answers

## Purpose
Create a quiz system with a pool of 30 rotating questions about political issues.
Users answer 6-12 questions during onboarding to find aligned candidates.
Candidates answer the same questions to establish their positions.

## New Tables
- civic_quiz_questions: 30 questions, 10 categories, 2-4 options each
- user_quiz_answers: owner-scoped user responses (upsert by question)
- candidate_quiz_answers: team-submitted, admin-approved candidate responses

## Security
- Questions: public read, admin write
- User answers: owner-only CRUD
- Candidate answers: public read (approved), team submit, admin approve
*/

CREATE TABLE IF NOT EXISTS civic_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_category text NOT NULL,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text,
  option_d text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE civic_quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_quiz_questions" ON civic_quiz_questions;
CREATE POLICY "public_read_quiz_questions" ON civic_quiz_questions FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_quiz_questions" ON civic_quiz_questions;
CREATE POLICY "admin_write_quiz_questions" ON civic_quiz_questions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_quiz_questions" ON civic_quiz_questions;
CREATE POLICY "admin_update_quiz_questions" ON civic_quiz_questions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS user_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES civic_quiz_questions(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('a', 'b', 'c', 'd')),
  quiz_session text NOT NULL DEFAULT 'default',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE user_quiz_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "select_own_quiz_answers" ON user_quiz_answers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "insert_own_quiz_answers" ON user_quiz_answers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "update_own_quiz_answers" ON user_quiz_answers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_quiz_answers" ON user_quiz_answers;
CREATE POLICY "delete_own_quiz_answers" ON user_quiz_answers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS candidate_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES civic_quiz_questions(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('a', 'b', 'c', 'd')),
  submitted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, question_id)
);

ALTER TABLE candidate_quiz_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_approved_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "public_read_approved_candidate_answers" ON candidate_quiz_answers FOR SELECT
  TO anon, authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "team_read_own_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "team_read_own_candidate_answers" ON candidate_quiz_answers FOR SELECT
  TO authenticated USING (
    submitted_by = auth.uid() OR is_admin() OR
    EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_quiz_answers.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified') OR
    EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_quiz_answers.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  );

DROP POLICY IF EXISTS "team_upsert_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "team_upsert_candidate_answers" ON candidate_quiz_answers FOR INSERT
  TO authenticated WITH CHECK (
    submitted_by = auth.uid() AND
    (EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = candidate_quiz_answers.candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified') OR
     EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = candidate_quiz_answers.candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active'))
  );

DROP POLICY IF EXISTS "team_update_candidate_answers" ON candidate_quiz_answers;
CREATE POLICY "team_update_candidate_answers" ON candidate_quiz_answers FOR UPDATE
  TO authenticated USING (submitted_by = auth.uid() OR is_admin())
  WITH CHECK (submitted_by = auth.uid() OR is_admin());

-- Seed 30 questions
INSERT INTO civic_quiz_questions (issue_category, question_text, option_a, option_b, option_c, option_d, sort_order) VALUES
('Education', 'How should public education be funded?', 'Increase funding through higher state taxes', 'Keep funding levels the same but redirect to classrooms', 'Expand school choice and voucher programs', 'Privatize education and let markets decide', 1),
('Education', 'What is the best approach to student loan debt?', 'Cancel all student loan debt', 'Expand income-based repayment plans', 'Keep the current system as-is', 'Eliminate federal student loans entirely', 2),
('Education', 'Should teachers be evaluated based on student test scores?', 'No, test scores dont reflect teaching quality', 'Partially, combined with peer reviews', 'Yes, test scores are the best metric', 'Eliminate standardized testing entirely', 3),
('Healthcare', 'What is the best path forward for healthcare?', 'Universal single-payer (Medicare for All)', 'Public option alongside private insurance', 'Keep the current system with minor reforms', 'Fully privatize healthcare and remove mandates', 4),
('Healthcare', 'Should the government negotiate prescription drug prices?', 'Yes, for all drugs purchased by government programs', 'Yes, but only for seniors on Medicare', 'No, let the free market set prices', 'Only negotiate for the most expensive drugs', 5),
('Healthcare', 'How should mental health services be expanded?', 'Make mental health care part of universal coverage', 'Increase funding for community mental health centers', 'Expand telehealth and private options', 'Reduce regulations to let private practice expand', 6),
('Economy', 'How should we approach taxes on corporations?', 'Raise corporate taxes to fund public services', 'Close loopholes but keep current rates', 'Lower corporate taxes to spur investment', 'Eliminate corporate taxes and tax shareholders instead', 7),
('Economy', 'What should the federal minimum wage be?', 'Raise it to $15+ per hour and index to inflation', 'Raise it modestly to $12 per hour', 'Keep it at the current level', 'Eliminate the minimum wage, let states decide', 8),
('Economy', 'How should the government handle economic recessions?', 'Large-scale stimulus spending and safety net expansion', 'Targeted relief for affected industries', 'Let the market correct itself with minimal intervention', 'Cut taxes and reduce regulations to stimulate growth', 9),
('Housing', 'What is the best approach to affordable housing?', 'Massive public investment in affordable housing', 'Tax incentives for private developers to build affordable units', 'Reduce zoning regulations to increase supply', 'No government intervention, let the market work', 10),
('Housing', 'Should rent control be expanded?', 'Yes, expand rent control to protect tenants', 'Only in emergencies or high-cost cities', 'No, rent control reduces housing supply', 'Let cities decide locally', 11),
('Housing', 'How should homelessness be addressed?', 'Housing-first programs with wraparound services', 'Increase shelter capacity and outreach', 'Focus on mental health and addiction treatment first', 'Enforce camping bans and move people to shelters', 12),
('Public Safety', 'How should policing be reformed?', 'Redirect funding to community services and alternatives', 'Increase training and accountability but keep funding', 'Increase police funding and hire more officers', 'No changes needed to current policing', 13),
('Public Safety', 'What is the best approach to gun policy?', 'Universal background checks and assault weapon bans', 'Expand background checks but protect gun rights', 'Protect Second Amendment rights, no new restrictions', 'Constitutional carry — remove all permit requirements', 14),
('Public Safety', 'How should the criminal justice system handle nonviolent drug offenses?', 'Decriminalize and treat as a public health issue', 'Reduce sentences and expand diversion programs', 'Keep current laws but improve rehabilitation', 'Maintain strict enforcement and sentencing', 15),
('Immigration', 'What should US immigration policy prioritize?', 'Comprehensive reform with a path to citizenship', 'Border security first, then address legal immigration', 'Merit-based system prioritizing skilled workers', 'Strict enforcement and reduced immigration levels', 16),
('Immigration', 'How should the government handle undocumented immigrants already in the US?', 'Provide a path to citizenship', 'Allow legal status but not citizenship', 'Deport those with criminal records, allow others to stay', 'Enforce existing deportation laws', 17),
('Immigration', 'Should asylum processing be made easier or harder?', 'Easier — the US should welcome more asylum seekers', 'Keep the current process but improve efficiency', 'Harder — tighten standards to reduce claims', 'Suspend asylum during high border crossings', 18),
('Environment', 'How aggressively should the US combat climate change?', 'Aggressive transition to renewable energy by 2035', 'Gradual transition with nuclear and natural gas as bridges', 'Balance environmental goals with economic growth', 'Reduce regulations and let markets drive energy choices', 19),
('Environment', 'Should the US rejoin and strengthen international climate agreements?', 'Yes, lead the world in climate commitments', 'Yes, but only if other major polluters also commit', 'No, international agreements hurt US competitiveness', 'Withdraw from all climate treaties', 20),
('Environment', 'How should clean water and air regulations be handled?', 'Strengthen EPA enforcement and regulations', 'Keep current regulations but improve enforcement', 'Roll back regulations that hurt businesses', 'Let states set their own environmental standards', 21),
('Transportation', 'How should the US invest in transportation infrastructure?', 'Massive investment in public transit and rail', 'Balance highway maintenance with transit expansion', 'Prioritize highways and roads over transit', 'Privatize infrastructure and use tolls', 22),
('Transportation', 'Should electric vehicle adoption be subsidized?', 'Yes, large subsidies and a mandate to phase out gas cars', 'Yes, modest tax credits for EV purchases', 'No subsidies, let the market decide', 'Remove EV mandates and support all energy types', 23),
('Transportation', 'How should we fund infrastructure repairs?', 'Increase the gas tax and create new user fees', 'Issue infrastructure bonds', 'Public-private partnerships', 'Cut other spending to fund infrastructure', 24),
('Labor', 'How should labor unions be supported or regulated?', 'Strengthen union rights and expand card check', 'Protect union rights but keep current election process', 'Limit union power and expand right-to-work laws', 'Unions should have no special legal protections', 25),
('Labor', 'Should gig workers be classified as employees?', 'Yes, all gig workers should be employees with benefits', 'Create a third classification with some benefits', 'No, keep gig workers as independent contractors', 'Let companies and workers negotiate individually', 26),
('Labor', 'What should paid family leave policy look like?', 'Mandatory paid leave funded by the government', 'Tax credits for companies that offer paid leave', 'Let companies decide their own leave policies', 'No government role in family leave', 27),
('Government', 'Should term limits be imposed on Congress?', 'Yes, strict term limits for all members', 'Yes, but only for committee chairs and leadership', 'No, let voters decide through elections', 'Only for the Senate, not the House', 28),
('Government', 'How should voting access be balanced with election security?', 'Expand mail-in voting and automatic registration', 'Maintain current rules with modest expansions', 'Require ID and tighten registration deadlines', 'Election day only with strict ID requirements', 29),
('Government', 'Should lobbying and campaign finance be reformed?', 'Publicly fund all campaigns and ban corporate donations', 'Cap donations and increase disclosure requirements', 'Keep current rules but enforce them better', 'Remove all donation limits as a free speech issue', 30)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_civic_quiz_questions_category ON civic_quiz_questions(issue_category);
CREATE INDEX IF NOT EXISTS idx_user_quiz_answers_user ON user_quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_quiz_answers_candidate ON candidate_quiz_answers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_quiz_answers_status ON candidate_quiz_answers(status);
