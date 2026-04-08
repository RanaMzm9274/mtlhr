-- Reconcile the linked project with the schema expected by the portal UI.
-- The remote database currently has legacy columns on documents/leave_requests
-- and is missing several profile fields used across the app.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'employee');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.employee_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  position TEXT DEFAULT '',
  id_passport TEXT DEFAULT '',
  license TEXT DEFAULT '',
  profile_completed BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'invited',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'certificate',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'annual',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used BOOLEAN DEFAULT false,
  name TEXT DEFAULT '',
  position TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Shared helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Employee profiles
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'invited';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.employee_profiles AS employee_profile
SET
  name = COALESCE(NULLIF(employee_profile.name, ''), COALESCE(auth_user.raw_user_meta_data ->> 'name', auth_user.raw_user_meta_data ->> 'full_name', '')),
  email = COALESCE(NULLIF(employee_profile.email, ''), COALESCE(auth_user.email, '')),
  status = COALESCE(
    NULLIF(employee_profile.status, ''),
    CASE
      WHEN auth_user.last_sign_in_at IS NULL THEN 'invited'
      ELSE 'active'
    END
  ),
  updated_at = COALESCE(employee_profile.updated_at, employee_profile.created_at, now())
FROM auth.users AS auth_user
WHERE auth_user.id = employee_profile.user_id;

UPDATE public.employee_profiles AS employee_profile
SET profile_completed = (
  COALESCE(NULLIF(employee_profile.name, ''), '') <> ''
  AND COALESCE(NULLIF(employee_profile.email, ''), '') <> ''
  AND COALESCE(NULLIF(employee_profile.phone, ''), '') <> ''
  AND COALESCE(NULLIF(employee_profile.gender, ''), '') <> ''
  AND COALESCE(NULLIF(employee_profile.position, ''), '') <> ''
  AND COALESCE(NULLIF(employee_profile.id_passport, ''), '') <> ''
)
WHERE employee_profile.profile_completed IS NULL OR employee_profile.profile_completed = false;

DROP TRIGGER IF EXISTS update_employee_profiles_updated_at ON public.employee_profiles;
CREATE TRIGGER update_employee_profiles_updated_at
BEFORE UPDATE ON public.employee_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Employees can view own profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employees can update own profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.employee_profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.employee_profiles;

ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own profile"
ON public.employee_profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Employees can update own profile"
ON public.employee_profiles
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
ON public.employee_profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage profiles"
ON public.employee_profiles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'certificate';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'employee_id'
  ) THEN
    EXECUTE '
      UPDATE public.documents
      SET user_id = COALESCE(user_id, employee_id)
      WHERE user_id IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'uploaded_by'
  ) THEN
    EXECUTE '
      UPDATE public.documents
      SET user_id = COALESCE(user_id, uploaded_by)
      WHERE user_id IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'created_at'
  ) THEN
    EXECUTE '
      UPDATE public.documents
      SET uploaded_at = COALESCE(uploaded_at, created_at)
      WHERE uploaded_at IS NULL
    ';
  END IF;
END $$;

UPDATE public.documents
SET
  file_url = COALESCE(NULLIF(file_url, ''), COALESCE(file_name, '')),
  category = COALESCE(
    NULLIF(category, ''),
    CASE
      WHEN LOWER(COALESCE(file_name, '')) LIKE '%cv%' OR LOWER(COALESCE(file_name, '')) LIKE '%resume%' THEN 'cv'
      WHEN LOWER(COALESCE(file_name, '')) LIKE '%passport%' OR LOWER(COALESCE(file_name, '')) LIKE '%id%' THEN 'id_proof'
      ELSE 'certificate'
    END
  ),
  uploaded_at = COALESCE(uploaded_at, now())
WHERE file_url = '' OR category = '' OR uploaded_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents(user_id);

DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
ON public.documents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can upload documents"
ON public.documents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
ON public.documents
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all documents"
ON public.documents
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all documents" ON storage.objects;

CREATE POLICY "Users can upload own documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND public.has_role(auth.uid(), 'admin')
);

-- Leave requests
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS leave_type TEXT DEFAULT 'annual';
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS admin_comment TEXT DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'employee_id'
  ) THEN
    EXECUTE '
      UPDATE public.leave_requests
      SET user_id = COALESCE(user_id, employee_id)
      WHERE user_id IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'type'
  ) THEN
    EXECUTE $sql$
      UPDATE public.leave_requests
      SET leave_type = COALESCE(NULLIF(leave_type, ''), type)
      WHERE leave_type IS NULL OR leave_type = ''
    $sql$;
  END IF;
END $$;

UPDATE public.leave_requests
SET
  admin_comment = COALESCE(admin_comment, ''),
  leave_type = COALESCE(NULLIF(leave_type, ''), 'annual')
WHERE admin_comment IS NULL OR leave_type IS NULL OR leave_type = '';

CREATE INDEX IF NOT EXISTS leave_requests_user_id_idx ON public.leave_requests(user_id);

DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER update_leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users can view own leaves" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can create leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can view all leaves" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can update leaves" ON public.leave_requests;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own leaves"
ON public.leave_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create leave requests"
ON public.leave_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all leaves"
ON public.leave_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update leaves"
ON public.leave_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS position TEXT DEFAULT '';

DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Anyone can read invitations by token" ON public.invitations;
DROP POLICY IF EXISTS "Block public invitation reads" ON public.invitations;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations"
ON public.invitations
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Block public invitation reads"
ON public.invitations
FOR SELECT
USING (false);

-- Auth signup profile bootstrap
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
