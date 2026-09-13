-- Add language preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language_preference text DEFAULT 'en';

-- Allow users to update their own language_preference
-- (RLS already restricts updates to own row; column grant only)
GRANT UPDATE (language_preference) ON profiles TO authenticated;
