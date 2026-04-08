-- Align employee dashboard writes with the live documents and leave_requests
-- constraints so both fresh installs and the linked legacy project accept the
-- same payload shape.

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.leave_requests
ADD COLUMN IF NOT EXISTS days INTEGER;

ALTER TABLE public.leave_requests
ADD COLUMN IF NOT EXISTS type TEXT;

ALTER TABLE public.leave_requests
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'storage_path'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.documents ALTER COLUMN storage_path SET DEFAULT ''$sql$;
    EXECUTE $sql$
      UPDATE public.documents
      SET storage_path = COALESCE(NULLIF(storage_path, ''), NULLIF(file_url, ''), NULLIF(file_name, ''), '')
      WHERE storage_path IS NULL OR storage_path = ''
    $sql$;
    EXECUTE $sql$ALTER TABLE public.documents ALTER COLUMN storage_path SET NOT NULL$sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'uploaded_by'
  ) THEN
    EXECUTE $sql$
      UPDATE public.documents
      SET uploaded_by = COALESCE(uploaded_by, user_id)
      WHERE uploaded_by IS NULL AND user_id IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'employee_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.documents AS document
      SET employee_id = employee_profile.id
      FROM public.employee_profiles AS employee_profile
      WHERE employee_profile.user_id = document.user_id
        AND (document.employee_id IS NULL OR document.employee_id <> employee_profile.id)
    $sql$;
    EXECUTE $sql$ALTER TABLE public.documents ALTER COLUMN employee_id DROP NOT NULL$sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'status'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.leave_requests ALTER COLUMN status SET DEFAULT 'pending'$sql$;
    EXECUTE $sql$
      UPDATE public.leave_requests
      SET status = 'pending'
      WHERE status IS NULL OR status = ''
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'type'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.leave_requests ALTER COLUMN type SET DEFAULT 'annual'$sql$;
    EXECUTE $sql$
      UPDATE public.leave_requests
      SET type = COALESCE(NULLIF(type, ''), NULLIF(leave_type, ''), 'annual')
      WHERE type IS NULL OR type = ''
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'days'
  ) THEN
    EXECUTE $sql$ALTER TABLE public.leave_requests ALTER COLUMN days SET DEFAULT 1$sql$;
    EXECUTE $sql$
      UPDATE public.leave_requests
      SET days = GREATEST(((end_date::date - start_date::date) + 1), 1)
      WHERE days IS NULL OR days < 1
    $sql$;
    EXECUTE $sql$ALTER TABLE public.leave_requests ALTER COLUMN days SET NOT NULL$sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'employee_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.leave_requests AS leave_request
      SET employee_id = employee_profile.id
      FROM public.employee_profiles AS employee_profile
      WHERE employee_profile.user_id = leave_request.user_id
        AND (leave_request.employee_id IS NULL OR leave_request.employee_id <> employee_profile.id)
    $sql$;
    EXECUTE $sql$ALTER TABLE public.leave_requests ALTER COLUMN employee_id DROP NOT NULL$sql$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documents_employee_id_idx ON public.documents(employee_id);
CREATE INDEX IF NOT EXISTS leave_requests_employee_id_idx ON public.leave_requests(employee_id);
