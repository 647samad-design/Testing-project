/*
# Backend Architecture: Candidates Refactor + Candidate Elections + Questionnaires

## Purpose
Extend the existing `candidates` table with structured fields, create `candidate_elections`
junction table, and build the questionnaire system (questionnaires, questions, answers).

## Modified Tables

### `candidates` (ALTER — no data loss)
- Add `middle_name` (text, nullable)
- Add `suffix` (text, nullable) — e.g., "Jr.", "III"
- Add `display_name` (text, nullable) — computed display name
- Add `email` (text, nullable) — campaign email
- Add `phone` (text, nullable) — campaign phone
- Add `current_office_id` (uuid, nullable, FK → offices)
- Add `current_district_id` (uuid, nullable, FK → districts)
- Add `is_incumbent` (boolean, default false)
- Add `verification_status` (text, default 'unverified') — unverified, pending, verified, rejected
- Add `profile_status` (text, default 'draft') — draft, pending_review, published, archived
- Add `deleted_at` (timestamptz, nullable) — soft delete

## New Tables

### `candidate_elections`
- Links candidates to specific elections + offices
- `id` (uuid PK)
- `candidate_id` (uuid FK → candidates)
- `election_id` (uuid FK → elections)
- `office_id` (uuid FK → offices)
- `district_id` (uuid, nullable, FK → districts)
- `ballot_position` (integer, nullable) — official ballot order only
- `created_at` (timestamptz)
- UNIQUE(candidate_id, election_id, office_id)

### `questionnaires`
- `id` (uuid PK), `title`, `description`, `version` (default 1), `is_active`, `created_at`

### `questionnaire_questions`
- `id` (uuid PK), `questionnaire_id` FK, `question_text`, `issue_category`, `question_order`, `created_at`

### `candidate_questionnaire_answers`
- `id` (uuid PK), `candidate_id` FK, `question_id` FK, `answer`, `submitted_by` FK → profiles,
  `status` (pending/approved/rejected), `approved_by`, `approved_at`, `created_at`, `updated_at`
- UNIQUE(candidate_id, question_id)

## Security
- `candidates`: public read stays; admin write stays; candidate self-write via submissions
- `candidate_elections`: public read, admin-only write
- `questionnaires` + `questionnaire_questions`: public read (active), admin-only write
- `candidate_questionnaire_answers`: public read (approved only), candidate can submit own (pending),
  admin can update/approve

## Notes
1. Existing candidate columns (first_name, last_name, party, photo_url, bio, etc.) are preserved.
2. `ballot_position` is NOT for ranking — it represents official ballot order only.
3. Candidate answers are labeled as candidate-provided information.
4. Verification status and profile status are admin-controlled, not user-editable.
*/

-- Add new columns to candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS middle_name text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS suffix text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_office_id uuid REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_district_id uuid REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_incumbent boolean NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS profile_status text NOT NULL DEFAULT 'draft' CHECK (profile_status IN ('draft', 'pending_review', 'published', 'archived'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill display_name from first_name + last_name
UPDATE candidates
SET display_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
WHERE display_name IS NULL AND first_name IS NOT NULL;

-- Backfill is_incumbent from candidate_offices
UPDATE candidates c
SET is_incumbent = true
WHERE EXISTS (
  SELECT 1 FROM candidate_offices co
  WHERE co.candidate_id = c.id AND co.incumbent = true
) AND c.is_incumbent = false;

-- Candidate elections junction table
CREATE TABLE IF NOT EXISTS candidate_elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  ballot_position integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, election_id, office_id)
);

ALTER TABLE candidate_elections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_candidate_elections" ON candidate_elections;
CREATE POLICY "public_read_candidate_elections" ON candidate_elections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_candidate_elections" ON candidate_elections;
CREATE POLICY "admin_insert_candidate_elections" ON candidate_elections FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_candidate_elections" ON candidate_elections;
CREATE POLICY "admin_update_candidate_elections" ON candidate_elections FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_candidate_elections" ON candidate_elections;
CREATE POLICY "admin_delete_candidate_elections" ON candidate_elections FOR DELETE
  TO authenticated USING (is_admin());

