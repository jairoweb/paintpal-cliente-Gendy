ALTER TABLE public.quotes ADD COLUMN original_file_path text, ADD COLUMN original_file_name text, ADD COLUMN original_file_type text;

-- Path convention: {user_id}/{client_id}/{quote_id}/{filename}
CREATE POLICY "quote_files_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "quote_files_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.user_id = auth.uid()
      AND q.client_id::text = (storage.foldername(name))[2]
      AND q.id::text = (storage.foldername(name))[3]
  )
);

CREATE POLICY "quote_files_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-files' AND (storage.foldername(name))[1] = auth.uid()::text);