CREATE TABLE IF NOT EXISTS public.company_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, date_from, date_to, name)
);

CREATE INDEX IF NOT EXISTS idx_company_holidays_company_date
ON public.company_holidays(company_id, date_from, date_to);

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company holidays select scoped" ON public.company_holidays;
CREATE POLICY "Company holidays select scoped"
ON public.company_holidays
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
  OR public.get_user_company_id(auth.uid()) = company_id
);

DROP POLICY IF EXISTS "Company holidays insert admin" ON public.company_holidays;
CREATE POLICY "Company holidays insert admin"
ON public.company_holidays
FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Company holidays update admin" ON public.company_holidays;
CREATE POLICY "Company holidays update admin"
ON public.company_holidays
FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Company holidays delete admin" ON public.company_holidays;
CREATE POLICY "Company holidays delete admin"
ON public.company_holidays
FOR DELETE
USING (
  public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
);
