-- The linked project still contains legacy public.profiles foreign keys on
-- documents and leave_requests. Keep that legacy schema in sync with auth users
-- and employee_profiles so the portal can write modern user_id-based payloads.

CREATE OR REPLACE FUNCTION public.ensure_legacy_profile_reference(
  target_user_id UUID,
  fallback_email TEXT DEFAULT NULL,
  fallback_name TEXT DEFAULT NULL,
  fallback_title TEXT DEFAULT NULL,
  fallback_role TEXT DEFAULT 'employee'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  resolved_profile_id UUID;
  resolved_email TEXT;
  resolved_name TEXT;
  resolved_title TEXT;
  resolved_role TEXT := COALESCE(NULLIF(fallback_role, ''), 'employee');
BEGIN
  IF target_user_id IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(NULLIF(auth_user.email, ''), NULLIF(fallback_email, ''), ''),
    COALESCE(NULLIF(auth_user.raw_user_meta_data ->> 'name', ''), NULLIF(auth_user.raw_user_meta_data ->> 'full_name', ''), NULLIF(fallback_name, ''), split_part(COALESCE(auth_user.email, fallback_email, ''), '@', 1), ''),
    COALESCE(NULLIF(auth_user.raw_user_meta_data ->> 'position', ''), NULLIF(fallback_title, ''), '')
  INTO resolved_email, resolved_name, resolved_title
  FROM auth.users AS auth_user
  WHERE auth_user.id = target_user_id;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = target_user_id
      AND role = 'admin'
  ) THEN
    resolved_role := 'admin';
  END IF;

  SELECT profiles.id
  INTO resolved_profile_id
  FROM public.profiles AS profiles
  WHERE profiles.auth_user_id = target_user_id
  LIMIT 1;

  IF resolved_profile_id IS NULL AND resolved_email <> '' THEN
    UPDATE public.profiles AS profiles
    SET
      auth_user_id = target_user_id,
      email = COALESCE(NULLIF(profiles.email, ''), resolved_email),
      name = COALESCE(NULLIF(profiles.name, ''), resolved_name),
      title = COALESCE(NULLIF(profiles.title, ''), resolved_title),
      role = COALESCE(NULLIF(profiles.role, ''), resolved_role),
      updated_at = timezone('utc'::text, now())
    WHERE LOWER(profiles.email) = LOWER(resolved_email)
    RETURNING profiles.id INTO resolved_profile_id;
  END IF;

  IF resolved_profile_id IS NULL THEN
    INSERT INTO public.profiles (
      auth_user_id,
      role,
      name,
      title,
      status,
      email
    )
    VALUES (
      target_user_id,
      resolved_role,
      resolved_name,
      resolved_title,
      'Active',
      resolved_email
    )
    RETURNING id INTO resolved_profile_id;
  END IF;

  RETURN resolved_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_employee_profile_to_legacy_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  legacy_profile_id UUID;
  legacy_status TEXT;
BEGIN
  IF NEW.user_id IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RETURN NEW;
  END IF;

  legacy_profile_id := public.ensure_legacy_profile_reference(
    NEW.user_id,
    NEW.email,
    NEW.name,
    NEW.position,
    'employee'
  );

  legacy_status := CASE LOWER(COALESCE(NEW.status, 'active'))
    WHEN 'inactive' THEN 'Inactive'
    WHEN 'invited' THEN 'Invited'
    ELSE 'Active'
  END;

  UPDATE public.profiles AS profiles
  SET
    auth_user_id = NEW.user_id,
    role = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = NEW.user_id
          AND role = 'admin'
      ) THEN 'admin'
      ELSE 'employee'
    END,
    email = COALESCE(NULLIF(NEW.email, ''), profiles.email),
    name = COALESCE(NULLIF(NEW.name, ''), profiles.name),
    title = COALESCE(NULLIF(NEW.position, ''), profiles.title),
    status = legacy_status,
    updated_at = timezone('utc'::text, now())
  WHERE profiles.id = legacy_profile_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_documents_legacy_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  legacy_profile_id UUID;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    legacy_profile_id := public.ensure_legacy_profile_reference(NEW.user_id, NULL, NULL, NULL, 'employee');
    IF legacy_profile_id IS NOT NULL THEN
      NEW.employee_id := legacy_profile_id;
      NEW.uploaded_by := legacy_profile_id;
    END IF;
  END IF;

  NEW.file_url := COALESCE(NULLIF(NEW.file_url, ''), NULLIF(NEW.storage_path, ''), NULLIF(NEW.file_name, ''), '');
  NEW.storage_path := COALESCE(NULLIF(NEW.storage_path, ''), NULLIF(NEW.file_url, ''), NULLIF(NEW.file_name, ''), '');
  NEW.category := LOWER(COALESCE(NULLIF(NEW.category, ''), 'certificate'));
  NEW.uploaded_at := COALESCE(NEW.uploaded_at, timezone('utc'::text, now()));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_leave_requests_legacy_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  legacy_profile_id UUID;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    legacy_profile_id := public.ensure_legacy_profile_reference(NEW.user_id, NULL, NULL, NULL, 'employee');
    IF legacy_profile_id IS NOT NULL THEN
      NEW.employee_id := legacy_profile_id;
    END IF;
  END IF;

  NEW.leave_type := LOWER(COALESCE(NULLIF(NEW.leave_type, ''), NULLIF(NEW.type, ''), 'annual'));
  NEW.type := NEW.leave_type;
  NEW.reason := COALESCE(NEW.reason, '');
  NEW.status := LOWER(COALESCE(NULLIF(NEW.status, ''), 'pending'));
  NEW.admin_comment := COALESCE(NEW.admin_comment, NEW.admin_remark, '');
  NEW.admin_remark := COALESCE(NEW.admin_remark, NEW.admin_comment, '');

  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND (NEW.days IS NULL OR NEW.days::numeric < 1) THEN
    NEW.days := GREATEST(((NEW.end_date::date - NEW.start_date::date) + 1), 1);
  END IF;

  NEW.updated_at := timezone('utc'::text, now());
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, timezone('utc'::text, now()));
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.employee_profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS sync_employee_profile_to_legacy_profile ON public.employee_profiles;
    CREATE TRIGGER sync_employee_profile_to_legacy_profile
    AFTER INSERT OR UPDATE ON public.employee_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_employee_profile_to_legacy_profile();
  END IF;

  IF to_regclass('public.documents') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS sync_documents_legacy_fields ON public.documents;
    CREATE TRIGGER sync_documents_legacy_fields
    BEFORE INSERT OR UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_documents_legacy_fields();
  END IF;

  IF to_regclass('public.leave_requests') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS sync_leave_requests_legacy_fields ON public.leave_requests;
    CREATE TRIGGER sync_leave_requests_legacy_fields
    BEFORE INSERT OR UPDATE ON public.leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_leave_requests_legacy_fields();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.employee_profiles (user_id, name, email, position, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'position', ''),
    'invited'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = CASE
      WHEN COALESCE(NULLIF(public.employee_profiles.name, ''), '') = '' THEN EXCLUDED.name
      ELSE public.employee_profiles.name
    END,
    position = CASE
      WHEN COALESCE(NULLIF(public.employee_profiles.position, ''), '') = '' THEN EXCLUDED.position
      ELSE public.employee_profiles.position
    END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.ensure_legacy_profile_reference(
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'position', ''),
    'employee'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

