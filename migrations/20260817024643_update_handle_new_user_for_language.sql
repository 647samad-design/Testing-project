-- Update handle_new_user to also populate language_preference from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, language_preference)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'language_preference', 'en')
  );
  RETURN new;
END;
$$;

-- Allow users to insert their own language_preference on signup
-- (the trigger runs as SECURITY DEFINER, but we keep grants consistent)
REVOKE INSERT (id, full_name, zip_code, theme_preference) ON profiles FROM anon, authenticated;
GRANT INSERT (id, full_name, zip_code, theme_preference, language_preference) ON profiles TO anon, authenticated;

-- Allow users to update their own language_preference
GRANT UPDATE (full_name, zip_code, theme_preference, language_preference) ON profiles TO authenticated;
