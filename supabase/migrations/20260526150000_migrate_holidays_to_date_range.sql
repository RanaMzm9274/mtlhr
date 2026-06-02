ALTER TABLE public.company_holidays
ADD COLUMN IF NOT EXISTS date_from DATE,
ADD COLUMN IF NOT EXISTS date_to DATE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_holidays'
      AND column_name = 'holiday_date'
  ) THEN
    EXECUTE '
      UPDATE public.company_holidays
      SET
        date_from = COALESCE(date_from, holiday_date),
        date_to = COALESCE(date_to, holiday_date)
    ';
  END IF;
END $$;

UPDATE public.company_holidays
SET
  date_from = COALESCE(date_from, date_to),
  date_to = COALESCE(date_to, date_from)
WHERE date_from IS NULL OR date_to IS NULL;

ALTER TABLE public.company_holidays
ALTER COLUMN date_from SET NOT NULL,
ALTER COLUMN date_to SET NOT NULL;

ALTER TABLE public.company_holidays
DROP CONSTRAINT IF EXISTS company_holidays_company_id_holiday_date_name_key;

ALTER TABLE public.company_holidays
ADD CONSTRAINT company_holidays_company_id_date_range_name_key
UNIQUE (company_id, date_from, date_to, name);

DROP INDEX IF EXISTS idx_company_holidays_company_date;
CREATE INDEX IF NOT EXISTS idx_company_holidays_company_date
ON public.company_holidays(company_id, date_from, date_to);
