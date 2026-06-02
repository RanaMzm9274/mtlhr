BEGIN;

UPDATE public.documents
SET storage_path = regexp_replace(storage_path, '^.*?/documents/', '')
WHERE storage_path ~* '^https?://.*/documents/';

UPDATE public.documents
SET file_url = regexp_replace(file_url, '^.*?/documents/', '')
WHERE file_url ~* '^https?://.*/documents/';

DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all documents" ON storage.objects;
DROP POLICY IF EXISTS "Documents company scoped storage select" ON storage.objects;

CREATE POLICY "Documents company scoped storage select"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE (d.storage_path = storage.objects.name OR d.file_url = storage.objects.name)
        AND (
          public.is_super_admin(auth.uid())
          OR public.is_company_admin(auth.uid(), d.company_id)
        )
    )
  )
);

COMMIT;
