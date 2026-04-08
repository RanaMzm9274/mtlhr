-- Fix missing employee profile rows and legacy NOT NULL columns that still
-- exist on the linked project schema.

INSERT INTO public.employee_profiles (
  user_id,
  name,
  email,
  position,
  status,
  profile_completed
)
SELECT
  auth_user.id,
  COALESCE(auth_user.raw_user_meta_data ->> 'name', auth_user.raw_user_meta_data ->> 'full_name', ''),
  COALESCE(auth_user.email, ''),
  COALESCE(auth_user.raw_user_meta_data ->> 'position', ''),
  CASE
    WHEN auth_user.last_sign_in_at IS NULL THEN 'invited'
    ELSE 'active'
  END,
  false
FROM auth.users AS auth_user
WHERE NOT EXISTS (
  SELECT 1
  FROM public.employee_profiles AS employee_profile
  WHERE employee_profile.user_id = auth_user.id
);

DROP POLICY IF EXISTS "Employees can create own profile" ON public.employee_profiles;
CREATE POLICY "Employees can create own profile"
ON public.employee_profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

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
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'days'
  ) THEN
    EXECUTE 'ALTER TABLE public.leave_requests ALTER COLUMN days SET DEFAULT 1';
    EXECUTE $sql$
      UPDATE public.leave_requests
      SET days = GREATEST(((end_date::date - start_date::date) + 1), 1)
      WHERE days IS NULL OR days < 1
    $sql$;
  END IF;
END $$;
