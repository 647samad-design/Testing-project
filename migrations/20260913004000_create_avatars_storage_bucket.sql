/*
# Profile photo upload always failed: the "avatars" bucket never existed

The Account page uploads profile photos to storage bucket "avatars"
(uploadProfilePhoto), but no migration ever created that bucket, so every
upload returned 400 Bad Request (bucket not found) -- and the page ignored the
error, so nothing was shown. (Candidate photos use the separate
"candidate-photos" bucket, which does exist.)

Bucket: public read (profile photos are shown on the site), 5 MB, JPEG/PNG/WebP.
Writes: a signed-in user may only add, replace or delete files inside their own
folder, "<their user id>/...".
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;
CREATE POLICY "public_read_avatars" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "own_folder_insert_avatars" ON storage.objects;
CREATE POLICY "own_folder_insert_avatars" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "own_folder_update_avatars" ON storage.objects;
CREATE POLICY "own_folder_update_avatars" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "own_folder_delete_avatars" ON storage.objects;
CREATE POLICY "own_folder_delete_avatars" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
  );
