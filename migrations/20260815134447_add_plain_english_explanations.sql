/*
# Add plain-English explanation columns for bills and ballot measures

## Summary
Many people find political bills and ballot measures hard to understand because they're
written in legal language. This migration adds two new text columns:
1. `plain_english_summary` — a simple adult-level summary of what the bill/measure does
2. `eli5_explanation` — an "Explain Like I'm 5" breakdown using everyday analogies

## Modified Tables
### voting_records
- `plain_english_summary` (text, nullable) — plain-English summary of what the bill does
- `eli5_explanation` (text, nullable) — elementary-school-level explanation using simple analogies

### ballot_measures
- `plain_english_summary` (text, nullable) — plain-English summary of what the measure does
- `eli5_explanation` (text, nullable) — elementary-school-level explanation using simple analogies

## Security
- No new policies needed — these columns inherit existing RLS policies on their tables
- No new tables created

## Notes
- Safe to re-run (uses IF NOT EXISTS checks)
- Both columns are nullable so existing rows won't break
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voting_records' AND column_name = 'plain_english_summary'
  ) THEN
    ALTER TABLE voting_records ADD COLUMN plain_english_summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voting_records' AND column_name = 'eli5_explanation'
  ) THEN
    ALTER TABLE voting_records ADD COLUMN eli5_explanation text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ballot_measures' AND column_name = 'plain_english_summary'
  ) THEN
    ALTER TABLE ballot_measures ADD COLUMN plain_english_summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ballot_measures' AND column_name = 'eli5_explanation'
  ) THEN
    ALTER TABLE ballot_measures ADD COLUMN eli5_explanation text;
  END IF;
END $$;
