-- Compatibility wrapper for clients that call:
-- public.record_my_break(p_company_id, p_minutes, p_mode)
-- while canonical function is:
-- public.record_my_break(p_company_id, p_mode, p_minutes)

CREATE OR REPLACE FUNCTION public.record_my_break(
  p_company_id UUID,
  p_minutes INTEGER,
  p_mode TEXT
)
RETURNS public.attendance_entries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.record_my_break(
    p_company_id => p_company_id,
    p_mode => p_mode,
    p_minutes => p_minutes
  );
$$;

REVOKE ALL ON FUNCTION public.record_my_break(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_my_break(UUID, INTEGER, TEXT) TO authenticated;