UPDATE public.profiles AS profiles
SET
  auth_user_id = auth_user.id,
  name = COALESCE(NULLIF(profiles.name, ''), COALESCE(auth_user.raw_user_meta_data ->> 'name', auth_user.raw_user_meta_data ->> 'full_name', split_part(auth_user.email, '@', 1))),
  title = COALESCE(NULLIF(profiles.title, ''), COALESCE(auth_user.raw_user_meta_data ->> 'position', '')),
  updated_at = timezone('utc'::text, now())
FROM auth.users AS auth_user
WHERE profiles.auth_user_id IS NULL
  AND LOWER(profiles.email) = LOWER(auth_user.email);

UPDATE public.employee_profiles
SET updated_at = timezone('utc'::text, now())
WHERE user_id IS NOT NULL;

UPDATE public.documents AS documents
SET
  user_id = COALESCE(documents.user_id, profiles.auth_user_id),
  employee_id = profiles.id,
  uploaded_by = COALESCE(documents.uploaded_by, profiles.id),
  file_url = COALESCE(NULLIF(documents.file_url, ''), NULLIF(documents.storage_path, ''), NULLIF(documents.file_name, ''), ''),
  storage_path = COALESCE(NULLIF(documents.storage_path, ''), NULLIF(documents.file_url, ''), NULLIF(documents.file_name, ''), '')
FROM public.profiles AS profiles
WHERE (
    documents.employee_id = profiles.id
    OR documents.uploaded_by = profiles.id
    OR (documents.user_id IS NOT NULL AND profiles.auth_user_id = documents.user_id)
  );

UPDATE public.leave_requests AS leave_requests
SET
  user_id = COALESCE(leave_requests.user_id, profiles.auth_user_id),
  employee_id = profiles.id,
  leave_type = LOWER(COALESCE(NULLIF(leave_requests.leave_type, ''), NULLIF(leave_requests.type, ''), 'annual')),
  type = LOWER(COALESCE(NULLIF(leave_requests.type, ''), NULLIF(leave_requests.leave_type, ''), 'annual')),
  status = LOWER(COALESCE(NULLIF(leave_requests.status, ''), 'pending')),
  admin_comment = COALESCE(leave_requests.admin_comment, leave_requests.admin_remark, ''),
  admin_remark = COALESCE(leave_requests.admin_remark, leave_requests.admin_comment, ''),
  days = CASE
    WHEN leave_requests.days IS NULL OR leave_requests.days::numeric < 1
      THEN GREATEST(((leave_requests.end_date::date - leave_requests.start_date::date) + 1), 1)
    ELSE leave_requests.days
  END,
  updated_at = timezone('utc'::text, now())
FROM public.profiles AS profiles
WHERE leave_requests.employee_id = profiles.id
   OR (leave_requests.user_id IS NOT NULL AND profiles.auth_user_id = leave_requests.user_id);

UPDATE public.leave_requests
SET
  leave_type = LOWER(COALESCE(NULLIF(leave_type, ''), NULLIF(type, ''), 'annual')),
  type = LOWER(COALESCE(NULLIF(type, ''), NULLIF(leave_type, ''), 'annual')),
  status = LOWER(COALESCE(NULLIF(status, ''), 'pending')),
  admin_comment = COALESCE(admin_comment, admin_remark, ''),
  admin_remark = COALESCE(admin_remark, admin_comment, ''),
  days = CASE
    WHEN days IS NULL OR days::numeric < 1
      THEN GREATEST(((end_date::date - start_date::date) + 1), 1)
    ELSE days
  END,
  updated_at = timezone('utc'::text, now());

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE public.leave_requests
ADD CONSTRAINT leave_requests_status_check
CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));

DROP FUNCTION IF EXISTS public.inspect_portal_table_contract(TEXT);
