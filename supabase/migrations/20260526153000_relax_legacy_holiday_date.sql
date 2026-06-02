DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_holidays'
      AND column_name = 'holiday_date'
  ) THEN
    EXECUTE 'ALTER TABLE public.company_holidays ALTER COLUMN holiday_date DROP NOT NULL';
    EXECUTE '
      UPDATE public.company_holidays
      SET holiday_date = COALESCE(holiday_date, date_from)
      WHERE holiday_date IS NULL
    ';
  END IF;
END $$;
