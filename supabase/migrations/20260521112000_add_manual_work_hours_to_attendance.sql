ALTER TABLE public.attendance_entries
ADD COLUMN IF NOT EXISTS manual_work_hours NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_entries_manual_work_hours_check'
  ) THEN
    ALTER TABLE public.attendance_entries
    ADD CONSTRAINT attendance_entries_manual_work_hours_check
    CHECK (manual_work_hours IS NULL OR (manual_work_hours >= 0.5 AND manual_work_hours <= 24));
  END IF;
END
$$;

