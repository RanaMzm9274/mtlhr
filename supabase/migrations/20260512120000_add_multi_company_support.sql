BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_status') THEN
    CREATE TYPE public.company_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status public.company_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.company_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  UNIQUE (company_id, user_id),
  UNIQUE (user_id)
);

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_employee_profiles_company_id ON public.employee_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON public.documents(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_company_id ON public.leave_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_invites_company_id ON public.invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_memberships_company_user ON public.company_memberships(company_id, user_id);

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.company_memberships
  WHERE user_id = _user_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_memberships cm
    JOIN public.user_roles ur ON ur.user_id = cm.user_id
    JOIN public.companies c ON c.id = cm.company_id
    WHERE cm.user_id = _user_id
      AND cm.company_id = _company_id
      AND cm.status = 'approved'
      AND c.status = 'approved'
      AND ur.role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.set_company_id_from_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.company_id := public.get_user_company_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_id_employee_profiles ON public.employee_profiles;
CREATE TRIGGER set_company_id_employee_profiles
BEFORE INSERT OR UPDATE ON public.employee_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_membership();

DROP TRIGGER IF EXISTS set_company_id_documents ON public.documents;
CREATE TRIGGER set_company_id_documents
BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_membership();

DROP TRIGGER IF EXISTS set_company_id_leave_requests ON public.leave_requests;
CREATE TRIGGER set_company_id_leave_requests
BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_membership();

-- Backfill a default company for existing single-tenant data
INSERT INTO public.companies (name, slug, status)
SELECT 'Default Company', 'default-company', 'approved'::public.company_status
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

WITH default_company AS (
  SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1
)
UPDATE public.company_memberships cm
SET company_id = default_company.id
FROM default_company
WHERE cm.company_id IS NULL;

WITH default_company AS (
  SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1
)
INSERT INTO public.company_memberships (company_id, user_id, status, approved_at)
SELECT default_company.id, ur.user_id, 'approved', now()
FROM public.user_roles ur
CROSS JOIN default_company
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_memberships cm WHERE cm.user_id = ur.user_id
)
ON CONFLICT (user_id) DO NOTHING;

WITH default_company AS (
  SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1
)
UPDATE public.employee_profiles ep
SET company_id = default_company.id
FROM default_company
WHERE ep.company_id IS NULL;

WITH default_company AS (
  SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1
)
UPDATE public.documents d
SET company_id = COALESCE(d.company_id, ep.company_id, default_company.id)
FROM public.employee_profiles ep, default_company
WHERE d.user_id = ep.user_id
  AND d.company_id IS NULL;

WITH default_company AS (
  SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1
)
UPDATE public.leave_requests lr
SET company_id = COALESCE(lr.company_id, ep.company_id, default_company.id)
FROM public.employee_profiles ep, default_company
WHERE lr.user_id = ep.user_id
  AND lr.company_id IS NULL;

WITH default_company AS (
  SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1
)
UPDATE public.invitations i
SET company_id = default_company.id
FROM default_company
WHERE i.company_id IS NULL;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles in company" ON public.user_roles;
CREATE POLICY "Users can view roles in company"
ON public.user_roles FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR (
    public.get_user_company_id(auth.uid()) = public.get_user_company_id(user_roles.user_id)
    AND public.is_company_admin(auth.uid(), public.get_user_company_id(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Employees can view own profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employees can update own profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.employee_profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employees can create own profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employee profiles company scoped" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employee profiles self insert" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employee profiles update" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employee profiles delete" ON public.employee_profiles;
CREATE POLICY "Employee profiles company scoped"
ON public.employee_profiles FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);
CREATE POLICY "Employee profiles self insert"
ON public.employee_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));
CREATE POLICY "Employee profiles update"
ON public.employee_profiles FOR UPDATE
USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));
CREATE POLICY "Employee profiles delete"
ON public.employee_profiles FOR DELETE
USING (public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Documents company scoped select" ON public.documents;
DROP POLICY IF EXISTS "Documents insert" ON public.documents;
DROP POLICY IF EXISTS "Documents delete" ON public.documents;
CREATE POLICY "Documents company scoped select"
ON public.documents FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);
CREATE POLICY "Documents insert"
ON public.documents FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));
CREATE POLICY "Documents delete"
ON public.documents FOR DELETE
USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "Users can view own leaves" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can create leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can view all leaves" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can update leaves" ON public.leave_requests;
DROP POLICY IF EXISTS "Leaves company scoped select" ON public.leave_requests;
DROP POLICY IF EXISTS "Leaves insert" ON public.leave_requests;
DROP POLICY IF EXISTS "Leaves update" ON public.leave_requests;
CREATE POLICY "Leaves company scoped select"
ON public.leave_requests FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);
CREATE POLICY "Leaves insert"
ON public.leave_requests FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));
CREATE POLICY "Leaves update"
ON public.leave_requests FOR UPDATE
USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Invitations company scoped" ON public.invitations;
CREATE POLICY "Invitations company scoped"
ON public.invitations FOR ALL
USING (public.is_super_admin(auth.uid()) OR public.is_company_admin(auth.uid(), company_id));

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company read policy" ON public.companies;
CREATE POLICY "Company read policy"
ON public.companies FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_memberships cm
    WHERE cm.company_id = companies.id AND cm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company insert by creator" ON public.companies;
CREATE POLICY "Company insert by creator"
ON public.companies FOR INSERT
WITH CHECK (created_by = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Company update by super admin" ON public.companies;
CREATE POLICY "Company update by super admin"
ON public.companies FOR UPDATE
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Membership read policy" ON public.company_memberships;
CREATE POLICY "Membership read policy"
ON public.company_memberships FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Membership insert policy" ON public.company_memberships;
CREATE POLICY "Membership insert policy"
ON public.company_memberships FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Membership update policy" ON public.company_memberships;
CREATE POLICY "Membership update policy"
ON public.company_memberships FOR UPDATE
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_company_name TEXT;
  requested_slug TEXT;
  requested_company_id UUID;
BEGIN
  requested_company_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'company_name', '')), '');
  requested_slug := regexp_replace(lower(COALESCE(requested_company_name, '')), '[^a-z0-9]+', '-', 'g');
  requested_slug := trim(BOTH '-' FROM requested_slug);

  IF requested_company_name IS NOT NULL THEN
    IF requested_slug = '' THEN
      requested_slug := 'company-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8);
    END IF;

    INSERT INTO public.companies (name, slug, status, created_by)
    VALUES (requested_company_name, requested_slug, 'pending', NEW.id)
    ON CONFLICT (slug) DO UPDATE
      SET updated_at = now()
    RETURNING id INTO requested_company_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.company_memberships (company_id, user_id, status)
    VALUES (requested_company_id, NEW.id, 'pending')
    ON CONFLICT (user_id) DO UPDATE
      SET company_id = EXCLUDED.company_id, status = 'pending';
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'employee')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.employee_profiles (user_id, name, email, position, status, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'position', ''),
    CASE WHEN requested_company_name IS NOT NULL THEN 'pending' ELSE 'invited' END,
    requested_company_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    company_id = COALESCE(public.employee_profiles.company_id, EXCLUDED.company_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

