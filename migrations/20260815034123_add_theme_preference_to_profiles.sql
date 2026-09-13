/*
# Add theme_preference column to profiles

1. Modified Tables
- `profiles` — adds `theme_preference` column (text, defaults to 'personal')
  - Valid values: 'personal' (the warm teal/coral default) and 'usa' (navy/red patriotic theme)
  - Stored per-user so the app remembers the selected look
2. Security
- No new policies needed — the column is user-owned via existing profiles RLS
3. Notes
- Safe to re-run (uses IF NOT EXISTS)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'theme_preference'
  ) THEN
    ALTER TABLE profiles ADD COLUMN theme_preference text NOT NULL DEFAULT 'personal';
  END IF;
END $$;
