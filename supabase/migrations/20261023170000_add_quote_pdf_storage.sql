-- Archivos PDF originales de los presupuestos, privados por usuario.
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-files', 'quote-files', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS original_file_path TEXT,
  ADD COLUMN IF NOT EXISTS original_file_name TEXT,
  ADD COLUMN IF NOT EXISTS original_file_type TEXT;

CREATE POLICY "quote_files_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'quote-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "quote_files_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quote-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "quote_files_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'quote-files' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'quote-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "quote_files_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'quote-files' AND (storage.foldername(name))[1] = auth.uid()::text);
