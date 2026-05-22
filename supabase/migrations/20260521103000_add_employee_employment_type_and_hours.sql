ALTER TABLE public.employee_profiles
ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'full_time',
ADD COLUMN IF NOT EXISTS working_hours NUMERIC(4,2);

UPDATE public.employee_profiles
SET
  employment_type = COALESCE(NULLIF(employment_type, ''), 'full_time'),
  working_hours = CASE
    WHEN COALESCE(NULLIF(employment_type, ''), 'full_time') = 'part_time' THEN COALESCE(working_hours, 6)
    ELSE COALESCE(working_hours, 9)
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_profiles_employment_type_check'
  ) THEN
    ALTER TABLE public.employee_profiles
    ADD CONSTRAINT employee_profiles_employment_type_check
    CHECK (employment_type IN ('full_time', 'part_time'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_profiles_working_hours_check'
  ) THEN
    ALTER TABLE public.employee_profiles
    ADD CONSTRAINT employee_profiles_working_hours_check
    CHECK (working_hours IS NULL OR (working_hours >= 1 AND working_hours <= 12));
  END IF;
END
$$;

