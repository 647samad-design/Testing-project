/*
# Candidate photo storage bucket

## Purpose
Create the `candidate-photos` Supabase Storage bucket used by the admin panel's
and candidate portal's photo upload UI, with RLS so:
- Anyone can view photos (public-facing candidate profiles need this).
- Only admins, or the verified claimant of that specific candidate profile, can
  upload/replace/delete a photo — matching folder-per-candidate-id convention
  used by the upload component (`{candidate_id}/{filename}`).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candidate-photos', 'candidate-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_candidate_photos" ON storage.objects;
CREATE POLICY "public_read_candidate_photos" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'candidate-photos');

DROP POLICY IF EXISTS "admin_or_claimant_write_candidate_photos" ON storage.objects;
CREATE POLICY "admin_or_claimant_write_candidate_photos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'candidate-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM candidate_claims c
        WHERE c.user_id = auth.uid()
          AND c.status = 'verified'
          AND c.candidate_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "admin_or_claimant_update_candidate_photos" ON storage.objects;
CREATE POLICY "admin_or_claimant_update_candidate_photos" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'candidate-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM candidate_claims c
        WHERE c.user_id = auth.uid()
          AND c.status = 'verified'
          AND c.candidate_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "admin_or_claimant_delete_candidate_photos" ON storage.objects;
CREATE POLICY "admin_or_claimant_delete_candidate_photos" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'candidate-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM candidate_claims c
        WHERE c.user_id = auth.uid()
          AND c.status = 'verified'
          AND c.candidate_id::text = (storage.foldername(name))[1]
      )
    )
  );
