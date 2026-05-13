BEGIN;

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS workday_start TIME,
ADD COLUMN IF NOT EXISTS workday_end TIME;

CREATE TABLE IF NOT EXISTS public.attendance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  scheduled_start TIME,
  scheduled_end TIME,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON public.attendance_entries(company_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON public.attendance_entries(user_id, work_date);

CREATE OR REPLACE FUNCTION public.validate_attendance_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.work_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Attendance can only be recorded for past or present dates.';
  END IF;

  IF NEW.check_in_at IS NOT NULL AND NEW.check_in_at > now() THEN
    RAISE EXCEPTION 'Check-in cannot be in the future.';
  END IF;

  IF NEW.check_out_at IS NOT NULL AND NEW.check_out_at > now() THEN
    RAISE EXCEPTION 'Check-out cannot be in the future.';
  END IF;

  IF NEW.check_in_at IS NOT NULL AND NEW.check_out_at IS NOT NULL AND NEW.check_out_at < NEW.check_in_at THEN
    RAISE EXCEPTION 'Check-out cannot be earlier than check-in.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_attendance_entry ON public.attendance_entries;
CREATE TRIGGER trg_validate_attendance_entry
BEFORE INSERT OR UPDATE ON public.attendance_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_entry();

DROP TRIGGER IF EXISTS update_attendance_entries_updated_at ON public.attendance_entries;
CREATE TRIGGER update_attendance_entries_updated_at
BEFORE UPDATE ON public.attendance_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendance select scoped"
ON public.attendance_entries FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Attendance insert scoped"
ON public.attendance_entries FOR INSERT
WITH CHECK (
  (auth.uid() = user_id AND company_id = public.get_user_company_id(auth.uid()))
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Attendance update scoped"
ON public.attendance_entries FOR UPDATE
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Company update by company admin" ON public.companies;
CREATE POLICY "Company update by company admin"
ON public.companies FOR UPDATE
USING (public.is_company_admin(auth.uid(), id));

COMMIT;