-- Questionnaires
CREATE TABLE IF NOT EXISTS questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_questionnaires" ON questionnaires;
CREATE POLICY "public_read_questionnaires" ON questionnaires FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_questionnaires" ON questionnaires;
CREATE POLICY "admin_write_questionnaires" ON questionnaires FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_questionnaires" ON questionnaires;
CREATE POLICY "admin_update_questionnaires" ON questionnaires FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_questionnaires" ON questionnaires;
CREATE POLICY "admin_delete_questionnaires" ON questionnaires FOR DELETE
  TO authenticated USING (is_admin());

-- Questionnaire questions
CREATE TABLE IF NOT EXISTS questionnaire_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  issue_category text,
  question_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE questionnaire_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "public_read_questionnaire_questions" ON questionnaire_questions FOR SELECT
  TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM questionnaires q WHERE q.id = questionnaire_id AND q.is_active = true)
  );

DROP POLICY IF EXISTS "admin_write_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "admin_write_questionnaire_questions" ON questionnaire_questions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "admin_update_questionnaire_questions" ON questionnaire_questions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_questionnaire_questions" ON questionnaire_questions;
CREATE POLICY "admin_delete_questionnaire_questions" ON questionnaire_questions FOR DELETE
  TO authenticated USING (is_admin());

-- Candidate questionnaire answers
CREATE TABLE IF NOT EXISTS candidate_questionnaire_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
  answer text NOT NULL,
  submitted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, question_id)
);

ALTER TABLE candidate_questionnaire_answers ENABLE ROW LEVEL SECURITY;

-- Public can read approved answers
DROP POLICY IF EXISTS "public_read_approved_answers" ON candidate_questionnaire_answers;
CREATE POLICY "public_read_approved_answers" ON candidate_questionnaire_answers FOR SELECT
  TO anon, authenticated USING (status = 'approved');

-- Candidate/team can read their own submissions (all statuses)
DROP POLICY IF EXISTS "team_read_own_answers" ON candidate_questionnaire_answers;
CREATE POLICY "team_read_own_answers" ON candidate_questionnaire_answers FOR SELECT
  TO authenticated USING (
    submitted_by = auth.uid() OR is_admin() OR
    EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = candidate_questionnaire_answers.candidate_id
      AND cc.user_id = auth.uid() AND cc.status = 'verified'
    ) OR
    EXISTS (
      SELECT 1 FROM campaign_team ct
      WHERE ct.candidate_id = candidate_questionnaire_answers.candidate_id
      AND ct.user_id = auth.uid() AND ct.status = 'active'
    )
  );

-- Candidate/team can submit answers (status starts as pending)
DROP POLICY IF EXISTS "team_insert_answers" ON candidate_questionnaire_answers;
CREATE POLICY "team_insert_answers" ON candidate_questionnaire_answers FOR INSERT
  TO authenticated WITH CHECK (
    submitted_by = auth.uid() AND
    (
      EXISTS (
        SELECT 1 FROM candidate_claims cc
        WHERE cc.candidate_id = candidate_questionnaire_answers.candidate_id
        AND cc.user_id = auth.uid() AND cc.status = 'verified'
      ) OR
      EXISTS (
        SELECT 1 FROM campaign_team ct
        WHERE ct.candidate_id = candidate_questionnaire_answers.candidate_id
        AND ct.user_id = auth.uid() AND ct.status = 'active'
      )
    )
  );

-- Admin can update (approve/reject)
DROP POLICY IF EXISTS "admin_update_answers" ON candidate_questionnaire_answers;
CREATE POLICY "admin_update_answers" ON candidate_questionnaire_answers FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Admin can delete
DROP POLICY IF EXISTS "admin_delete_answers" ON candidate_questionnaire_answers;
CREATE POLICY "admin_delete_answers" ON candidate_questionnaire_answers FOR DELETE
  TO authenticated USING (is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidates_last_name ON candidates(last_name);
CREATE INDEX IF NOT EXISTS idx_candidates_display_name ON candidates(display_name);
CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(party);
CREATE INDEX IF NOT EXISTS idx_candidates_verification ON candidates(verification_status);
CREATE INDEX IF NOT EXISTS idx_candidates_profile_status ON candidates(profile_status);
CREATE INDEX IF NOT EXISTS idx_candidate_elections_candidate ON candidate_elections(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_elections_election ON candidate_elections(election_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_q ON questionnaire_questions(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_candidate_qa_candidate ON candidate_questionnaire_answers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_qa_question ON candidate_questionnaire_answers(question_id);
