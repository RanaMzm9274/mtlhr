ALTER TABLE public.employee_profiles
ADD COLUMN IF NOT EXISTS shift_start TIME,
ADD COLUMN IF NOT EXISTS shift_end TIME;

UPDATE public.employee_profiles
SET
  shift_start = COALESCE(shift_start, '09:00'::time),
  shift_end = COALESCE(shift_end, '17:00'::time);
